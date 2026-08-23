import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/app/lib/api/core";
import type { DocumentAiContent } from "@/app/lib/document-types";

export const documentStudySetsKey = (documentId: number) => ["document-study-sets", documentId];

/** Loads answer-bearing study sets only after the student opens the panel. */
export const useDocumentStudySets = (documentId: number, enabled: boolean) => {
    return useQuery<DocumentAiContent[]>({
        queryKey: documentStudySetsKey(documentId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("document_ai_content")
                .select("*")
                .eq("document_id", documentId)
                .in("kind", ["flashcards", "quiz"])
                .eq("status", "published")
                .order("kind")
                .order("version", { ascending: false });

            if (error) throw error;
            return (data ?? []) as DocumentAiContent[];
        },
        enabled,
        staleTime: 5 * 60 * 1000,
    });
};
