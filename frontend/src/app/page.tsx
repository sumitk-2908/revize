import { Metadata } from "next";
import HomeClient from "./HomeClient";
import { Suspense } from "react";
import { HomeSkeleton } from "@/components/layout/SharedLayouts";
import { getCachedSubjects, getCachedSubjectCounts, getCachedBranches } from "@/app/lib/api/cached-subjects";

export const metadata: Metadata = {
  title: {
    absolute: "Revize — Notes, PYQs & Study Materials for Engineering",
  },
  description: "Free notes, previous year questions, and study materials for 18+ engineering subjects. Crowd-sourced and peer-reviewed.",
  openGraph: {
    title: "Revize — Notes, PYQs & Study Materials for Engineering",
    description: "Free notes, previous year questions, and study materials for 18+ engineering subjects. Crowd-sourced and peer-reviewed.",
    url: "/",
  },
  twitter: {
    title: "Revize — Notes, PYQs & Study Materials for Engineering",
    description: "Free notes, previous year questions, and study materials for 18+ engineering subjects.",
  }
};

export const revalidate = 300;

export default async function Page() {
  // Fetch the public catalogue used by the landing page. Public analytics are
  // loaded by the shell's Analytics panel so they remain available on every route.
  // 1. Fetch subjects
  const subjects = await getCachedSubjects();

  // 2. Fetch item counts mapped to each subject
  const counts = await getCachedSubjectCounts();

  // 3. Fetch the branch catalogue used by the branch/year filters
  const branches = await getCachedBranches();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeClient
          initialSubjects={subjects}
          counts={counts}
          branches={branches}
        />
      </Suspense>
    </div>
  );
}