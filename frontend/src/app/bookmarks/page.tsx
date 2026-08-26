"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/api/core";
import { useBookmarks, useToggleBookmarkMutation } from "../hooks/useBookmarks";
import { trackDocumentStat } from "../lib/api/analytics";
import { dispatchToast } from "../lib/toast";
import { Bookmark, Download, Eye, FileText, NotebookPen, FileQuestion, ListChecks, BookOpen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { manageOfflineFile } from "../lib/offline-manager";
import { buildDownloadHref } from "@/app/lib/file-types";
import { ensureDownloadAuth, requestAuthPrompt } from "../lib/auth-prompts";
import { requestUploadPrompt, shouldShowContributionPrompt, dismissContributionPrompt } from "../lib/student-prompts";
import { BookmarksSkeleton, InlineSpinner } from "@/components/layout/SharedLayouts";
import type { DocumentRecord, DocumentWithAnalytics } from "@/app/lib/document-types";
import DocumentCard from "@/components/ui/DocumentCard";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const CATEGORY_ICONS: Record<string, LucideIcon> = { notes: NotebookPen, pyq: FileQuestion, tutorial_sheet: BookOpen, syllabus: ListChecks };

function BookmarksContent() {
  const [userId, setUserId] = useState("");
  const [isSignedOut, setIsSignedOut] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sess }) => {
      if (sess?.session?.user) {
        setUserId(sess.session.user.id);
        setIsSignedOut(false);
      } else {
        setIsSignedOut(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setIsSignedOut(false);
      } else {
        setUserId("");
        setIsSignedOut(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: documents = [], isLoading: loading } = useBookmarks(userId);
  const toggleBookmarkMutation = useToggleBookmarkMutation();

  const [showContributionPrompt, setShowContributionPrompt] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  const downloadingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!loading && !isSignedOut) {
      setShowContributionPrompt(shouldShowContributionPrompt(documents.length));
    }
  }, [documents.length, loading, isSignedOut]);

  const toggleBookmark = (id: number) => {
    if (!userId) return;
    const doc = documents.find((d: DocumentRecord) => d.id === id);
    if (!doc) return;

    if (doc.file_url) {
      manageOfflineFile(doc.file_url, 'REMOVE_PDF').catch(console.error);
    }

    toggleBookmarkMutation.mutate({ userId, documentId: id, isAdding: false, doc });
  };

  const handleDownload = async (e: React.MouseEvent, doc: DocumentRecord | DocumentWithAnalytics) => {
    e.preventDefault();

    if (!(await ensureDownloadAuth())) return;
    if (downloadingRef.current.has(doc.id)) return;
    downloadingRef.current.add(doc.id);
    setDownloadingIds((prev) => [...prev, doc.id]);

    try {
      await trackDocumentStat(doc.id, 'download');
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

  if (loading) return <BookmarksSkeleton />;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center gap-4 rounded-3xl border border-warning/20 bg-warning/5 p-6 shadow-sm">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning text-primary-foreground">
          <Bookmark size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">My Bookmarks</h1>
          <p className="mt-1 text-sm font-semibold tracking-wider text-warning">Your saved PDFs and study materials</p>
        </div>
      </div>

      {showContributionPrompt && !isSignedOut && (
        <div className="flex flex-col gap-4 rounded-2xl border border-warning/20 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-foreground">Help others build their study library too.</p>
            <p className="mt-1 text-sm leading-6 font-medium text-muted">Your bookmarks are useful. Upload notes that made a subject click for you.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={requestUploadPrompt} className="motion-hover motion-active rounded-xl bg-warning px-4 py-2 text-sm font-bold text-white hover:opacity-90">
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
        </div>
      )}

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isSignedOut ? (
          <div className="col-span-full rounded-2xl border border-dashed border-warning/30 bg-warning/5 p-8 text-center">
            <p className="mx-auto max-w-md text-sm leading-6 font-medium text-muted">
              Sign in to sync your bookmarks and continue studying across all your devices.
            </p>
            <button onClick={() => requestAuthPrompt("bookmark")} className="motion-hover motion-active mt-4 rounded-xl bg-warning px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Save Bookmarks
            </button>
          </div>
        ) : documents.map((doc: DocumentRecord) => (
          <DocumentCard
            key={doc.id}
            doc={doc as DocumentWithAnalytics}
            isBookmarked={true}
            onDownload={handleDownload as any}
            onToggleBookmark={toggleBookmark}
            isDownloading={downloadingIds.includes(doc.id)}
          />
        ))}
        {documents.length === 0 && !isSignedOut && (
          <div className="col-span-full rounded-2xl border border-dashed border-warning/30 bg-warning/5 p-8 text-center">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">Build your study library</h2>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">
              Bookmark resources you want to revisit before exams.
            </p>
            <Link href="/recent-uploads" className="motion-hover motion-active mt-4 inline-flex rounded-xl bg-warning px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Bookmark Resources
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookmarksPage() {
  return (
    <ErrorBoundary
      title="Bookmarks could not load"
      message="Your saved library ran into a problem. The rest of the portal stays available."
    >
      <BookmarksContent />
    </ErrorBoundary>
  );
}
