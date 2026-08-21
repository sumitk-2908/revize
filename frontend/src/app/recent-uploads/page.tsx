"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { trackDocumentStat } from "../lib/api/analytics";
import { searchDocuments } from "../lib/api/documents";
import { supabase } from "../lib/api/core";
import { Upload, Eye, Download, FileText, NotebookPen, FileQuestion, ListChecks, Bookmark, BookOpen } from "lucide-react";
import Link from "next/link";
import { getUploadPromptCopy, recordStudentDownload, requestUploadPrompt, shouldShowContributionPrompt, dismissContributionPrompt } from "../lib/student-prompts";
import { requestAuthPrompt } from "../lib/auth-prompts";
import { manageOfflineFile } from "../lib/offline-manager";
import { buildDownloadHref } from "@/app/lib/file-types";
import { DocumentGridSkeleton, InlineSpinner } from "@/components/layout/SharedLayouts";
import DocumentCard from "@/components/ui/DocumentCard";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { DocumentWithAnalytics } from "@/app/lib/document-types";
import { useBookmarks, useToggleBookmarkMutation } from "@/app/hooks/useBookmarks";

const CATEGORY_ICONS: Record<string, any> = { notes: NotebookPen, pyq: FileQuestion, tutorial_sheet: BookOpen, syllabus: ListChecks };

function RecentUploadsContent() {
  const [documents, setDocuments] = useState<DocumentWithAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContributionPrompt, setShowContributionPrompt] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);

  const downloadingRef = useRef<Set<number>>(new Set());

  const { data: bookmarkedDocs } = useBookmarks(userId || undefined);
  const bookmarks = useMemo(() => bookmarkedDocs?.map((d: any) => d.id) || [], [bookmarkedDocs]);
  const toggleBookmarkMutation = useToggleBookmarkMutation();

  useEffect(() => {
    const fetchRecent = async () => {
      setLoading(true);

      const { data: sess } = await supabase.auth.getSession();
      setUserId(sess?.session?.user?.id || null);

      const response = await searchDocuments({ limit: 24, sortBy: "created_at", sortOrder: "desc" });
      setDocuments(response.data);
      setLoading(false);
    };
    fetchRecent();
  }, []);

  useEffect(() => {
    setShowContributionPrompt(shouldShowContributionPrompt(bookmarks.length));
  }, [bookmarks.length]);

  const toggleBookmark = async (doc: any) => {
    if (!userId) {
      requestAuthPrompt("bookmark");
      return;
    }

    const isBookmarked = bookmarks.includes(doc.id);

    if (isBookmarked) {
      if (doc.file_url) manageOfflineFile(doc.file_url, "REMOVE_PDF").catch(console.error);
    } else {
      if (doc.file_url) manageOfflineFile(doc.file_url, "CACHE_PDF").catch(console.error);
    }

    toggleBookmarkMutation.mutate({ userId, documentId: doc.id, isAdding: !isBookmarked, doc });
  };

  const handleDownload = async (e: React.MouseEvent, doc: any) => {
    e.preventDefault();

    if (downloadingRef.current.has(doc.id)) return;
    downloadingRef.current.add(doc.id);
    setDownloadingIds((prev) => [...prev, doc.id]);

    try {
      await trackDocumentStat(doc.id, "download");
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

  return (
    <div className="animate-fade-up mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center gap-4 rounded-3xl border border-success/20 bg-success/5 p-6 shadow-sm">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success text-white">
          <Upload size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Recent Uploads</h1>
          <p className="mt-1 text-sm font-semibold tracking-wider text-success">The newest resources added to the portal</p>
        </div>
      </div>

      {showContributionPrompt && (
        <div className="flex flex-col gap-4 rounded-2xl border border-success/20 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-foreground">These resources helped you.</p>
            <p className="mt-1 text-sm leading-6 font-medium text-muted">Consider uploading your own notes to help future students.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={requestUploadPrompt} className="motion-hover motion-active rounded-xl bg-success px-4 py-2 text-sm font-bold text-white hover:opacity-90">
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

      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full"><DocumentGridSkeleton count={6} /></div>
        ) : documents.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-success/30 bg-success/5 p-8 text-center">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">{getUploadPromptCopy(0).title}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">{getUploadPromptCopy(0).message}</p>
            <button onClick={requestUploadPrompt} className="motion-hover motion-active mt-4 inline-flex rounded-xl bg-success px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Upload Notes
            </button>
          </div>
        ) : (
          documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              isBookmarked={bookmarks.includes(doc.id)}
              onDownload={handleDownload}
              onToggleBookmark={() => toggleBookmark(doc)}
              isDownloading={downloadingIds.includes(doc.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function RecentUploadsPage() {
  return (
    <ErrorBoundary
      title="Uploads could not load"
      message="The recent uploads section hit an unexpected problem. Retry it or continue using the rest of the portal."
    >
      <RecentUploadsContent />
    </ErrorBoundary>
  );
}
