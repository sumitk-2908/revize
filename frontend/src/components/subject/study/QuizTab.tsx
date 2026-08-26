"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Trophy, X } from "lucide-react";
import type { QuizQuestion } from "./payload";

/**
 * One question at a time, with the explanation held behind a flip.
 *
 * Answering is what unlocks the explanation card, and the card starts face-down:
 * seeing *whether* you were right and seeing *why* are two separate beats, and
 * collapsing them into one means the reasoning arrives while the student is still
 * reacting to the verdict, where it does not get read.
 *
 * Answers live in the caller's persisted progress rather than local state, so a
 * quiz half-finished yesterday is still half-finished today.
 */

const OPTION_LETTERS = "ABCDEFGH";

export default function QuizTab({
    questions,
    answers,
    onAnswer,
    onReset,
}: {
    questions: QuizQuestion[];
    answers: Record<number, number>;
    onAnswer: (index: number, optionIndex: number) => void;
    onReset: () => void;
}) {
    const [index, setIndex] = useState(0);
    // Which question the flip belongs to. The explanation is face-down on arrival
    // at every question, including one answered in an earlier session, and
    // deriving that beats resetting it in an effect after the back has rendered.
    const [flip, setFlip] = useState<{ question: number; flipped: boolean }>({
        question: -1,
        flipped: false,
    });
    const [showResults, setShowResults] = useState(false);

    const answeredCount = useMemo(
        () => questions.reduce((total, _question, position) => total + (position in answers ? 1 : 0), 0),
        [questions, answers],
    );
    const score = useMemo(
        () =>
            questions.reduce(
                (total, question, position) =>
                    total + (answers[position] === question.correctIndex ? 1 : 0),
                0,
            ),
        [questions, answers],
    );

    const safeIndex = Math.min(index, Math.max(0, questions.length - 1));
    const question = questions[safeIndex];
    const chosen = answers[safeIndex];
    const answered = chosen !== undefined;
    const allAnswered = questions.length > 0 && answeredCount === questions.length;
    const flipped = flip.question === safeIndex && flip.flipped;

    if (questions.length === 0) {
        return <p className="text-base text-muted">No questions came out of this one.</p>;
    }

    if (showResults) {
        const percent = Math.round((score / questions.length) * 100);
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-background p-6 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Trophy size={22} aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-3xl font-bold text-foreground">
                        {score} / {questions.length}
                    </p>
                    <p className="mt-1 text-base text-muted">{percent}% correct</p>

                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowResults(false);
                                setIndex(0);
                            }}
                            className="motion-hover motion-active rounded-xl border border-border px-4 py-2 text-base font-bold text-foreground hover:bg-surface-hover"
                        >
                            Review answers
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onReset();
                                setShowResults(false);
                                setIndex(0);
                            }}
                            className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-90"
                        >
                            <RotateCcw size={15} aria-hidden="true" /> Try again
                        </button>
                    </div>
                </div>

                <ol className="space-y-2">
                    {questions.map((item, position) => {
                        const correct = answers[position] === item.correctIndex;
                        return (
                            <li key={position}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowResults(false);
                                        setIndex(position);
                                    }}
                                    className="motion-hover flex w-full items-start gap-3 rounded-xl border border-border bg-background p-3 text-left hover:border-primary/30"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                                            correct
                                                ? "bg-success/15 text-success"
                                                : "bg-destructive/15 text-destructive"
                                        }`}
                                    >
                                        {correct ? <Check size={13} /> : <X size={13} />}
                                    </span>
                                    <span className="min-w-0 flex-1 text-base leading-6 text-foreground">
                                        {item.question}
                                    </span>
                                    <span className="sr-only">
                                        {correct ? "Answered correctly" : "Answered incorrectly"}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-bold">
                    <span className="text-muted">
                        Question <span className="text-foreground">{safeIndex + 1}</span> of{" "}
                        {questions.length}
                    </span>
                    <span className="text-muted">
                        {answeredCount} answered
                        {answeredCount > 0 && <span className="text-success"> · {score} right</span>}
                    </span>
                </div>

                {/*
                  One bar for the whole quiz, driven by how many questions are
                  answered rather than by which one is on screen — the student's
                  question is "how much is left", and paging back and forth must
                  not make the bar retreat.
                */}
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={questions.length}
                    aria-valuenow={answeredCount}
                    aria-label="Questions answered"
                    className="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
                >
                    <div
                        className="motion-sidebar h-full rounded-full bg-primary"
                        style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                    />
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-xl leading-6 font-bold text-foreground">{question.question}</p>

                <div className="mt-4 space-y-2" role="group" aria-label="Answer options">
                    {question.options.map((option, optionIndex) => {
                        const isCorrect = optionIndex === question.correctIndex;
                        const isChosen = optionIndex === chosen;

                        // Before answering every option is neutral; after, the
                        // correct one is always marked whether or not it was picked,
                        // because a wrong answer with no visible right answer teaches
                        // nothing.
                        let tone = "border-border bg-surface hover:border-primary/40 hover:bg-surface-hover";
                        if (answered && isCorrect) tone = "border-success bg-success/10";
                        else if (answered && isChosen) tone = "border-destructive bg-destructive/10";
                        else if (answered) tone = "border-border bg-surface opacity-60";

                        return (
                            <button
                                key={optionIndex}
                                type="button"
                                onClick={() => !answered && onAnswer(safeIndex, optionIndex)}
                                disabled={answered}
                                aria-pressed={isChosen}
                                className={`motion-hover flex w-full items-start gap-3 rounded-xl border p-3 text-left disabled:cursor-default ${tone}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                        answered && isCorrect
                                            ? "bg-success text-white"
                                            : answered && isChosen
                                              ? "bg-destructive text-white"
                                              : "bg-surface-hover text-muted"
                                    }`}
                                >
                                    {answered && isCorrect ? (
                                        <Check size={13} />
                                    ) : answered && isChosen ? (
                                        <X size={13} />
                                    ) : (
                                        OPTION_LETTERS[optionIndex] ?? optionIndex + 1
                                    )}
                                </span>
                                <span className="min-w-0 flex-1 text-base leading-6 text-foreground">
                                    {option}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {answered && question.explanation && (
                <button
                    type="button"
                    onClick={() => setFlip({ question: safeIndex, flipped: !flipped })}
                    aria-expanded={flipped}
                    className="study-flip h-32 w-full text-left"
                >
                    <span className="study-flip-inner block" data-flipped={flipped ? "true" : "false"}>
                        <span
                            inert={flipped}
                            aria-hidden={flipped}
                            className={`study-flip-face items-center justify-center gap-2 rounded-2xl border p-5 text-center ${
                                chosen === question.correctIndex
                                    ? "border-success/40 bg-success/5"
                                    : "border-destructive/40 bg-destructive/5"
                            }`}
                        >
                            <span
                                className={`text-lg font-bold ${
                                    chosen === question.correctIndex ? "text-success" : "text-destructive"
                                }`}
                            >
                                {chosen === question.correctIndex ? "Correct" : "Not quite"}
                            </span>
                            <span className="text-sm font-bold text-primary">
                                Tap to see why
                            </span>
                        </span>

                        <span
                            inert={!flipped}
                            aria-hidden={!flipped}
                            className="study-flip-face study-flip-back items-start gap-2 rounded-2xl border border-primary/40 bg-primary/5 p-5"
                        >
                            <span className="text-xs font-bold tracking-wider text-primary uppercase">
                                Why
                            </span>
                            <span className="text-base leading-6 whitespace-pre-wrap text-foreground">
                                {question.explanation}
                            </span>
                        </span>
                    </span>
                </button>
            )}

            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => setIndex(Math.max(0, safeIndex - 1))}
                    disabled={safeIndex === 0}
                    className="motion-hover motion-active flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-base font-bold text-muted hover:text-foreground disabled:opacity-40"
                >
                    <ChevronLeft size={16} aria-hidden="true" /> Back
                </button>

                {safeIndex === questions.length - 1 ? (
                    <button
                        type="button"
                        onClick={() => setShowResults(true)}
                        disabled={!allAnswered}
                        title={allAnswered ? undefined : "Answer every question to see your score"}
                        className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                        <Trophy size={15} aria-hidden="true" /> See score
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIndex(Math.min(questions.length - 1, safeIndex + 1))}
                        className="motion-hover motion-active flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:opacity-90"
                    >
                        Next <ChevronRight size={16} aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
}
