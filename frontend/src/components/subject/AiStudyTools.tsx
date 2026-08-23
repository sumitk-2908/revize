"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Brain, FileText, LockKeyhole, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/context/AuthContext";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import {
    fetchStudySets,
    studySetsKey,
    useStudySetAvailability,
    type StudyKind,
} from "@/app/hooks/useDocumentStudySets";
import type { DocumentAiContent } from "@/app/lib/document-types";
import { InlineSpinner, SkeletonBlock } from "@/components/layout/SharedLayouts";

/**
 * The three AI artifacts, each revealed by its own Generate button.
 *
 * What a student generates is an artifact an admin already curated and
 * published — the button reveals it, it does not call a model. That is
 * deliberate: the review gate is the whole reason this content is trustworthy,
 * and the Groq free tier is 200K tokens/day for the entire organisation, so a
 * per-student model call would exhaust it in an afternoon.
 *
 * A kind with nothing published renders no button at all rather than a button
 * that fails, so there is no dead end to walk into.
 */

type Kind = "summary" | StudyKind;
type Phase = "idle" | "generating" | "ready";

type Flashcard = { question?: unknown; answer?: unknown };
type QuizQuestion = { question?: unknown; options?: unknown; correct_index?: unknown; explanation?: unknown };
type Payload = Record<string, unknown>;

const KIND_META: Record<Kind, { label: string; action: string; icon: LucideIcon }> = {
    summary: { label: "Summary", action: "Generate summary", icon: FileText },
    flashcards: { label: "Flashcards", action: "Generate flashcards", icon: BookOpen },
    quiz: { label: "Quiz", action: "Generate quiz", icon: Brain },
};

const STAGES: Record<Kind, string[]> = {
    summary: ["Reading the document...", "Pulling out the main ideas...", "Writing your summary..."],
    flashcards: ["Reading the document...", "Finding the key terms...", "Building your cards..."],
    quiz: [
        "Reading the document...",
        "Picking out testable concepts...",
        "Writing your questions...",
        "Checking the answers...",
    ],
};

const STAGE_MS = 620;

function objectPayload(content: DocumentAiContent): Payload {
    return content.payload !== null && typeof content.payload === "object" && !Array.isArray(content.payload)
        ? content.payload as Payload
        : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value : String(value ?? "");
}

function ResultHeading({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
    return (
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-primary uppercase">
            <Icon size={15} aria-hidden="true" />
            <h3>{children}</h3>
        </div>
    );
}

function FlashcardList({ payload }: { payload: Payload }) {
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (cards.length === 0) return <p className="text-sm text-muted">No flashcards came out of this one.</p>;

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {cards.map((card, index) => {
                const item = card as Flashcard;
                return (
                    <article key={index} className="rounded-xl border border-border bg-background p-4">
                        <p className="text-sm font-bold text-foreground">{text(item.question)}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{text(item.answer)}</p>
                    </article>
                );
            })}
        </div>
    );
}

function QuizList({ payload }: { payload: Payload }) {
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    if (questions.length === 0) return <p className="text-sm text-muted">No questions came out of this one.</p>;

    return (
        <div className="space-y-4">
            {questions.map((question, index) => {
                const item = question as QuizQuestion;
                const options = Array.isArray(item.options) ? item.options : [];
                const correctIndex = typeof item.correct_index === "number" ? item.correct_index : -1;
                return (
                    <article key={index} className="rounded-xl border border-border bg-background p-4">
                        <p className="text-sm font-bold text-foreground">{index + 1}. {text(item.question)}</p>
                        <ol className="mt-3 list-[upper-alpha] space-y-2 pl-5 text-sm leading-5 text-muted">
                            {options.map((option, optionIndex) => (
                                <li key={optionIndex} className={optionIndex === correctIndex ? "font-bold text-success" : undefined}>
                                    {text(option)}
                                </li>
                            ))}
                        </ol>
                        {item.explanation !== undefined && item.explanation !== null && (
                            <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted">{text(item.explanation)}</p>
                        )}
                    </article>
                );
            })}
        </div>
    );
}

export default function AiStudyTools({
    documentId,
    summary,
}: {
    documentId: number;
    /**
     * Extracted server-side from the document page's existing embed, so the text
     * is in the server-rendered HTML and stays indexable. It is held here
     * behind `hidden` until generated rather than rendered conditionally —
     * click-to-reveal markup that is present in the document is ordinary
     * progressive disclosure, the same as an accordion.
     */
    summary: { text: string; keyPoints: string[] } | null;
}) {
    const { isStudent, isAdmin } = useAuth();
    const signedIn = isStudent || isAdmin;
    const queryClient = useQueryClient();
    const availability = useStudySetAvailability(documentId, signedIn);

    const [phase, setPhase] = useState<Record<Kind, Phase>>({
        summary: "idle",
        flashcards: "idle",
        quiz: "idle",
    });
    const [stageText, setStageText] = useState<Partial<Record<Kind, string>>>({});
    const [sets, setSets] = useState<DocumentAiContent[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Tickers are cleared on unmount. A stage promise left unsettled by that is
    // harmless: its `await` simply never resumes to touch state.
    const tickers = useRef(new Set<ReturnType<typeof setInterval>>());
    useEffect(() => {
        const running = tickers.current;
        return () => {
            running.forEach(clearInterval);
            running.clear();
        };
    }, []);

    const runStages = (kind: Kind) => {
        const stages = STAGES[kind];
        const reduced =
            typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // Someone who asked for less motion gets the result as soon as it lands
        // instead of waiting out the staging.
        if (reduced) {
            setStageText((current) => ({ ...current, [kind]: stages[stages.length - 1] }));
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            let index = 0;
            setStageText((current) => ({ ...current, [kind]: stages[0] }));
            const ticker = setInterval(() => {
                index += 1;
                if (index >= stages.length) {
                    clearInterval(ticker);
                    tickers.current.delete(ticker);
                    resolve();
                    return;
                }
                setStageText((current) => ({ ...current, [kind]: stages[index] }));
            }, STAGE_MS);
            tickers.current.add(ticker);
        });
    };

    const handleGenerate = async (kind: Kind) => {
        if (phase[kind] !== "idle") return;

        // The summary is anon-readable and already on the page; the two
        // answer-bearing kinds are authenticated-only and cannot be.
        if (kind !== "summary" && !signedIn) {
            requestAuthPrompt("studySets");
            return;
        }

        setError(null);
        setPhase((current) => ({ ...current, [kind]: "generating" }));

        try {
            // The read and the staging run together, so the network time is
            // spent inside the animation rather than after it.
            const [rows] = await Promise.all([
                kind === "summary"
                    ? Promise.resolve(null)
                    : queryClient.fetchQuery({
                        queryKey: studySetsKey(documentId),
                        queryFn: () => fetchStudySets(documentId),
                        staleTime: 5 * 60 * 1000,
                    }),
                runStages(kind),
            ]);

            if (rows) setSets(rows);
            setPhase((current) => ({ ...current, [kind]: "ready" }));
        } catch {
            setPhase((current) => ({ ...current, [kind]: "idle" }));
            setStageText((current) => ({ ...current, [kind]: undefined }));
            setError(`${KIND_META[kind].label} could not be generated just now. Try again in a moment.`);
        }
    };

    // Signed out, the two study kinds cannot be probed, so they are offered and
    // the click raises the sign-in prompt. Signed in, only what actually exists
    // is offered.
    const probing = signedIn && availability.isLoading;
    const offered: Kind[] = [];
    if (summary) offered.push("summary");
    if (!signedIn || availability.data?.flashcards) offered.push("flashcards");
    if (!signedIn || availability.data?.quiz) offered.push("quiz");

    if (offered.length === 0 && !probing) return null;

    const pending = offered.filter((kind) => phase[kind] !== "ready");
    const setFor = (kind: StudyKind) => sets.find((item) => item.kind === kind);

    return (
        <section
            className="w-full rounded-2xl border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="ai-study-tools-heading"
        >
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Sparkles size={18} aria-hidden="true" />
                </div>
                <div>
                    <h2 id="ai-study-tools-heading" className="text-base font-bold text-foreground">
                        AI Study Tools
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                        Turn this document into a summary, flashcards, or a practice quiz.
                    </p>
                </div>
            </div>

            {(pending.length > 0 || probing) && (
                <div className="mt-5 flex flex-wrap gap-2" aria-live="polite">
                    {pending.map((kind) => {
                        const { action, icon: Icon } = KIND_META[kind];

                        if (phase[kind] === "generating") {
                            return (
                                <div
                                    key={kind}
                                    className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary"
                                >
                                    <InlineSpinner label={`Generating ${KIND_META[kind].label.toLowerCase()}`} size={14} />
                                    <span>{stageText[kind] ?? STAGES[kind][0]}</span>
                                </div>
                            );
                        }

                        return (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => handleGenerate(kind)}
                                className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
                            >
                                {kind !== "summary" && !signedIn ? (
                                    <LockKeyhole size={14} aria-hidden="true" />
                                ) : (
                                    <Icon size={14} aria-hidden="true" />
                                )}
                                {action}
                            </button>
                        );
                    })}

                    {probing && <SkeletonBlock className="h-9 w-40" />}
                </div>
            )}

            {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}

            {/* No `space-y` here: each block carries its own top rule, and a
                `hidden` sibling would still be counted by the `> * + *` selector. */}
            <div>
                {summary && (
                    <div hidden={phase.summary !== "ready"} className="mt-5 border-t border-border pt-5">
                        <ResultHeading icon={FileText}>Summary</ResultHeading>
                        {summary.text && (
                            <p className="mt-3 text-sm leading-6 whitespace-pre-wrap text-foreground">{summary.text}</p>
                        )}
                        {summary.keyPoints.length > 0 && (
                            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                                {summary.keyPoints.map((point, index) => (
                                    <li key={`${point}-${index}`}>{point}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {(["flashcards", "quiz"] as StudyKind[]).map((kind) => {
                    if (phase[kind] !== "ready") return null;
                    const content = setFor(kind);
                    const { label, icon: Icon } = KIND_META[kind];

                    return (
                        <div key={kind} className="mt-5 border-t border-border pt-5">
                            <ResultHeading icon={Icon}>{label}</ResultHeading>
                            <div className="mt-4">
                                {content ? (
                                    kind === "flashcards" ? (
                                        <FlashcardList payload={objectPayload(content)} />
                                    ) : (
                                        <QuizList payload={objectPayload(content)} />
                                    )
                                ) : (
                                    <p className="text-sm text-muted">Nothing came out of this one.</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
