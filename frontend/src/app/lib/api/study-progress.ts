import { supabase } from "./core";
import type { Json } from "../database.types";

/**
 * Per-student progress through one document's flashcards and quiz.
 *
 * Stored in `study_history.study_progress` — the same per-user, per-document row
 * that carries reading position. See
 * `supabase/migrations/20260826000000_study_set_progress.sql` for why it lives
 * there rather than in a table of its own.
 *
 * A card or question has no identity in the payload beyond its position, so
 * every kind records the `document_ai_content.version` it was rated against and
 * `ratingsFor`/`answersFor` return nothing when that version has moved on. A
 * student who rated v2's card 3 "easy" should not see that rating attached to
 * v3's card 3, which is a different card.
 */

export type Confidence = "easy" | "hard";

export type StoredProgress = {
    flashcards: { version: number; ratings: Record<number, Confidence> } | null;
    quiz: { version: number; answers: Record<number, number> } | null;
};

export const EMPTY_PROGRESS: StoredProgress = { flashcards: null, quiz: null };

export const studyProgressKey = (documentId: number) => ["study-progress", documentId];

function asObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

/** A non-negative integer index, or null for any other key shape. */
function indexOf(key: string): number | null {
    const parsed = Number(key);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function versionOf(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function parseFlashcards(raw: unknown): StoredProgress["flashcards"] {
    const object = asObject(raw);
    const version = versionOf(object.version);
    if (version === null) return null;

    const ratings: Record<number, Confidence> = {};
    for (const [key, value] of Object.entries(asObject(object.ratings))) {
        const index = indexOf(key);
        if (index !== null && (value === "easy" || value === "hard")) ratings[index] = value;
    }
    return { version, ratings };
}

function parseQuiz(raw: unknown): StoredProgress["quiz"] {
    const object = asObject(raw);
    const version = versionOf(object.version);
    if (version === null) return null;

    const answers: Record<number, number> = {};
    for (const [key, value] of Object.entries(asObject(object.answers))) {
        const index = indexOf(key);
        if (index !== null && typeof value === "number" && Number.isInteger(value) && value >= 0) {
            answers[index] = value;
        }
    }
    return { version, answers };
}

export function parseProgress(raw: unknown): StoredProgress {
    const object = asObject(raw);
    return { flashcards: parseFlashcards(object.flashcards), quiz: parseQuiz(object.quiz) };
}

/** Ratings recorded against `version`, or none when the published set has moved on. */
export function ratingsFor(progress: StoredProgress | undefined, version: number | null) {
    if (!progress?.flashcards || version === null || progress.flashcards.version !== version) return {};
    return progress.flashcards.ratings;
}

/** Answers recorded against `version`, or none when the published quiz has moved on. */
export function answersFor(progress: StoredProgress | undefined, version: number | null) {
    if (!progress?.quiz || version === null || progress.quiz.version !== version) return {};
    return progress.quiz.answers;
}

async function currentUserId(): Promise<string | null> {
    // getSession reads the local session rather than calling out, matching how
    // the PDF viewer resolves the user before writing reading progress.
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
}

export const fetchStudyProgress = async (documentId: number): Promise<StoredProgress> => {
    const userId = await currentUserId();
    if (!userId) return EMPTY_PROGRESS;

    const { data, error } = await supabase
        .from("study_history")
        .select("study_progress")
        .eq("user_id", userId)
        .eq("document_id", documentId)
        .maybeSingle();

    if (error) throw error;
    return parseProgress(data?.study_progress);
};

/**
 * Write the whole progress object back.
 *
 * Upserting only these three columns is what keeps `last_page` and
 * `accessed_at` intact: PostgREST builds `ON CONFLICT DO UPDATE SET` from the
 * payload's columns alone, so an existing row keeps every column not named here,
 * and a first-visit insert gets the table's defaults.
 */
export const saveStudyProgress = async (documentId: number, progress: StoredProgress): Promise<void> => {
    const userId = await currentUserId();
    if (!userId) return;

    const { error } = await supabase.from("study_history").upsert(
        {
            user_id: userId,
            document_id: documentId,
            study_progress: progress as unknown as Json,
        },
        { onConflict: "user_id, document_id" },
    );

    if (error) throw error;
};
