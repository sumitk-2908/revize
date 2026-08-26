"use client";

import { useAuth } from "@/app/context/AuthContext";
import { motion, useReducedMotion } from "framer-motion";
import { GraduationCap, ShieldCheck, Cloud, Zap, Users } from "lucide-react";

const HERO_EASE = [0.32, 0.72, 0, 1] as const;

export function LandingHero() {
  const { setAuthMode, setShowAuthModal } = useAuth();
  const reduceMotion = useReducedMotion();
  const reveal = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : delay, ease: HERO_EASE },
  });

  const handleSignUp = () => {
    setAuthMode("signup");
    setShowAuthModal(true);
  };

  return (
    <div className="relative mx-auto max-w-full overflow-hidden px-4 pb-12 pt-16 sm:pt-24">
      <div className="flex flex-col items-center text-center">
        <motion.div {...reveal(0)} className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary dark:bg-primary/20">
          <GraduationCap size={16} />
          Built for Students, by Students
        </motion.div>

        <motion.h1 {...reveal(0.06)} className="mb-6 max-w-4xl text-4xl font-extrabold text-foreground sm:text-6xl">
          Everything You Need to <br className="hidden sm:block" />
          Study <span className="text-primary">Smarter</span>
        </motion.h1>

        <motion.p {...reveal(0.12)} className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Explore the powerful features designed to help you access, organize, and
          make the most of your academic journey.
        </motion.p>

        <motion.div {...reveal(0.18)} className="mb-16">
          <button
            onClick={handleSignUp}
            className="motion-hover motion-active rounded-lg bg-primary px-7 py-3.5 text-lg font-bold text-primary-foreground shadow-lg hover:opacity-90 hover:shadow-primary/25"
          >
            Join the Community
          </button>
        </motion.div>
      </div>

      {/* Bottom Features Row */}
      <motion.div {...reveal(0.24)} className="mx-auto max-w-6xl border-t border-border pt-8">
        <div className="grid gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h4 className="font-bold text-foreground">Trusted & Secure</h4>
              <p className="text-sm text-muted">Your data and privacy are always protected.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Cloud size={24} />
            </div>
            <div>
              <h4 className="font-bold text-foreground">Cloud Sync</h4>
              <p className="text-sm text-muted">Access your library from anywhere, anytime.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Zap size={24} />
            </div>
            <div>
              <h4 className="font-bold text-foreground">Fast & Lightweight</h4>
              <p className="text-sm text-muted">Optimized for speed and a smooth experience.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
              <Users size={24} />
            </div>
            <div>
              <h4 className="font-bold text-foreground">Built for Students</h4>
              <p className="text-sm text-muted">Made to support your academic success.</p>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
