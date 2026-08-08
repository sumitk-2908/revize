import { createClient } from "@/utils/supabase/server";
import { Metadata } from "next";
import HomeClient from "./HomeClient";
import { Suspense } from "react";
import { HomeSkeleton } from "@/components/layout/SharedLayouts";
import { getCachedSubjects, getCachedSubjectCounts, getCachedBranches } from "@/app/lib/api/cached-subjects";

export const metadata: Metadata = {
  title: {
    absolute: "Academic Resource Hub — Notes, PYQs & Study Materials for Engineering",
  },
  description: "Free notes, previous year questions, and study materials for 18+ engineering subjects. Crowd-sourced and peer-reviewed.",
  openGraph: {
    title: "Academic Resource Hub — Notes, PYQs & Study Materials for Engineering",
    description: "Free notes, previous year questions, and study materials for 18+ engineering subjects. Crowd-sourced and peer-reviewed.",
    url: "/",
  },
  twitter: {
    title: "Academic Resource Hub — Notes, PYQs & Study Materials for Engineering",
    description: "Free notes, previous year questions, and study materials for 18+ engineering subjects.",
  }
};

export const revalidate = 300;

export default async function Page() {
  const supabase = await createClient();

  // 1. Fetch subjects
  const subjects = await getCachedSubjects();

  // 2. Fetch item counts mapped to each subject
  const counts = await getCachedSubjectCounts();

  // 3. Fetch the branch catalogue used by the branch/year filters
  const branches = await getCachedBranches();

  // 4. Fetch stats and trending globally (cacheable)
  const [{ count: modulesCount }, { data: analytics }, { data: recentDocs }] = await Promise.all([
    supabase.from("modules").select("*", { count: "exact", head: true }),
    supabase.from("document_analytics").select("view_count, download_count"),
    supabase.from("documents")
      .select("*, document_analytics(upvotes, view_count, download_count)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const globalStats = {
    subjects: subjects.length,
    modules: modulesCount || 0,
    views: analytics?.reduce((acc, curr) => acc + (curr.view_count || 0), 0) || 0,
    downloads: analytics?.reduce((acc, curr) => acc + (curr.download_count || 0), 0) || 0,
  };
  
  const trendingDocs = recentDocs || [];

  return (
    <div className="animate-fade-up mx-auto w-full max-w-6xl">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeClient
          initialSubjects={subjects}
          counts={counts}
          branches={branches}
          globalStats={globalStats}
          trendingDocs={trendingDocs}
        />
      </Suspense>
    </div>
  );
}