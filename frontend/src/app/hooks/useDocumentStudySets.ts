import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/app/lib/api/core";
import type { DocumentAiContent } from "@/app/lib/document-types";

/** The two artifacts that carry answer keys, and so are signed-in only under RLS. */
export type StudyKind = "flashcards" | "quiz";

const STUDY_KINDS: StudyKind[] = ["flashcards", "quiz"];

export const studySetsKey = (documentId: number) => ["document-study-sets", documentId];

export const studySetAvailabilityKey = (documentId: number) => [
  "document-study-set-availability",
  documentId,
];

/**
 * The published flashcard and quiz rows for one document.
 *
 * Exported as a plain function rather than wrapped in a hook because the caller
 * awaits it inside a click handler — the read happens while the generating
 * animation is on screen, so its latency is hidden rather than shown as a
 * spinner.
 */
export const fetchStudySets = async (documentId: number): Promise<DocumentAiContent[]> => {
    const { data, error } = await supabase
        .from("document_ai_content")
        .select("*")
        .eq("document_id", documentId)
        .in("kind", STUDY_KINDS)
        .eq("status", "published")
        .order("kind")
        .order("version", { ascending: false });

    if (error) throw error;
    return (data ?? []) as DocumentAiContent[];
};

/**
 * Which study sets exist for this document, without downloading them.
 *
 * `select("kind")` rather than `*` on purpose. This only decides which buttons
 * to offer, and pulling the payloads to answer that would ship every quiz
 * answer key to a student who never opens one.
 *
 * Returns nothing useful while signed out — both kinds are `authenticated`-only
 * — so callers pass `enabled: signedIn` and treat the signed-out case as
 * "offer it and prompt for sign-in".
 */
export const useStudySetAvailability = (documentId: number, enabled: boolean) =>
    useQuery({
        queryKey: studySetAvailabilityKey(documentId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("document_ai_content")
                .select("kind")
                .eq("document_id", documentId)
                .in("kind", STUDY_KINDS)
                .eq("status", "published");

            if (error) throw error;
            const kinds = new Set((data ?? []).map((row) => row.kind));
            return { flashcards: kinds.has("flashcards"), quiz: kinds.has("quiz") };
        },
        enabled,
        staleTime: 5 * 60 * 1000,
    });
