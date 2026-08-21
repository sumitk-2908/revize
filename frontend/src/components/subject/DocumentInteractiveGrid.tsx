"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Eye, FileQuestion, Upload } from "lucide-react";
import { trackDocumentStat, toggleUpvote, getUserUpvotes } from "@/app/lib/api/analytics";
import { deleteDocument, getPaginatedDocumentsByModule } from "@/app/lib/api/documents";
import { supabase } from "@/app/lib/api/core";
import { manageOfflineFile } from "@/app/lib/offline-manager";
import { buildDownloadFilename } from "@/app/lib/file-types";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import { getUploadPromptCopy, recordStudentDownload, requestUploadPrompt, shouldShowContributionPrompt, dismissContributionPrompt } from "@/app/lib/student-prompts";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useInfiniteQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { withOptimisticUpdate } from "@/app/lib/optimistic";
import { dispatchToast } from "@/app/lib/toast";
import { useBookmarks, useToggleBookmarkMutation } from "@/app/hooks/useBookmarks";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { DocumentGridSkeleton, EmptyState, CenteredSpinner } from "@/components/layout/SharedLayouts";
import DocumentCard from "@/components/ui/DocumentCard";
import type { DocumentWithAnalytics, InfiniteDocumentsData, StoredBookmark } from "@/app/lib/document-types";

export interface PaginationConfig {
  queryKey: string[];
  moduleId: number;
  category?: string;
  sortBy?: string;
  subjectName?: string;
}

export default function DocumentInteractiveGrid({ 
  initialDocuments, 
  subjectSlug, 
  loading = false,
  paginationConfig 
}: { 
  initialDocuments: DocumentWithAnalytics[]; 
  subjectSlug: string;
  loading?: boolean;
  paginationConfig?: PaginationConfig;
}) {
  const queryClient = useQueryClient();
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [upvotes, setUpvotes] = useState<number[]>([]);
  const [upvoteCounts, setUpvoteCounts] = useState<Record<number, number>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cols, setCols] = useState(1);
  const [showContributionPrompt, setShowContributionPrompt] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  const [isClient, setIsClient] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: paginationConfig ? paginationConfig.queryKey : ['static-grid'],
    queryFn: ({ pageParam = 1 }) => getPaginatedDocumentsByModule(paginationConfig!.moduleId, pageParam, 20, paginationConfig?.category, paginationConfig?.sortBy, paginationConfig?.subjectName),
    initialPageParam: 1,
    enabled: !!paginationConfig,
    initialData: paginationConfig ? { pages: [{ data: initialDocuments, nextCursor: initialDocuments.length === 20 ? 2 : null, total: 0 }], pageParams: [1] } : undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    placeholderData: keepPreviousData,
  });

  const { data: bookmarkedDocs } = useBookmarks(userId || undefined);
  const bookmarks = useMemo(() => bookmarkedDocs?.map((d: any) => d.id) || [], [bookmarkedDocs]);
  const toggleBookmarkMutation = useToggleBookmarkMutation();

  const displayDocuments = useMemo(() => {
    const documents = paginationConfig
      ? (data?.pages.flatMap(page => page.data) || [])
      : initialDocuments;

    return documents.filter((doc) => !deletedIds.includes(doc.id));
  }, [data?.pages, deletedIds, initialDocuments, paginationConfig]);

  useEffect(() => {
    setShowContributionPrompt(shouldShowContributionPrompt(bookmarks.length));
  }, [bookmarks.length]);

  useEffect(() => {
    const initClientState = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user) {
        setUserId(sess.session.user.id);
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', sess.session.user.id).single();
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (roleData?.role === 'admin' && aalData?.currentLevel === 'aal2') setIsAdmin(true);

        const userUpvotes = await getUserUpvotes(sess.session.user.id);
        setUpvotes(userUpvotes);
      }
    };
    initClientState();

    const updateCols = () => {
      if (window.innerWidth >= 1024) setCols(3);
      else if (window.innerWidth >= 640) setCols(2);
      else setCols(1);
    };
    updateCols();
    setIsClient(true);
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  const rowCount = Math.ceil(displayDocuments.length / cols);
  
  const virtualizer = useWindowVirtualizer({
    count: hasNextPage ? rowCount + 1 : rowCount,
    estimateSize: () => 380, 
    overscan: 2, 
  });

  const virtualItems = virtualizer.getVirtualItems();
  
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= rowCount - 1 && hasNextPage && !isFetchingNextPage && paginationConfig) {
      fetchNextPage();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, fetchNextPage, rowCount, paginationConfig]);

  const toggleBookmark = async (id: number) => {
    if (!userId) {
      requestAuthPrompt("bookmark");
      return;
    }

    const isBookmarked = bookmarks.includes(id);
    const targetDoc = displayDocuments.find(d => d.id === id);

    if (isBookmarked) {
      if (targetDoc?.file_url) manageOfflineFile(targetDoc.file_url, 'REMOVE_PDF').catch(console.error);
    } else {
      if (targetDoc?.file_url) manageOfflineFile(targetDoc.file_url, 'CACHE_PDF').catch(console.error);
    }
    
    toggleBookmarkMutation.mutate({ userId, documentId: id, isAdding: !isBookmarked, doc: targetDoc });
  };

  const handleToggleUpvote = async (id: number) => {
    if (!userId) {
      requestAuthPrompt("profile");
      return;
    }

    const isUpvoted = upvotes.includes(id);
    const snapshotUpvotes = [...upvotes];
    const snapshotUpvoteCounts = { ...upvoteCounts };
    let snapshotDocAnalytics: any = null;

    // Get current count from state or fallback to doc data
    let currentCount = upvoteCounts[id];
    if (currentCount === undefined) {
      const doc = displayDocuments.find(d => d.id === id);
      const analyticsObj = Array.isArray(doc?.document_analytics) ? doc?.document_analytics[0] : doc?.document_analytics;
      currentCount = analyticsObj?.upvotes || 0;
    }

    if (paginationConfig) {
      const currentData = queryClient.getQueryData<InfiniteDocumentsData>(paginationConfig.queryKey);
      if (currentData) {
        const docPage = currentData.pages.find(p => p.data.find(d => d.id === id));
        const doc = docPage?.data.find(d => d.id === id);
        if (doc) {
          snapshotDocAnalytics = doc.document_analytics;
        }
      }
    }

    const applyOptimistic = () => {
      setUpvotes(prev => isUpvoted ? prev.filter(u => u !== id) : [...prev, id]);
      setUpvoteCounts(prev => ({
        ...prev,
        [id]: isUpvoted ? Math.max(0, currentCount - 1) : currentCount + 1
      }));
      
      if (paginationConfig) {
        queryClient.setQueryData<InfiniteDocumentsData>(paginationConfig.queryKey, (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((d) => {
                if (d.id === id) {
                  const analyticsObj = Array.isArray(d.document_analytics) ? d.document_analytics[0] : d.document_analytics;
                  const currentCount = analyticsObj?.upvotes || 0;
                  return {
                    ...d,
                    document_analytics: {
                      ...analyticsObj,
                      upvotes: isUpvoted ? Math.max(0, currentCount - 1) : currentCount + 1
                    }
                  };
                }
                return d;
              })
            }))
          };
        });
      }
    };

    const revertOptimistic = (snap: any, error?: unknown) => {
      setUpvotes(snapshotUpvotes);
      setUpvoteCounts(snapshotUpvoteCounts);
      if (paginationConfig && snapshotDocAnalytics) {
        queryClient.setQueryData<InfiniteDocumentsData>(paginationConfig.queryKey, (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((d) => d.id === id ? { ...d, document_analytics: snapshotDocAnalytics } : d)
            }))
          };
        });
      }
      const msg = error instanceof Error ? error.message : "Failed to update upvote";
      dispatchToast("Error", msg, "error");
    };

    const serverMutation = async () => {
      await toggleUpvote(id);
    };

    await withOptimisticUpdate(applyOptimistic, null, serverMutation, revertOptimistic);
  };

  const handleDownload = async (e: React.MouseEvent, doc: DocumentWithAnalytics) => {
    e.preventDefault();
    if (downloadingIds.includes(doc.id)) return;
    setDownloadingIds((prev) => [...prev, doc.id]);
    trackDocumentStat(doc.id, 'download');
    const downloadCount = recordStudentDownload();
    if (downloadCount >= 3) setShowContributionPrompt(shouldShowContributionPrompt(bookmarks.length));
    try {
      const response = await fetch(doc.file_url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const localUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = localUrl;
      link.download = buildDownloadFilename(doc.file_url, doc.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(localUrl);
    } catch (error) {
      console.error("Download failed:", error);
      dispatchToast("Download Failed", "Could not fetch the file from storage. Please try again.", "error");
    } finally {
      setTimeout(() => {
        setDownloadingIds((prev) => prev.filter((id) => id !== doc.id));
      }, 800);
    }
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    await deleteDocument(documentToDelete);
    setDeletedIds((prev) => [...prev, documentToDelete]);
    
    if (paginationConfig) {
      queryClient.setQueryData<InfiniteDocumentsData>(paginationConfig.queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((d) => d.id !== documentToDelete)
          }))
        };
      });
    }
    setDocumentToDelete(null);
  };

  if (loading) return <DocumentGridSkeleton count={6} />;
  if (displayDocuments.length === 0 && !hasNextPage) {
    const uploadCopy = getUploadPromptCopy(displayDocuments.length);

    return (
      <EmptyState
        title={uploadCopy.title}
        message={uploadCopy.message}
        icon={FileQuestion}
        action={
          <>
            <button onClick={requestUploadPrompt} className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              <Upload size={15} /> Upload Notes
            </button>
            <Link href="/recent-uploads" className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-hover">
              <Eye size={15} /> Start Studying
            </Link>
          </>
        }
      />
    );
  }

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {loading ? "Loading documents..." : `Showing ${displayDocuments.length} document${displayDocuments.length === 1 ? '' : 's'}`}
      </span>
      {showContributionPrompt && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold tracking-tight text-foreground">These resources helped you.</p>
            <p className="mt-1 text-sm leading-6 font-medium text-muted">Consider uploading your own notes to help future students.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={requestUploadPrompt} className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              <Upload size={15} /> Upload Notes
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

      {!isClient ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              subjectSlug={subjectSlug}
              isBookmarked={bookmarks.includes(doc.id)}
              isUpvoted={upvotes.includes(doc.id)}
              currentUpvoteCount={upvoteCounts[doc.id]}
              isAdmin={isAdmin}
              onDownload={handleDownload}
              onToggleBookmark={toggleBookmark}
              onToggleUpvote={handleToggleUpvote}
              onDelete={setDocumentToDelete}
              isDownloading={downloadingIds.includes(doc.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const isLoaderRow = virtualRow.index > rowCount - 1;

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: '1.5rem',
                paddingBottom: '1.5rem'
              }}
            >
              {isLoaderRow ? (
                 <CenteredSpinner />
              ) : (
                Array.from({ length: cols }).map((_, colIndex) => {
                  const itemIndex = virtualRow.index * cols + colIndex;
                  const doc = displayDocuments[itemIndex];
                  
                  if (!doc) return <div key={`empty-${colIndex}`} />;

                  return (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      subjectSlug={subjectSlug}
                      isBookmarked={bookmarks.includes(doc.id)}
                      isUpvoted={upvotes.includes(doc.id)}
                      currentUpvoteCount={upvoteCounts[doc.id]}
                      isAdmin={isAdmin}
                      onDownload={handleDownload}
                      onToggleBookmark={toggleBookmark}
                      onToggleUpvote={handleToggleUpvote}
                      onDelete={setDocumentToDelete}
                      isDownloading={downloadingIds.includes(doc.id)}
                    />
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      )}

      <AlertDialog.Root open={documentToDelete !== null} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <AlertDialog.Content className="motion-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-md translate-[-50%] gap-4 rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <AlertDialog.Title className="text-lg font-bold text-foreground">Confirm Deletion</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialog.Description>
            <div className="mt-4 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="motion-hover motion-active rounded-xl px-4 py-2 text-sm font-bold text-muted hover:bg-surface-hover">Cancel</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button onClick={confirmDelete} className="motion-hover motion-active rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90">Delete Document</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
