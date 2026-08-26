import type { DocumentAiContent } from "@/app/lib/document-types";

/**
 * Typed views over the `document_ai_content.payload` jsonb.
 *
 * The backend validates every payload against a Pydantic model before it can be
 * saved (`backend/app/llm.py`), including that `correct_index` is in range. These
 * parsers re-check the same shapes anyway and drop entries that do not fit,
 * because a malformed card should cost the student that one card rather than a
 * blank panel.
 */

export type Flashcard = { question: string; answer: string };

export type QuizQuestion = {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
};

export type SummaryContent = { text: string; keyPoints: string[] };

function asObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function nonEmpty(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function payloadOf(content: DocumentAiContent | undefined): Record<string, unknown> {
    return content ? asObject(content.payload) : {};
}

export function parseFlashcards(payload: Record<string, unknown>): Flashcard[] {
    const raw = Array.isArray(payload.cards) ? payload.cards : [];
    const cards: Flashcard[] = [];

    for (const entry of raw) {
        const item = asObject(entry);
        const question = nonEmpty(item.question);
        const answer = nonEmpty(item.answer);
        if (question && answer) cards.push({ question, answer });
    }
    return cards;
}

export function parseQuiz(payload: Record<string, unknown>): QuizQuestion[] {
    const raw = Array.isArray(payload.questions) ? payload.questions : [];
    const questions: QuizQuestion[] = [];

    for (const entry of raw) {
        const item = asObject(entry);
        const question = nonEmpty(item.question);
        const options = (Array.isArray(item.options) ? item.options : [])
            .map(nonEmpty)
            .filter((option): option is string => option !== null);
        const correctIndex = item.correct_index;

        // An out-of-range index renders a question with no right answer, which is
        // worse than dropping the question.
        if (
            !question ||
            options.length < 2 ||
            typeof correctIndex !== "number" ||
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex >= options.length
        ) {
            continue;
        }

        questions.push({
            question,
            options,
            correctIndex,
            explanation: nonEmpty(item.explanation) ?? "",
        });
    }
    return questions;
}

const LABEL_WORDS = 4;

/**
 * Split a key point into a chip label and the body it expands to.
 *
 * `key_points` are plain strings with no term structure (see `DocumentSummary` in
 * `backend/app/llm.py`), so a labelled point — "Osmosis: water moves across a
 * membrane…" — gives up a real term, and anything else falls back to its opening
 * words. Every point gets a chip either way; a chips row that silently held only
 * the two points that happened to use a colon would read as a bug.
 */
export function splitKeyPoint(raw: string): { label: string; body: string; labelled: boolean } {
    const point = raw.trim();
    const match = /^(.{2,34}?)\s*(?::|—|–|\s-\s)\s*(\S[\s\S]*)$/.exec(point);

    // A full stop in the candidate label means the delimiter belonged to a later
    // sentence, not a leading term.
    if (match && !match[1].includes(".") && match[1].split(/\s+/).length <= 6) {
        return { label: match[1].trim(), body: match[2].trim(), labelled: true };
    }

    const words = point.split(/\s+/);
    const label = words.slice(0, LABEL_WORDS).join(" ");
    return {
        label: words.length > LABEL_WORDS ? `${label}…` : label,
        body: point,
        labelled: false,
    };
}
