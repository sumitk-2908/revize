"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/api/core";
import { useBookmarks } from "@/app/hooks/useBookmarks";
import { useFullStudyHistory, useStudyActivityCalendar } from "@/app/hooks/useStudyHistory";
import { useSubjects } from "@/app/hooks/useSubjects";
import { useStudyStreak, useAchievements, useEnhancedContributions } from "@/app/hooks/useProfile";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileStats from "@/components/profile/ProfileStats";
import ProfileTabs from "@/components/profile/ProfileTabs";
import { Activity, Flame, Upload, User as UserIcon } from "lucide-react";
import { ProfileSkeleton } from "@/components/layout/SharedLayouts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { User } from "@supabase/supabase-js";

function ProfileContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sess }) => {
      setUser(sess?.session?.user || null);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: bookmarks = [], isLoading: loadingBookmarks } = useBookmarks(user?.id);
  const { data: history = [], isLoading: loadingHistory } = useFullStudyHistory(user?.id);
  const { data: studyActivity = [] } = useStudyActivityCalendar(user?.id);
  const { data: subjects = [], isLoading: loadingSubjects } = useSubjects();
  const { data: streak = null, isLoading: loadingStreak } = useStudyStreak(user?.id);
  const { data: achievements = [], isLoading: loadingAchievements } = useAchievements(user?.id);
  const { data: uploads = [], isLoading: loadingUploads } = useEnhancedContributions(user?.id);

  const loading = isAuthLoading || (user && (loadingBookmarks || loadingHistory || loadingSubjects || loadingStreak || loadingAchievements || loadingUploads));

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-4xl pb-12">
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <UserIcon size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Open your profile</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 font-medium text-muted">
                Sign in to see your bookmarks, study streak, contribution history, and activity in one place.
              </p>
              <button onClick={() => requestAuthPrompt("profile")} className="motion-hover motion-active mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                Open Profile
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <button onClick={() => requestAuthPrompt("studyStreak")} className="motion-hover rounded-2xl border border-border bg-surface p-4 text-left shadow-sm hover:border-primary/40">
            <Flame className="mb-3 text-warning" size={20} />
            <p className="text-sm font-bold text-foreground">Study Streak</p>
            <p className="mt-1 text-xs leading-5 text-muted">Keep your streak updated as you study.</p>
          </button>
          <button onClick={() => requestAuthPrompt("contributionHistory")} className="motion-hover rounded-2xl border border-border bg-surface p-4 text-left shadow-sm hover:border-primary/40">
            <Upload className="mb-3 text-success" size={20} />
            <p className="text-sm font-bold text-foreground">Contribution History</p>
            <p className="mt-1 text-xs leading-5 text-muted">Track uploads, approvals, and impact.</p>
          </button>
          <button onClick={() => requestAuthPrompt("activityGraph")} className="motion-hover rounded-2xl border border-border bg-surface p-4 text-left shadow-sm hover:border-primary/40">
            <Activity className="mb-3 text-primary" size={20} />
            <p className="text-sm font-bold text-foreground">Activity Graph</p>
            <p className="mt-1 text-xs leading-5 text-muted">Build your private study activity timeline.</p>
          </button>
        </div>
      </div>
    );
  }

  const totalImpact = (uploads || []).reduce(
    (acc: number, u: any) => {
      return acc + (u.document_analytics?.download_count || 0);
    },
    0
  );

  const stats = {
    subjects: subjects?.length || 0,
    bookmarks: bookmarks?.length || 0,
    uploads: uploads?.length || 0,
    downloads: totalImpact,
  };

  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <h1 className="mb-6 hidden text-2xl font-extrabold tracking-tight text-foreground sm:block">
        Student Profile
      </h1>

      <ProfileHeader user={user} streak={streak} />

      <ProfileStats stats={stats} />

      <ProfileTabs
        user={user}
        history={history}
        studyActivity={studyActivity}
        bookmarks={bookmarks}
        uploads={uploads}
        achievements={achievements}
      />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ErrorBoundary
      title="Profile could not load"
      message="Your profile workspace ran into a problem. Retry this section while the rest of the portal stays available."
    >
      <ProfileContent />
    </ErrorBoundary>
  );
}
