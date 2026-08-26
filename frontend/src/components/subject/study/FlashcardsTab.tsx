"use client";

import { useMemo, useRef, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Filter,
    Repeat,
    RotateCcw,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";
import type { Confidence } from "@/app/lib/api/study-progress";
import type { Flashcard } from "./payload";

/**
 * A one-card-at-a-time deck: flip for the answer, rate your confidence, move on.
 *
 * Navigation is available three ways — buttons, arrow keys, and swipe — because
 * this is the panel a student drives for minutes at a time, on a phone as often
 * as a laptop. The keyboard handler is bound to the card rather than the window,
 * so it cannot steal arrow keys from the PDF viewer further up the same page.
 *
 * The card itself is the `<button>`, with the two faces as inert-able children.
 * Making each *face* a button instead costs the user their place: the outgoing
 * face has to become inert mid-flip, and focus dies with it, so the next Space
 * or arrow key goes nowhere.
 *
 * `order` is the list of card indices being walked, which is what makes "hard
 * only" a filter over one deck rather than a second deck — an index stays the
 * card's identity, so a rating written while filtered lands on the same card.
 */

const SWIPE_THRESHOLD = 48;

export default function FlashcardsTab({
    cards,
    ratings,
    onRate,
    onResetRatings,
}: {
    cards: Flashcard[];
    ratings: Record<number, Confidence>;
    onRate: (index: number, confidence: Confidence | null) => void;
    onResetRatings: () => void;
}) {
    const [hardOnly, setHardOnly] = useState(false);
    const [position, setPosition] = useState(0);
    // Which card the flip belongs to, not just whether something is flipped. A
    // card always shows its question first whichever way it was reached, and
    // deriving that beats resetting it in an effect after the wrong side has
    // already rendered.
    const [flip, setFlip] = useState<{ card: number; flipped: boolean }>({ card: -1, flipped: false });
    const touchStart = useRef<{ x: number; y: number } | null>(null);

    const counts = useMemo(() => {
        let easy = 0;
        let hard = 0;
        for (const index of cards.keys()) {
            if (ratings[index] === "easy") easy += 1;
            if (ratings[index] === "hard") hard += 1;
        }
        return { easy, hard };
    }, [cards, ratings]);

    // Derived from `ratings`, so un-marking the last hard card while filtered
    // empties the deck rather than stranding the walk on a card that no longer
    // belongs in it.
    const order = useMemo(
        () => cards.map((_, index) => index).filter((index) => !hardOnly || ratings[index] === "hard"),
        [cards, hardOnly, ratings],
    );

    // `position` can outlive the order it indexed — rating the current card can
    // shorten the filtered deck under it — so every read goes through the clamp.
    const safePosition = order.length === 0 ? 0 : Math.min(position, order.length - 1);
    const cardIndex = order[safePosition];
    const card = cardIndex === undefined ? null : cards[cardIndex];
    const rating = cardIndex === undefined ? undefined : ratings[cardIndex];
    const flipped = flip.card === cardIndex && flip.flipped;

    const go = (delta: number) => {
        if (order.length === 0) return;
        setPosition(Math.min(order.length - 1, Math.max(0, safePosition + delta)));
    };

    /** Rating doubles as the advance gesture, the way every revision deck works. */
    const rate = (confidence: Confidence) => {
        if (cardIndex === undefined) return;
        const clearing = rating === confidence;
        onRate(cardIndex, clearing ? null : confidence);
        if (!clearing && safePosition < order.length - 1) go(1);
    };

    /** Arrows and letters only — Space and Enter are the button's own to handle. */
    const handleKeyDown = (event: React.KeyboardEvent) => {
        const handlers: Record<string, () => void> = {
            ArrowLeft: () => go(-1),
            ArrowRight: () => go(1),
            e: () => rate("easy"),
            h: () => rate("hard"),
        };
        const handler = handlers[event.key.length === 1 ? event.key.toLowerCase() : event.key];
        if (!handler) return;

        event.preventDefault();
        handler();
    };

    const handleTouchEnd = (event: React.TouchEvent) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;

        // Horizontal intent only, so scrolling the page past the deck does not
        // shuffle it. A swipe is a navigation, so it must not also count as the
        // tap that flips the card.
        if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;
        event.preventDefault();
        go(deltaX < 0 ? 1 : -1);
    };

    if (cards.length === 0) {
        return <p className="text-base text-muted">No flashcards came out of this one.</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-muted">
                    <span className="text-foreground">
                        {order.length === 0 ? 0 : safePosition + 1} / {order.length}
                    </span>
                    {counts.easy > 0 && (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                            {counts.easy} easy
                        </span>
                    )}
                    {counts.hard > 0 && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                            {counts.hard} hard
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setHardOnly((current) => !current);
                            setPosition(0);
                        }}
                        disabled={counts.hard === 0 && !hardOnly}
                        aria-pressed={hardOnly}
                        className={`motion-hover motion-active flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-bold disabled:opacity-40 ${
                            hardOnly
                                ? "border-warning/40 bg-warning/10 text-warning"
                                : "border-border text-muted hover:text-foreground"
                        }`}
                    >
                        <Filter size={13} aria-hidden="true" /> Hard only
                    </button>
                    {(counts.easy > 0 || counts.hard > 0) && (
                        <button
                            type="button"
                            onClick={() => {
                                onResetRatings();
                                setHardOnly(false);
                                setPosition(0);
                            }}
                            className="motion-hover motion-active flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-bold text-muted hover:text-foreground"
                        >
                            <RotateCcw size={13} aria-hidden="true" /> Reset
                        </button>
                    )}
                </div>
            </div>

            {order.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background p-8 text-center">
                    <p className="text-base font-bold text-foreground">Nothing marked hard.</p>
                    <p className="mt-1 text-base text-muted">
                        Rate a card <span className="font-bold text-warning">Hard</span> to build a
                        review pile.
                    </p>
                </div>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={() =>
                            cardIndex !== undefined && setFlip({ card: cardIndex, flipped: !flipped })
                        }
                        onKeyDown={handleKeyDown}
                        onTouchStart={(event) => {
                            const touch = event.touches[0];
                            touchStart.current = { x: touch.clientX, y: touch.clientY };
                        }}
                        onTouchEnd={handleTouchEnd}
                        aria-expanded={flipped}
                        aria-roledescription="Flashcard"
                        aria-label={`Card ${safePosition + 1} of ${order.length}. Space flips it, left and right arrows change card, E marks easy, H marks hard.`}
                        className="study-flip h-64 w-full touch-pan-y text-left sm:h-56"
                    >
                        <span className="study-flip-inner block" data-flipped={flipped ? "true" : "false"}>
                            <span
                                inert={flipped}
                                aria-hidden={flipped}
                                className="study-flip-face motion-hover items-center justify-center gap-3 rounded-2xl border border-border bg-background p-6 text-center"
                            >
                                <span className="text-xs font-bold tracking-wider text-muted uppercase">
                                    Question {cardIndex !== undefined ? cardIndex + 1 : ""}
                                </span>
                                <span className="text-xl leading-6 font-bold text-foreground">
                                    {card?.question}
                                </span>
                                <span className="flex items-center justify-center gap-1.5 text-sm font-bold text-primary">
                                    <Repeat size={13} aria-hidden="true" /> Tap or press Space to flip
                                </span>
                            </span>

                            <span
                                inert={!flipped}
                                aria-hidden={!flipped}
                                className="study-flip-face study-flip-back items-start gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-6"
                            >
                                <span className="text-xs font-bold tracking-wider text-primary uppercase">
                                    Answer
                                </span>
                                <span className="text-lg leading-6 whitespace-pre-wrap text-foreground">
                                    {card?.answer}
                                </span>
                            </span>
                        </span>
                    </button>

                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => go(-1)}
                            disabled={safePosition === 0}
                            aria-label="Previous card"
                            className="motion-hover motion-active flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground disabled:opacity-40"
                        >
                            <ChevronLeft size={18} aria-hidden="true" />
                        </button>

                        <div className="flex flex-1 items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => rate("hard")}
                                aria-pressed={rating === "hard"}
                                className={`motion-hover motion-active flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-base font-bold sm:flex-none sm:px-5 ${
                                    rating === "hard"
                                        ? "border-warning bg-warning/15 text-warning"
                                        : "border-border text-muted hover:border-warning/40 hover:text-warning"
                                }`}
                            >
                                <ThumbsDown size={15} aria-hidden="true" /> Hard
                            </button>
                            <button
                                type="button"
                                onClick={() => rate("easy")}
                                aria-pressed={rating === "easy"}
                                className={`motion-hover motion-active flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-base font-bold sm:flex-none sm:px-5 ${
                                    rating === "easy"
                                        ? "border-success bg-success/15 text-success"
                                        : "border-border text-muted hover:border-success/40 hover:text-success"
                                }`}
                            >
                                <ThumbsUp size={15} aria-hidden="true" /> Easy
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => go(1)}
                            disabled={safePosition >= order.length - 1}
                            aria-label="Next card"
                            className="motion-hover motion-active flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground disabled:opacity-40"
                        >
                            <ChevronRight size={18} aria-hidden="true" />
                        </button>
                    </div>

                    <p aria-live="polite" className="sr-only">
                        Card {safePosition + 1} of {order.length}
                        {rating ? `, marked ${rating}` : ""}
                    </p>
                </>
            )}
        </div>
    );
}
