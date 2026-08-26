"use client";

import { useCallback, useState } from "react";

const SEARCH_HISTORY_KEY = "cognispace_search_history";
const MAX_HISTORY_ENTRIES = 8;

const normalizeHistory = (entries: unknown): string[] => {
    if (!Array.isArray(entries)) return [];

    const seen = new Set<string>();
    const history: string[] = [];

    for (const entry of entries) {
        if (typeof entry !== "string") continue;

        const value = entry.trim();
        const normalizedValue = value.toLowerCase();
        if (!value || seen.has(normalizedValue)) continue;

        seen.add(normalizedValue);
        history.push(value);

        if (history.length === MAX_HISTORY_ENTRIES) break;
    }

    return history;
};

const readHistory = (): string[] => {
    if (typeof window === "undefined") return [];

    try {
        return normalizeHistory(JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]"));
    } catch {
        return [];
    }
};

const persistHistory = (history: string[]) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch {
        // Search history remains usable in memory when storage is unavailable.
    }
};

export const useSearchHistory = () => {
    const [history, setHistory] = useState<string[]>(readHistory);

    const addToHistory = useCallback((query: string) => {
        const value = query.trim();
        if (!value) return;

        setHistory((currentHistory) => {
            const nextHistory = normalizeHistory([
                value,
                ...currentHistory.filter((entry) => entry.toLowerCase() !== value.toLowerCase()),
            ]);
            persistHistory(nextHistory);
            return nextHistory;
        });
    }, []);

    const removeFromHistory = useCallback((query: string) => {
        setHistory((currentHistory) => {
            const nextHistory = currentHistory.filter((entry) => entry !== query);
            persistHistory(nextHistory);
            return nextHistory;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);

        if (typeof window === "undefined") return;

        try {
            window.localStorage.removeItem(SEARCH_HISTORY_KEY);
        } catch {
            // Clearing in-memory history is sufficient when storage is unavailable.
        }
    }, []);

    return { history, addToHistory, removeFromHistory, clearHistory };
};
