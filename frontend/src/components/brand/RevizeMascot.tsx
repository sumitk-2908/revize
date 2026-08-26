import { useId } from "react";

export type MascotState =
    | "celebrating"
    | "default"
    | "thinking"
    | "focused"
    | "confused"
    | "tired";

const stateColors: Record<MascotState, string> = {
    celebrating: "#ff694d",
    default: "#4b9bf5",
    thinking: "#f7a921",
    focused: "#22c55e",
    confused: "#a855f7",
    tired: "#9197a1",
};

const stateLabels: Record<MascotState, string> = {
    celebrating: "Revize celebrating mascot",
    default: "Revize mascot",
    thinking: "Revize thinking mascot",
    focused: "Revize focused mascot",
    confused: "Revize confused mascot",
    tired: "Revize tired mascot",
};

export interface RevizeMascotProps {
    state?: MascotState;
    className?: string;
    title?: string;
    decorative?: boolean;
    withBackground?: boolean;
}

/** A scalable, theme-independent Revize mascot for brand and product states. */
export function RevizeMascot({
    state = "celebrating",
    className = "",
    title,
    decorative = false,
    withBackground = true,
}: RevizeMascotProps) {
    const titleId = useId();
    const label = title ?? stateLabels[state];
    const ink = "#151515";
    const paper = "#fffefe";
    const accent = stateColors[state];

    return (
        <svg
            viewBox="0 0 120 120"
            className={className}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role={decorative ? undefined : "img"}
            aria-hidden={decorative || undefined}
            aria-labelledby={decorative ? undefined : titleId}
        >
            {!decorative && <title id={titleId}>{label}</title>}
            {withBackground && <circle cx="60" cy="60" r="58" fill={accent} />}

            {state === "thinking" && (
                <path d="M86 28a17 17 0 0 1 14 17c0 8-4 14-10 18" stroke={ink} strokeWidth="5" strokeLinecap="round" />
            )}

            <path
                d="M55 27c-8-5-19-3-24 6-9 3-14 12-11 21-8 6-9 14-3 18-4 10 1 19 11 22 4 10 14 14 24 10 6 5 14 5 20 0 11 3 21-2 24-12 10-3 15-13 11-23 6-7 4-17-4-22 3-10-2-20-11-23-5-9-16-12-25-7-7-6-15-7-22-2Z"
                fill={paper}
                stroke={ink}
                strokeWidth="5"
                strokeLinejoin="round"
            />
            <path d="M60 27v77" stroke={ink} strokeWidth="4" strokeLinecap="round" />

            {state === "celebrating" && (
                <>
                    <circle cx="43" cy="65" r="5" fill={ink} />
                    <circle cx="77" cy="65" r="5" fill={ink} />
                    <circle cx="45" cy="63" r="1.5" fill="white" />
                    <circle cx="79" cy="63" r="1.5" fill="white" />
                    <path d="M48 81c7 7 17 7 24 0" stroke={ink} strokeWidth="4" strokeLinecap="round" />
                    <path d="m89 27 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="#ffdd57" stroke={ink} strokeWidth="2.5" />
                    <path d="m28 36 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" fill="#ffdd57" stroke={ink} strokeWidth="2" />
                </>
            )}

            {state === "default" && (
                <>
                    <path d="M35 65c5-3 10-3 15 0M70 65c5-3 10-3 15 0" stroke={ink} strokeWidth="4" strokeLinecap="round" />
                    <path d="M55 82h10" stroke={ink} strokeWidth="4" strokeLinecap="round" />
                    <circle cx="88" cy="33" r="9" fill="#ffdd57" stroke={ink} strokeWidth="3" />
                    <path d="M88 20v-4M98 23l3-3M78 23l-3-3" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
                </>
            )}

            {state === "thinking" && (
                <>
                    <circle cx="43" cy="66" r="4.5" fill={ink} />
                    <circle cx="77" cy="66" r="4.5" fill={ink} />
                    <path d="M48 84c7 4 16 4 24-1" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
                    <circle cx="86" cy="28" r="4" fill={ink} />
                    <path d="M82 43c1 9 7 14 16 15" stroke="#b9b9b9" strokeWidth="4" strokeLinecap="round" />
                </>
            )}

            {state === "focused" && (
                <>
                    <path d="M36 66h14M70 66h14" stroke={ink} strokeWidth="5" strokeLinecap="round" />
                    <path d="M51 84c6-5 12-5 18 0" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
                    <path d="m87 88 17-27 7 5-17 27-9 5 2-10Z" fill="#ffdd57" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
                    <path d="m104 61 3-5 4 10" fill="#f7a921" stroke={ink} strokeWidth="3" />
                </>
            )}

            {state === "confused" && (
                <>
                    <circle cx="43" cy="68" r="5" fill={ink} />
                    <circle cx="77" cy="68" r="5" fill={ink} />
                    <path d="m34 59 15 5M86 59l-15 5" stroke={ink} strokeWidth="4" strokeLinecap="round" />
                    <path d="M51 85c6-4 12-4 18 0" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
                    <text x="59" y="25" fill={ink} fontSize="20" fontWeight="800" textAnchor="middle">?</text>
                </>
            )}

            {state === "tired" && (
                <>
                    <path d="m34 64 16 3M86 64l-16 3" stroke={ink} strokeWidth="5" strokeLinecap="round" />
                    <path d="M50 87c7-4 14-4 21 0" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
                    <path d="M42 71c-3 5-2 8 1 9 4-1 5-4 2-9" fill="#70b7ff" />
                    <path d="M77 71c-3 5-2 8 1 9 4-1 5-4 2-9" fill="#70b7ff" />
                    <circle cx="91" cy="31" r="10" fill="#d4d4d4" stroke={ink} strokeWidth="3" />
                    <path d="m84 24 14 14" stroke="#777" strokeWidth="3" />
                </>
            )}
        </svg>
    );
}
