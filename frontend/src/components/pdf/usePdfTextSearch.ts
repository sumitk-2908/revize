import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";

export type PdfSearchMatch = {
    pageNumber: number;
    start: number;
    end: number;
};

type CachedPage = {
    items: TextItem[];
    text: string;
    itemOffsets: number[];
};

function normalizeQuery(value: string) {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isTextItem(item: unknown): item is TextItem {
    return typeof item === "object" && item !== null && "str" in item;
}

function buildCachedPage(items: TextItem[]): CachedPage {
    const itemOffsets: number[] = [];
    let text = "";

    items.forEach((item, itemIndex) => {
        if (itemIndex > 0) text += " ";
        itemOffsets.push(text.length);
        text += item.str;
    });

    return { items, text: text.toLocaleLowerCase(), itemOffsets };
}

function escapeHtml(value: string) {
    return value
        .split("&").join("&" + "amp;")
        .split("<").join("&" + "lt;")
        .split(">").join("&" + "gt;")
        .split(String.fromCharCode(34)).join("&" + "quot;")
        .split("'").join("&" + "#039;");
}

export function usePdfTextSearch(pdf: PDFDocumentProxy | null) {
    const pageCache = useRef(new Map<number, CachedPage>());
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<PdfSearchMatch[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        pageCache.current.clear();
        setMatches([]);
        setActiveIndex(0);
        setIsSearching(false);
    }, [pdf]);

    const loadPage = useCallback(async (pageNumber: number) => {
        const cached = pageCache.current.get(pageNumber);
        if (cached) return cached;
        if (!pdf) return null;

        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const cachedPage = buildCachedPage(content.items.filter(isTextItem));
        pageCache.current.set(pageNumber, cachedPage);
        return cachedPage;
    }, [pdf]);

    useEffect(() => {
        let cancelled = false;
        const normalizedQuery = normalizeQuery(query);

        if (!pdf || !normalizedQuery) {
            setMatches([]);
            setActiveIndex(0);
            setIsSearching(false);
            return;
        }

        const search = async () => {
            setIsSearching(true);
            const nextMatches: PdfSearchMatch[] = [];

            try {
                // Sequential extraction keeps the main thread responsive for large PDFs.
                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    const page = await loadPage(pageNumber);
                    if (cancelled || !page) return;

                    let fromIndex = 0;
                    while (fromIndex <= page.text.length - normalizedQuery.length) {
                        const matchIndex = page.text.indexOf(normalizedQuery, fromIndex);
                        if (matchIndex === -1) break;

                        nextMatches.push({
                            pageNumber,
                            start: matchIndex,
                            end: matchIndex + normalizedQuery.length,
                        });
                        fromIndex = matchIndex + Math.max(normalizedQuery.length, 1);
                    }
                }

                if (!cancelled) {
                    setMatches(nextMatches);
                    setActiveIndex(0);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to search PDF text:", error);
                    setMatches([]);
                    setActiveIndex(0);
                }
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        };

        void search();
        return () => { cancelled = true; };
    }, [loadPage, pdf, query]);

    const next = useCallback(() => {
        if (matches.length === 0) return null;
        const nextIndex = (activeIndex + 1) % matches.length;
        setActiveIndex(nextIndex);
        return matches[nextIndex];
    }, [activeIndex, matches]);

    const prev = useCallback(() => {
        if (matches.length === 0) return null;
        const previousIndex = (activeIndex - 1 + matches.length) % matches.length;
        setActiveIndex(previousIndex);
        return matches[previousIndex];
    }, [activeIndex, matches]);

    const getTextRenderer = useCallback((pageNumber: number, itemIndex: number, text: string) => {
        const page = pageCache.current.get(pageNumber);
        const itemStart = page?.itemOffsets[itemIndex];
        if (!page || itemStart === undefined || !normalizeQuery(query)) return text;

        const itemEnd = itemStart + text.length;
        const ranges = matches.flatMap((match, matchIndex) => {
            if (match.pageNumber !== pageNumber || match.end <= itemStart || match.start >= itemEnd) return [];
            return [{
                start: Math.max(match.start, itemStart) - itemStart,
                end: Math.min(match.end, itemEnd) - itemStart,
                active: matchIndex === activeIndex,
            }];
        });
        if (ranges.length === 0) return text;

        let cursor = 0;
        return ranges.map((range) => {
            const before = escapeHtml(text.slice(cursor, range.start));
            const highlighted = escapeHtml(text.slice(range.start, range.end));
            cursor = range.end;
            const activeClass = range.active ? " pdf-search-highlight-active" : "";
            return `${before}<mark class="pdf-search-highlight${activeClass}">${highlighted}</mark>`;
        }).join("") + escapeHtml(text.slice(cursor));
    }, [activeIndex, matches, query]);

    return useMemo(() => ({
        query,
        setQuery,
        matches,
        activeIndex,
        isSearching,
        next,
        prev,
        getTextRenderer,
    }), [activeIndex, getTextRenderer, isSearching, matches, next, prev, query]);
}
