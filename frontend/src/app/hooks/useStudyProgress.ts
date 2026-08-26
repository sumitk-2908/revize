import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    EMPTY_PROGRESS,
    fetchStudyProgress,
    saveStudyProgress,
    studyProgressKey,
    type Confidence,
    type StoredProgress,
} from "@/app/lib/api/study-progress";

/**
 * Read and write one document's study progress.
 *
 * Writes are optimistic and quiet: a rating must feel like it landed the moment
 * it is clicked, and a failed write is not worth interrupting a revision session
 * with an error banner. The react-query cache is what the panels render from, so
 * a rejected write rolls that cache back and the rating simply un-fills.
 *
 * Every setter merges into the latest *cached* object rather than one captured at
 * render, so rating a card cannot erase a quiz answer written moments earlier.
 */
export const useStudyProgress = (documentId: number, enabled: boolean) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: studyProgressKey(documentId),
        queryFn: () => fetchStudyProgress(documentId),
        enabled,
        staleTime: 5 * 60 * 1000,
    });

    const { mutate } = useMutation({
        mutationFn: (next: StoredProgress) => saveStudyProgress(documentId, next),
    });

    const commit = useCallback(
        (update: (current: StoredProgress) => StoredProgress) => {
            const key = studyProgressKey(documentId);
            const previous = queryClient.getQueryData<StoredProgress>(key) ?? EMPTY_PROGRESS;
            const next = update(previous);

            queryClient.setQueryData(key, next);
            mutate(next, {
                onError: () => queryClient.setQueryData(key, previous),
            });
        },
        [queryClient, documentId, mutate],
    );

    /** Record one card's confidence, or clear it by passing null. */
    const rateCard = useCallback(
        (version: number, index: number, confidence: Confidence | null) => {
            commit((current) => {
                const ratings =
                    current.flashcards?.version === version ? { ...current.flashcards.ratings } : {};
                if (confidence === null) delete ratings[index];
                else ratings[index] = confidence;
                return { ...current, flashcards: { version, ratings } };
            });
        },
        [commit],
    );

    const answerQuestion = useCallback(
        (version: number, index: number, optionIndex: number) => {
            commit((current) => {
                const answers = current.quiz?.version === version ? { ...current.quiz.answers } : {};
                answers[index] = optionIndex;
                return { ...current, quiz: { version, answers } };
            });
        },
        [commit],
    );

    const resetQuiz = useCallback(
        (version: number) => commit((current) => ({ ...current, quiz: { version, answers: {} } })),
        [commit],
    );

    const resetRatings = useCallback(
        (version: number) => commit((current) => ({ ...current, flashcards: { version, ratings: {} } })),
        [commit],
    );

    return {
        progress: query.data,
        isLoading: query.isLoading,
        rateCard,
        answerQuestion,
        resetQuiz,
        resetRatings,
    };
};
