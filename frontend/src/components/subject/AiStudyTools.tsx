"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Brain, FileText, LockKeyhole, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/context/AuthContext";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import {
    fetchStudySets,
    studySetsKey,
    useStudySetAvailability,
    type StudyKind,
} from "@/app/hooks/useDocumentStudySets";
import { useStudyProgress } from "@/app/hooks/useStudyProgress";
import { answersFor, ratingsFor } from "@/app/lib/api/study-progress";
import type { DocumentAiContent } from "@/app/lib/document-types";
import { InlineSpinner, SkeletonBlock } from "@/components/layout/SharedLayouts";
import StudyPanelShell, { type StudyTabDef } from "./study/StudyPanelShell";
import SummaryTab from "./study/SummaryTab";
import FlashcardsTab from "./study/FlashcardsTab";
import QuizTab from "./study/QuizTab";
import { parseFlashcards, parseQuiz, payloadOf, type SummaryContent } from "./study/payload";

/**
 * The document page's study panel: one Generate gesture, then a tabbed shell over
 * the summary, flashcards and quiz.
 *
 * What a student generates is an artifact an admin already curated and published
 * — the button reveals it, it does not call a model. That is deliberate: the
 * review gate is the whole reason this content is trustworthy, and the Groq free
 * tier is 200K tokens/day for the entire organisation, so a per-student model call
 * would exhaust it in an afternoon.
 *
 * The shell is rendered from the first paint and held behind `hidden` rather than
 * mounted on reveal, so the server-rendered summary text is in the HTML and stays
 * indexable. Click-to-reveal markup that is already in the document is ordinary
 * progressive disclosure, the same as an accordion.
 */

type Kind = "summary" | StudyKind;

const KIND_META: Record<Kind, { label: string; icon: typeof FileText }> = {
    summary: { label: "Summary", icon: FileText },
    flashcards: { label: "Flashcards", icon: BookOpen },
    quiz: { label: "Quiz", icon: Brain },
};

const STAGES = [
    "Reading the document...",
    "Pulling out the main ideas...",
    "Building your cards...",
    "Writing your questions...",
];

const STAGE_MS = 620;

/** Prompt shown in place of a study set a signed-out student cannot read. */
function SignInPanel({ label }: { label: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-border bg-background p-8 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole size={20} aria-hidden="true" />
            </div>
            <p className="mt-4 text-base font-bold text-foreground">Sign in to use the {label}</p>
            <p className="mt-1 text-base text-muted">
                Answer keys are kept for signed-in students.
            </p>
            <button
                type="button"
                onClick={() => requestAuthPrompt("studySets")}
                className="motion-hover motion-active mt-4 rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-90"
            >
                Sign in
            </button>
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
     * arrives in the server-rendered HTML.
     */
    summary: SummaryContent | null;
}) {
    const { isStudent, isAdmin } = useAuth();
    const signedIn = isStudent || isAdmin;
    const queryClient = useQueryClient();
    const availability = useStudySetAvailability(documentId, signedIn);

    const [revealed, setRevealed] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [stage, setStage] = useState<string | null>(null);
    const [sets, setSets] = useState<DocumentAiContent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Kind>("summary");

    const progress = useStudyProgress(documentId, signedIn && revealed);

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

    const runStages = () => {
        const reduced =
            typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // Someone who asked for less motion gets the result as soon as it lands
        // instead of waiting out the staging.
        if (reduced) {
            setStage(STAGES[STAGES.length - 1]);
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            let index = 0;
            setStage(STAGES[0]);
            const ticker = setInterval(() => {
                index += 1;
                if (index >= STAGES.length) {
                    clearInterval(ticker);
                    tickers.current.delete(ticker);
                    resolve();
                    return;
                }
                setStage(STAGES[index]);
            }, STAGE_MS);
            tickers.current.add(ticker);
        });
    };

    const setFor = (kind: StudyKind) => sets.find((item) => item.kind === kind);
    const flashcardsSet = setFor("flashcards");
    const quizSet = setFor("quiz");

    const cards = useMemo(() => parseFlashcards(payloadOf(flashcardsSet)), [flashcardsSet]);
    const questions = useMemo(() => parseQuiz(payloadOf(quizSet)), [quizSet]);

    const handleGenerate = async () => {
        if (generating) return;
        setError(null);
        setGenerating(true);

        try {
            // The read and the staging run together, so network time is spent
            // inside the animation rather than after it.
            const [rows] = await Promise.all([
                signedIn
                    ? queryClient.fetchQuery({
                        queryKey: studySetsKey(documentId),
                        queryFn: () => fetchStudySets(documentId),
                        staleTime: 5 * 60 * 1000,
                    })
                    : Promise.resolve(null),
                runStages(),
            ]);

            if (rows) setSets(rows);
            setRevealed(true);
        } catch {
            setError("The study tools could not be opened just now. Try again in a moment.");
        } finally {
            setGenerating(false);
            setStage(null);
        }
    };

    // Signed out, the two study kinds cannot be probed, so they are offered and
    // their panels prompt for sign-in. Signed in, only what exists is offered.
    const probing = signedIn && availability.isLoading;
    const offered: Kind[] = [];
    if (summary) offered.push("summary");
    if (!signedIn || availability.data?.flashcards) offered.push("flashcards");
    if (!signedIn || availability.data?.quiz) offered.push("quiz");

    if (offered.length === 0 && !probing) return null;

    const tabs: StudyTabDef[] = offered.map((kind) => {
        const { label, icon } = KIND_META[kind];

        if (kind === "summary") {
            return {
                value: kind,
                label,
                icon,
                meta: summary ? `${summary.keyPoints.length}` : undefined,
                content: summary ? <SummaryTab summary={summary} /> : null,
            };
        }

        if (kind === "flashcards") {
            const version = flashcardsSet?.version ?? null;
            return {
                value: kind,
                label,
                icon,
                meta: cards.length > 0 ? `${cards.length}` : undefined,
                content: !signedIn ? (
                    <SignInPanel label="flashcards" />
                ) : version === null ? (
                    <p className="text-base text-muted">Nothing came out of this one.</p>
                ) : (
                    <FlashcardsTab
                        cards={cards}
                        ratings={ratingsFor(progress.progress, version)}
                        onRate={(index, confidence) => progress.rateCard(version, index, confidence)}
                        onResetRatings={() => progress.resetRatings(version)}
                    />
                ),
            };
        }

        const version = quizSet?.version ?? null;
        return {
            value: kind,
            label,
            icon,
            meta: questions.length > 0 ? `${questions.length}` : undefined,
            content: !signedIn ? (
                <SignInPanel label="quiz" />
            ) : version === null ? (
                <p className="text-base text-muted">Nothing came out of this one.</p>
            ) : (
                <QuizTab
                    questions={questions}
                    answers={answersFor(progress.progress, version)}
                    onAnswer={(index, optionIndex) => progress.answerQuestion(version, index, optionIndex)}
                    onReset={() => progress.resetQuiz(version)}
                />
            ),
        };
    });

    // The stored tab can fall out of the offered set — availability resolves, or
    // the summary turns out to be missing — so the value handed to Radix is
    // always one it has a trigger for.
    const activeTab = offered.includes(tab) ? tab : offered[0];

    return (
        <section
            className="w-full rounded-2xl border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="ai-study-tools-heading"
        >
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Sparkles size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <h2 id="ai-study-tools-heading" className="text-xl font-bold text-foreground">
                        AI Study Tools
                    </h2>
                    <p className="mt-1 text-base text-muted">
                        {revealed
                            ? "Curated from this document and reviewed before publishing."
                            : "Turn this document into a summary, flashcards, or a practice quiz."}
                    </p>
                </div>
            </div>

            {!revealed && (
                <>
                    <div className="mt-5 flex flex-wrap gap-2" aria-live="polite">
                        {generating ? (
                            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-bold text-primary">
                                <InlineSpinner label="Generating study tools" size={14} />
                                <span>{stage ?? STAGES[0]}</span>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGenerate}
                                className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
                            >
                                <Sparkles size={14} aria-hidden="true" /> Generate study tools
                            </button>
                        )}
                        {probing && <SkeletonBlock className="h-9 w-40" />}
                    </div>

                    {error && <p className="mt-3 text-base font-semibold text-destructive">{error}</p>}
                </>
            )}

            {/*
              Present from the first paint and merely hidden, so the
              server-rendered summary text is in the HTML and stays indexable.
            */}
            {tabs.length > 0 && (
                <div hidden={!revealed} className="mt-5">
                    <StudyPanelShell
                        tabs={tabs}
                        value={activeTab}
                        onValueChange={(next) => setTab(next as Kind)}
                    />
                </div>
            )}
        </section>
    );
}
