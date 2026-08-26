"use client";

import * as Tabs from "@radix-ui/react-tabs";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The shell all three study artifacts share: one segmented tab bar over one
 * content well.
 *
 * Built on Radix Tabs rather than hand-rolled buttons for the roles and the
 * arrow-key/Home/End handling that comes with `Tabs.List`. Every panel is
 * `forceMount`ed, so switching tabs does not unmount the others and a
 * half-finished quiz, a flipped card, and an expanded key point all survive the
 * trip. Radix marks the inactive ones `hidden`, which keeps them out of the
 * accessibility tree and out of `getByRole` queries.
 *
 * The panel heading lives with the caller rather than here — the shell renders
 * before it is revealed, so a heading inside it would put a second copy of the
 * same element and id in the document.
 */

export type StudyTabDef = {
    value: string;
    label: string;
    icon: LucideIcon;
    /** Terse count shown beside the label, e.g. the number of cards. */
    meta?: string;
    content: ReactNode;
};

export default function StudyPanelShell({
    tabs,
    value,
    onValueChange,
}: {
    tabs: StudyTabDef[];
    value: string;
    onValueChange: (next: string) => void;
}) {
    const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value));

    return (
        <Tabs.Root value={value} onValueChange={onValueChange} className="w-full">
            {/*
              No `gap` between triggers: the indicator is positioned by
              `translateX(index * 100%)` of its own width, which is only exact
              while the columns tile the track edge to edge.
            */}
            <Tabs.List
                loop
                aria-label="Study tools"
                className="relative grid rounded-2xl border border-border bg-surface-hover p-1"
                style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            >
                <span
                    aria-hidden="true"
                    className="motion-sidebar pointer-events-none absolute inset-y-1 left-1 rounded-xl border border-border bg-surface shadow-sm"
                    style={{
                        width: `calc((100% - 0.5rem) / ${tabs.length})`,
                        transform: `translateX(${activeIndex * 100}%)`,
                    }}
                />
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <Tabs.Trigger
                            key={tab.value}
                            value={tab.value}
                            className="motion-hover relative z-10 flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-sm font-bold text-muted data-[state=active]:text-primary sm:flex-row sm:gap-2"
                        >
                            <Icon size={15} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{tab.label}</span>
                            {tab.meta && (
                                <span className="text-xs font-semibold text-muted">{tab.meta}</span>
                            )}
                        </Tabs.Trigger>
                    );
                })}
            </Tabs.List>

            {tabs.map((tab) => (
                /*
                  `forceMount` keeps the panel mounted, but it also makes Radix
                  compute `hidden: !(forceMount || isSelected)` — always false — so
                  every panel would render at once. The explicit `hidden` is what
                  actually hides the inactive ones: props spread after Radix's own,
                  so this wins. `data-state` is still Radix's, which is what the
                  entrance animation keys off.
                */
                <Tabs.Content
                    key={tab.value}
                    value={tab.value}
                    forceMount
                    hidden={tab.value !== value}
                    className="study-panel mt-5 focus-visible:outline-none"
                >
                    {tab.content}
                </Tabs.Content>
            ))}
        </Tabs.Root>
    );
}

