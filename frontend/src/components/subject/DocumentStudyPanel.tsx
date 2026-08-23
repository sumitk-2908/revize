"use client";

import { useState } from "react";
import { BookOpen, Brain, LockKeyhole } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import { useDocumentStudySets } from "@/app/hooks/useDocumentStudySets";
import type { DocumentAiContent } from "@/app/lib/document-types";
import { InlineSpinner } from "@/components/layout/SharedLayouts";

type Flashcard = { question?: unknown; answer?: unknown };
type QuizQuestion = { question?: unknown; options?: unknown; correct_index?: unknown; explanation?: unknown };

type Payload = Record<string, unknown>;

function objectPayload(content: DocumentAiContent): Payload {
    return content.payload !== null && typeof content.payload === "object" && !Array.isArray(content.payload)
        ? content.payload as Payload
        : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value : String(value ?? "");
}

function FlashcardList({ payload }: { payload: Payload }) {
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (cards.length === 0) return <p className="text-sm text-muted">No flashcards are available yet.</p>;

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
    if (questions.length === 0) return <p className="text-sm text-muted">No quiz questions are available yet.</p>;

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
                        {item.explanation !== undefined && item.explanation !== null && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted">{text(item.explanation)}</p>}
                    </article>
                );
            })}
        </div>
    );
}

export default function DocumentStudyPanel({ documentId }: { documentId: number }) {
    const { isStudent, isAdmin } = useAuth();
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"flashcards" | "quiz">("flashcards");
    const signedIn = isStudent || isAdmin;
    const query = useDocumentStudySets(documentId, open && signedIn);
    const content = query.data?.find((item) => item.kind === activeTab);

    const handleOpen = () => {
        if (!signedIn) {
            requestAuthPrompt("studySets");
            return;
        }
        setOpen((current) => !current);
    };

    return (
        <section className="w-full rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="document-study-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-success/10 p-2 text-success"><BookOpen size={18} aria-hidden="true" /></div>
                    <div>
                        <h2 id="document-study-heading" className="text-base font-bold text-foreground">Study Sets</h2>
                        <p className="mt-1 text-sm text-muted">Review flashcards or test yourself with a quiz.</p>
                    </div>
                </div>
                <button type="button" onClick={handleOpen} className="motion-hover flex items-center gap-2 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white hover:opacity-90">
                    {!signedIn && <LockKeyhole size={14} aria-hidden="true" />}
                    {open ? "Hide study sets" : signedIn ? "Open study sets" : "Sign in to study"}
                </button>
            </div>

            {open && signedIn && (
                <div className="mt-5 border-t border-border pt-5">
                    <div className="mb-5 flex gap-2" role="tablist" aria-label="Study set type">
                        <button type="button" role="tab" aria-selected={activeTab === "flashcards"} onClick={() => setActiveTab("flashcards")} className={`motion-hover flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${activeTab === "flashcards" ? "bg-success text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}>
                            <BookOpen size={15} aria-hidden="true" /> Flashcards
                        </button>
                        <button type="button" role="tab" aria-selected={activeTab === "quiz"} onClick={() => setActiveTab("quiz")} className={`motion-hover flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${activeTab === "quiz" ? "bg-success text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}>
                            <Brain size={15} aria-hidden="true" /> Quiz
                        </button>
                    </div>

                    {query.isLoading && <div className="flex items-center gap-2 text-sm text-muted"><InlineSpinner label="Loading study sets" /> Loading study sets...</div>}
                    {query.isError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Study sets could not be loaded.</p>}
                    {!query.isLoading && !query.isError && !content && <p className="text-sm text-muted">This document does not have a published {activeTab} set yet.</p>}
                    {content && (activeTab === "flashcards" ? <FlashcardList payload={objectPayload(content)} /> : <QuizList payload={objectPayload(content)} />)}
                </div>
            )}
        </section>
    );
}
