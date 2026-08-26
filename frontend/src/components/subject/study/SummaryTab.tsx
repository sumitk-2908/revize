"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ListChecks, Minimize2, Maximize2 } from "lucide-react";
import { splitKeyPoint, type SummaryContent } from "./payload";

/**
 * The summary tab: an overview paragraph, a row of highlight chips, and the key
 * points as individually collapsible disclosures.
 *
 * The chips and the disclosures are two routes into the same list — the chip row
 * is a scannable index of what the document covers, and clicking one opens its
 * point and brings it into view. Chip and disclosure share `openPoints`, so the
 * two controls can never disagree about what is expanded.
 */
export default function SummaryTab({ summary }: { summary: SummaryContent }) {
    const points = useMemo(
        () => summary.keyPoints.map((point) => ({ raw: point, ...splitKeyPoint(point) })),
        [summary.keyPoints],
    );

    const [openPoints, setOpenPoints] = useState<Set<number>>(new Set());
    const pointRefs = useRef<(HTMLDivElement | null)[]>([]);

    const toggle = (index: number) => {
        setOpenPoints((current) => {
            const next = new Set(current);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const openFromChip = (index: number) => {
        const alreadyOpen = openPoints.has(index);
        toggle(index);

        // Scroll only when opening. Yanking the page around as a point collapses
        // is disorienting, and `block: "nearest"` keeps an already-visible point
        // where it is.
        if (!alreadyOpen) {
            pointRefs.current[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    };

    const allOpen = openPoints.size === points.length && points.length > 0;

    return (
        <div className="space-y-5">
            {summary.text && (
                <p className="text-lg leading-7 whitespace-pre-wrap text-foreground">{summary.text}</p>
            )}

            {points.length > 0 && (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted uppercase">
                            <ListChecks size={14} aria-hidden="true" /> Highlights
                        </span>
                        {points.map((point, index) => {
                            const open = openPoints.has(index);
                            return (
                                <button
                                    key={`chip-${index}`}
                                    type="button"
                                    onClick={() => openFromChip(index)}
                                    aria-expanded={open}
                                    aria-controls={`key-point-${index}`}
                                    className={`motion-hover motion-active max-w-64 truncate rounded-full border px-3 py-1.5 text-sm font-bold ${
                                        open
                                            ? "border-primary/40 bg-primary/15 text-primary"
                                            : "border-border bg-surface-hover text-muted hover:border-primary/30 hover:text-foreground"
                                    }`}
                                >
                                    {point.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold tracking-wider text-muted uppercase">
                                Key points
                            </h3>
                            <button
                                type="button"
                                onClick={() =>
                                    setOpenPoints(allOpen ? new Set() : new Set(points.map((_, i) => i)))
                                }
                                className="motion-hover flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted hover:bg-surface-hover hover:text-foreground"
                            >
                                {allOpen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                {allOpen ? "Collapse all" : "Expand all"}
                            </button>
                        </div>

                        {points.map((point, index) => {
                            const open = openPoints.has(index);
                            return (
                                <div
                                    key={`point-${index}`}
                                    ref={(node) => {
                                        pointRefs.current[index] = node;
                                    }}
                                    className={`motion-hover overflow-hidden rounded-xl border bg-background ${
                                        open ? "border-primary/30" : "border-border"
                                    }`}
                                >
                                    <button
                                        type="button"
                                        id={`key-point-header-${index}`}
                                        onClick={() => toggle(index)}
                                        aria-expanded={open}
                                        aria-controls={`key-point-${index}`}
                                        className="motion-hover flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                                open
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-surface-hover text-muted"
                                            }`}
                                        >
                                            {index + 1}
                                        </span>
                                        <span className="min-w-0 flex-1 text-base font-bold text-foreground">
                                            {point.label}
                                        </span>
                                        <ChevronDown
                                            size={16}
                                            aria-hidden="true"
                                            className={`motion-hover shrink-0 text-muted ${open ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    <div
                                        className="study-collapse"
                                        data-open={open ? "true" : "false"}
                                        id={`key-point-${index}`}
                                        role="region"
                                        aria-labelledby={`key-point-header-${index}`}
                                    >
                                        {/*
                                          `inert` while collapsed. The grid-rows
                                          trick collapses the box to no height but
                                          leaves the text in the accessibility tree
                                          and in the tab order, so a screen reader
                                          would otherwise read every point whether
                                          it was open or not.
                                        */}
                                        <div inert={!open}>
                                            <p className="px-4 pb-4 pl-13 text-base leading-6 text-muted">
                                                {point.body}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
