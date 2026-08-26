"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/api/core";
import { LandingHero } from "@/components/landing/LandingHero";
import SubjectGrid from "@/components/SubjectGrid";
import { AnimatePresence, motion } from "framer-motion";
import { Subject, Branch } from "@/app/lib/api/subjects";

interface HomeClientProps {
  initialSubjects: Subject[];
  counts: Record<string, number>;
  branches: Branch[];
}

export default function HomeClient({ initialSubjects, counts, branches }: HomeClientProps) {
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [firstName, setFirstName] = useState("");
  const [userFavs, setUserFavs] = useState<string[]>([]);
  const [userBranchId, setUserBranchId] = useState<number | null>(null);
  const [userYear, setUserYear] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (isMounted) setAuthStatus("unauthenticated");
        return;
      }

      if (isMounted) setAuthStatus("authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("favorite_subjects, full_name, branch_id, year_of_study")
        .eq("id", session.user.id)
        .single();

      if (isMounted) {
        if (profile?.favorite_subjects) {
          setUserFavs(profile.favorite_subjects);
        }
        if (profile?.full_name) {
          setFirstName(profile.full_name.split(" ")[0]);
        }
        setUserBranchId(profile?.branch_id ?? null);
        setUserYear(profile?.year_of_study ?? null);
      }
    };
    checkAuth();

    return () => { isMounted = false; };
  }, []);

  const sortedSubjects = useMemo(() => {
    return [...initialSubjects].sort((a, b) => {
      const aIsFav = userFavs.includes(a.name);
      const bIsFav = userFavs.includes(b.name);

      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;

      const aCount = counts[a.name.toUpperCase()] || 0;
      const bCount = counts[b.name.toUpperCase()] || 0;

      if (aCount > 0 && bCount === 0) return -1;
      if (aCount === 0 && bCount > 0) return 1;
      if (aCount !== bCount) return bCount - aCount;

      return a.name.localeCompare(b.name);
    });
  }, [initialSubjects, counts, userFavs]);

  return (
    <>
      <AnimatePresence mode="wait">
        {authStatus === "loading" && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            transition={{ duration: 0.3 }}
          >
            {/* 
              Reserve space at the top. We show the LandingHero to prevent a blank page 
              while loading auth state, ensuring SSR/SEO bots see the public content. 
            */}
            <LandingHero />
          </motion.div>
        )}

        {authStatus === "unauthenticated" && (
          <motion.div
            key="unauth"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            transition={{ duration: 0.3 }}
          >
            <LandingHero />
          </motion.div>
        )}

        {authStatus === "authenticated" && (
          <motion.section
            key="greeting"
            initial={{ opacity: 0, height: 0, overflow: "hidden" }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-6 flex flex-wrap items-center justify-between gap-3 py-6"
          >
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Welcome to <span className="text-primary">Revize</span>
              </h1>
              {firstName && <span className="hidden text-sm text-muted sm:inline">· Welcome back, {firstName}</span>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.section layout className={authStatus !== "authenticated" ? "border-t border-border pt-12" : ""}>
        {authStatus !== "authenticated" && (
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-foreground">Browse All Subjects</h2>
            <p className="text-muted">Explore our complete collection of academic materials by domain</p>
          </div>
        )}
        <SubjectGrid
          subjects={sortedSubjects}
          subjectCounts={counts}
          branches={branches}
          defaultBranchId={userBranchId}
          defaultYear={userYear}
        />
      </motion.section>
    </>
  );
}
