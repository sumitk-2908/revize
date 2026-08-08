"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/api/core";
import { LandingHero } from "@/components/landing/LandingHero";
import { TrendingCarousel } from "@/components/landing/TrendingCarousel";
import SubjectGrid from "@/components/SubjectGrid";
import { AnimatePresence, motion } from "framer-motion";
import { Subject, Branch } from "@/app/lib/api/subjects";

interface HomeClientProps {
  initialSubjects: Subject[];
  counts: Record<string, number>;
  branches: Branch[];
  globalStats: { subjects: number; modules: number; views: number; downloads: number };
  trendingDocs: any[];
}

export default function HomeClient({ initialSubjects, counts, branches, globalStats, trendingDocs }: HomeClientProps) {
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
            <LandingHero stats={globalStats} trendingDocs={trendingDocs} />
            <TrendingCarousel documents={trendingDocs} />
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
            <LandingHero stats={globalStats} trendingDocs={trendingDocs} />
            <TrendingCarousel documents={trendingDocs} />
          </motion.div>
        )}

        {authStatus === "authenticated" && (
          <motion.section
            key="greeting"
            initial={{ opacity: 0, height: 0, overflow: "hidden" }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-10 pt-8 text-center"
          >
            {firstName ? (
              <div className="mb-3 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-surface/50 px-3 py-1 text-sm font-semibold tracking-wide text-muted shadow-sm backdrop-blur-sm">
                  <span className="animate-pulse text-xl leading-none">👋</span>
                  Welcome back, {firstName}
                </span>
              </div>
            ) : (
              <div className="mb-3 h-8" />
            )}
            <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-foreground">
              Academic <span className="text-primary">Resource Hub</span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl px-4 text-muted">
              Select a subject domain below to access modules, notes,
              assignments, and previous year questions.
            </p>
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
