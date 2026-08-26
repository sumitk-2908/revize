"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

const PAGE_EASE = "easeOut" as const;
const REVEAL_EASE = [0.32, 0.72, 0, 1] as const;

type MotionDivProps = HTMLMotionProps<"div">;

export function PageEnter({ children, ...props }: MotionDivProps) {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: PAGE_EASE }}
            {...props}
        >
            {children}
        </motion.div>
    );
}

export function ScrollReveal({ children, ...props }: MotionDivProps) {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: reduceMotion ? 0 : 0.42, ease: REVEAL_EASE }}
            {...props}
        >
            {children}
        </motion.div>
    );
}
