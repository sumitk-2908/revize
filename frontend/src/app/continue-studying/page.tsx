"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/api/core";
import { trackDocumentStat, getTrendingDocuments } from "../lib/api/analytics";
import { getSuggestedNextSteps } from "../lib/api/profile";
import { requestAuthPrompt } from "../lib/auth-prompts";
import { recordStudentDownload, requestUploadPrompt, shouldShowContributionPrompt, dismissContributionPrompt } from "../lib/student-prompts";
import { Clock, Sparkles, NotebookPen, FileQuestion, ListChecks, BookOpen } from "lucide-react";
import Link from "next/link";
import { DocumentGridSkeleton } from "@/components/layout/SharedLayouts";
import DocumentCard from "@/components/ui/DocumentCard";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { DocumentWithAnalytics } from "@/app/lib/document-types";
import { buildDownloadHref } from "@/app/lib/file-types";
import { useRecentStudyHistory } from "@/app/hooks/useStudyHistory";
import { useProfilePreferences } from "@/app/hooks/useProfile";
import { useQuery } from '@tanstack/react-query';
import { User } from "@supabase/supabase-js";

function ContinueStudyingContent() {
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

  const isSignedOut = !isAuthLoading && !user;

  const { data: history = [], isLoading: loadingHistory } = useRecentStudyHistory(user?.id);
  const { data: profile = null } = useProfilePreferences(user?.id);
  const { data: trending = [] } = useQuery({
    queryKey: ['trendingDocuments'],
    queryFn: getTrendingDocuments,
  });

  const [suggestions, setSuggestions] = useState<DocumentWithAnalytics[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showContributionPrompt, setShowContributionPrompt] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  const downloadingRef = useRef<Set<number>>(new Set());

  const loading = isAuthLoading || (user && loadingHistory);

  useEffect(() => {
    if (!user && !isAuthLoading) {
      setSuggestions([]);
      return;
    }

    if (loading || !history || !trending) return;

    let isMounted = true;

    const generateSuggestions = async () => {
      setSuggestionsLoading(true);
      setShowContributionPrompt(shouldShowContributionPrompt(0));

      const safeHistory = Array.isArray(history) ? history : [];
      const historyIds = new Set(safeHistory.map((d: any) => d.id));

      const userFavs: string[] = profile?.favorite_subjects || [];
      const userBranch: string | null = profile?.preferred_branch || null;

      let candidates: any[] = [];

      try {
        // Pool A: Popular/Trending (Acts as base and fallback)
        candidates = [...candidates, ...trending.map((d: any) => ({ ...d, recSource: 'trending' }))];

        // Pool B: History-based (Related to last document)
        if (safeHistory.length > 0) {
          const lastDoc = safeHistory[0];
          const related = await getSuggestedNextSteps(lastDoc, Array.from(historyIds), 5);
          candidates = [...candidates, ...related.map((d: any) => ({ ...d, recSource: 'related' }))];
        }

        // Pool C: Profile-based (Favorites)
        if (userFavs.length > 0) {
          const { data: profileDocs } = await supabase
            .from('documents')
            .select('*')
            .in('subject', userFavs)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(10);
            
          if (profileDocs) {
            candidates = [...candidates, ...profileDocs.map((d: any) => ({ ...d, recSource: 'profile' }))];
          }
        }
      } catch (e) {
        console.error("Error generating recommendation pools", e);
      }

      // 4. Intelligent Scoring & Ranking Algorithm
      const scoredDocs = new Map<number, any>();

      candidates.forEach(doc => {
        // Exclude items the user has already studied
        if (historyIds.has(doc.id)) return;

        let score = 0;
        
        // Base weights by source
        if (doc.recSource === 'related') score += 10;
        if (doc.recSource === 'profile') score += 8;
        if (doc.recSource === 'trending') score += 4;

        // Contextual Boosts
        if (userFavs.includes(doc.subject)) score += 5;
        
        // Branch match boost
        if (userBranch && (
          doc.subject?.toLowerCase().includes(userBranch.toLowerCase()) || 
          doc.title?.toLowerCase().includes(userBranch.toLowerCase())
        )) {
          score += 5; 
        }
        
        // Popularity Tie-breaker
        const popularityBonus = doc.view_count ? Math.min(doc.view_count / 50, 3) : 0;
        score += popularityBonus;

        // Deduplication & Score Aggregation
        if (scoredDocs.has(doc.id)) {
          scoredDocs.get(doc.id).score += (score * 0.5); 
        } else {
          scoredDocs.set(doc.id, { ...doc, score });
        }
      });

      // 5. Sort by final score and take top 3
      const finalRecommendations = Array.from(scoredDocs.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (isMounted) {
        setSuggestions(finalRecommendations);
        setSuggestionsLoading(false);
      }
    };

    generateSuggestions();

    return () => {
      isMounted = false;
    };
  }, [user, isAuthLoading, loading, history, profile, trending]);

  const handleDownload = async (e: React.MouseEvent, doc: any) => {
    e.preventDefault();
    if (downloadingRef.current.has(doc.id)) return;
    downloadingRef.current.add(doc.id);
    setDownloadingIds((prev) => [...prev, doc.id]);

    try {
      await trackDocumentStat(doc.id, 'download');
      const downloadCount = recordStudentDownload();
      if (downloadCount >= 3) setShowContributionPrompt(shouldShowContributionPrompt(0));
      const link = document.createElement("a");
      link.href = buildDownloadHref(doc.file_url, doc.title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        downloadingRef.current.delete(doc.id);
        setDownloadingIds((prev) => prev.filter((id) => id !== doc.id));
      }, 2000);
    }
  };

  const safeDocuments = Array.isArray(history) ? history : [];

  return (
    <div className="animate-fade-up mx-auto max-w-6xl space-y-10">
      
      {/* HISTORY SECTION */}
      <section className="space-y-6">
        <div className="flex items-center gap-4 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-6 shadow-sm">
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500 text-white"><Clock size={24} /></div>
          <div>
            <h1 className="text-xl font-extrabold sm:text-3xl">Continue Studying</h1>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-400">Jump back into your recent materials</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full"><DocumentGridSkeleton count={6} /></div>
        ) : isSignedOut ? (
          <div className="col-span-full rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/5 p-8 text-center">
            <p className="mx-auto max-w-md text-sm leading-6 font-medium text-muted">
              Sign in to pick up where you left off and get study suggestions based on your recent materials.
            </p>
            <button onClick={() => requestAuthPrompt("continueStudying")} className="motion-hover motion-active mt-4 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Continue Studying
            </button>
          </div>
        ) : safeDocuments.map(doc => (
            <DocumentCard
              key={`hist-${doc.id}`}
              doc={doc}
              onDownload={handleDownload}
              isDownloading={downloadingIds.includes(doc.id)}
            />
          ))}
          
          {safeDocuments.length === 0 && !loading && !isSignedOut && (
            <div className="col-span-full rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/5 p-8 text-center">
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">Start your study trail</h2>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">
                Open any resource and it will show up here when you return.
              </p>
              <Link href="/recent-uploads" className="motion-hover motion-active mt-4 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                Start Studying
              </Link>
            </div>
          )}
        </div>
      </section>

      {showContributionPrompt && !isSignedOut && (
        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-foreground">These resources helped you.</p>
            <p className="mt-1 text-sm leading-6 font-medium text-muted">Consider uploading your own notes to help future students.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={requestUploadPrompt} className="motion-hover motion-active rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              Upload Notes
            </button>
            <button
              onClick={() => {
                dismissContributionPrompt();
                setShowContributionPrompt(false);
              }}
              className="motion-hover motion-active rounded-xl px-3 py-2 text-sm font-bold text-muted hover:bg-surface-hover"
            >
              Later
            </button>
          </div>
        </section>
      )}

      {/* SUGGESTIONS SECTION */}
      {!loading && !suggestionsLoading && suggestions.length > 0 && (
        <section className="space-y-6 border-t border-gray-100 pt-4 dark:border-gray-800">
           <div className="flex items-center gap-3 px-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Sparkles size={18} />
            </div>
            <h2 className="text-lg font-bold text-foreground ">
              {safeDocuments.length === 0 ? "Trending Right Now" : "Suggested Next Steps"}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map(doc => {
              let badgeText = "Recommended";
              if ((doc as any).score) {
                if ((doc as any).recSource === 'related') badgeText = "Because you studied this";
                else if ((doc as any).recSource === 'profile') badgeText = "Based on your favorites";
                else if ((doc as any).recSource === 'trending') badgeText = "Trending right now";
              }
              return (
                <DocumentCard
                  key={`sugg-${doc.id}`}
                  doc={doc}
                  isSuggestion={true}
                  badgeText={badgeText}
                  onDownload={handleDownload}
                  isDownloading={downloadingIds.includes(doc.id)}
                />
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}

export default function ContinueStudyingPage() {
  return (
    <ErrorBoundary
      title="Study workspace could not load"
      message="Your recent activity ran into a problem. Navigate to any subject to keep studying."
    >
      <ContinueStudyingContent />
    </ErrorBoundary>
  );
}
