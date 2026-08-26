"use client";

import { useEffect, useState, useRef, useCallback, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Share2, Link as LinkIcon, Check, Maximize, Minimize, Search, X,
  ThumbsUp, Flag, BookOpen, List, Keyboard, Columns3, Map,
  Download, File as FileIcon, FileText, FileSpreadsheet, Presentation,
  PanelRight, ChevronDown
} from "lucide-react";
import { usePathname, useRouter } from 'next/navigation';
import NextImage from "next/image";
import { supabase } from "@/app/lib/api/core";
import { trackDocumentStat, toggleUpvote, getUserUpvotes } from "@/app/lib/api/analytics";
import { triggerStreakUpdate } from "@/app/lib/api/profile";
import { useLogStudySessionMutation, useUpdateReadingProgressMutation } from "@/app/hooks/useStudyHistory";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Document, Page, pdfjs } from 'react-pdf';
import { useVirtualizer } from '@tanstack/react-virtual';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { InlineSpinner, SkeletonBlock } from "@/components/layout/SharedLayouts";
import { dispatchToast as showToast } from "@/app/lib/toast";
import { buildDownloadHref, getExtension, getFileKind, getFileLabel } from "@/app/lib/file-types";
import { ensureDownloadAuth } from "@/app/lib/auth-prompts";
import { usePdfTextSearch } from "./usePdfTextSearch";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const TOOLBAR_BUTTON = "motion-hover motion-active inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-300 outline-none hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-35 data-[state=open]:bg-white/10 data-[state=open]:text-white";

function ToolTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={7} className="z-[120] rounded-md bg-zinc-950 px-2 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-white/10">
          {label}
          <Tooltip.Arrow className="fill-zinc-950" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Icon shown on the download-only card for file types with no in-app preview.
const UNSUPPORTED_ICONS: Record<string, typeof FileIcon> = {
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
};

export default function PDFViewerClient({ documentMeta }: { documentMeta: any }) {
  const router = useRouter();
  const logStudySessionMutation = useLogStudySessionMutation();
  // `mutateAsync` is bound once by the mutation observer, so it is stable enough
  // to appear in a dependency list. The object `useMutation` returns is not — it
  // is a fresh literal every render, and depending on it re-armed the save
  // debounce below on every render instead of on every page change.
  const { mutateAsync: saveReadingProgress } = useUpdateReadingProgressMutation();

  // How this document renders is derived from the extension on its stored URL —
  // there is no file-type column, so this also covers every pre-existing row.
  const fileKind = getFileKind(documentMeta?.file_url);
  const fileLabel = getFileLabel(documentMeta?.file_url);
  const isPdf = fileKind === "pdf";

  const [numPages, setNumPages] = useState<number>(0);

  // Reading progress. `savedPage` is this document's stored position: null while
  // it is still being fetched, 0 once we know there is nothing to go back to.
  // `restored` gates the writer further down — it must not run before the stored
  // position has been applied, or the debounce fires on page 1 and overwrites
  // the very position it was about to restore. `resumedAt` only drives the notice.
  const [savedPage, setSavedPage] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const hasJumpedToSavedPage = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the stored row holds as far as we know, so the writer can skip work
  // that would change nothing. 0 means no position is stored.
  const storedPageRef = useRef(0);
  // Latest values for the flush-on-exit path, which must not close over the page
  // and gate as they stood when its listener was attached.
  const currentPageRef = useRef(1);
  const restoredRef = useRef(false);
  const [pdfDocument, setPdfDocument] = useState<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pageJump, setPageJump] = useState("1");
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);

  // Natural aspect ratio of an image document, measured once it loads, so the
  // zoom box matches the image instead of guessing A4 like the PDF path does.
  const [imageRatio, setImageRatio] = useState<number>(1 / 1.414);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);

  const rowVirtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => containerRef.current,
    // First guess only — each page reports its real height through
    // measureElement once rendered. `scale` belongs here because react-pdf
    // renders a page at width * scale, so zooming changes every row's height.
    estimateSize: () => (containerWidth * 0.95 * scale * 1.414) + 16, // A4 aspect ratio + margin
    overscan: 2,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // The page sitting at the top of the viewport.
  //
  // This used to read `virtualItems[0].index`, but getVirtualItems() includes
  // the `overscan` rows rendered *above* the visible range — so on any page past
  // the second, currentPage read up to 2 pages behind where the user actually
  // was. Next then scrolled to a page already behind them (looking like it went
  // backwards) and Prev appeared to do nothing. Resolving the offset directly
  // asks the virtualizer which row is genuinely at the scroll position.
  const currentPage = numPages > 0
    ? Math.min((rowVirtualizer.getVirtualItemForOffset(rowVirtualizer.scrollOffset ?? 0)?.index ?? 0) + 1, numPages)
    : 1;

  // Zoom applies to the two rendered formats; text reflows and Office files
  // have no preview at all.
  const canZoom = isPdf || fileKind === "image";

  const pdfSearch = usePdfTextSearch(pdfDocument);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const hasTrackedView = useRef(false);
  const isDownloading = useRef(false);



  const [userRating, setUserRating] = useState<boolean | null>(null);
  const [upvotesCount, setUpvotesCount] = useState(() => {
    const analyticsObj = Array.isArray(documentMeta?.document_analytics) ? documentMeta?.document_analytics[0] : documentMeta?.document_analytics;
    return analyticsObj?.upvotes || 0;
  });
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<'incorrect' | 'duplicate' | 'low_quality' | 'other'>('incorrect');
  const [flagDescription, setFlagDescription] = useState('');
  const [isSubmittingQuality, setIsSubmittingQuality] = useState(false);

  useEffect(() => {
    const analyticsObj = Array.isArray(documentMeta?.document_analytics) ? documentMeta?.document_analytics[0] : documentMeta?.document_analytics;
    setUpvotesCount(analyticsObj?.upvotes || 0);
  }, [documentMeta?.document_analytics]);

  useEffect(() => {
    const fetchUserRating = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user?.id && documentMeta?.id) {
        const upvotes = await getUserUpvotes(sess.session.user.id);
        if (upvotes.includes(documentMeta.id)) {
          setUserRating(true);
        }
      }
    };
    fetchUserRating();
  }, [documentMeta?.id]);

  useEffect(() => {
    const trackAnalytics = async () => {
      if (!hasTrackedView.current && documentMeta) {
        hasTrackedView.current = true;

        await trackDocumentStat(documentMeta.id, 'view');

        const { data: sess } = await supabase.auth.getSession();
        if (sess?.session?.user?.id) {
          logStudySessionMutation.mutate({
            userId: sess.session.user.id,
            documentId: documentMeta.id,
            doc: {
              ...documentMeta,
              accessed_at: new Date().toISOString()
            }
          });
          await triggerStreakUpdate(sess.session.user.id);
        }
      }
    };
    trackAnalytics();
  }, [documentMeta]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    const observer = containerRef.current ? new ResizeObserver(updateWidth) : null;
    if (containerRef.current && observer) observer.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", updateWidth);
      observer?.disconnect();
    };
  }, []);

  // .txt / .md are fetched and shown as plain text. They are stored with a
  // text/plain content type, so the contents are never interpreted as HTML.
  useEffect(() => {
    if (fileKind !== "text" || !documentMeta?.file_url) return;

    let cancelled = false;
    const loadText = async () => {
      try {
        const response = await fetch(documentMeta.file_url, { mode: "cors", credentials: "omit" });
        if (!response.ok) throw new Error(`Storage returned ${response.status}`);
        const body = await response.text();
        if (!cancelled) setTextContent(body);
      } catch (error) {
        console.error("Failed to load text document:", error);
        if (!cancelled) setTextError(true);
      }
    };
    loadText();

    return () => { cancelled = true; };
  }, [fileKind, documentMeta?.file_url]);

  function onDocumentLoadSuccess(document: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>) {
    setPdfDocument(document);
    setNumPages(document.numPages);
  }

  // Fetch the stored position for this document. The localStorage mirror is the
  // fallback: it is written alongside every save, so a position still resolves
  // when the reader is offline, or signed out on a device they have used before.
  useEffect(() => {
    setSavedPage(null);
    setRestored(false);
    setResumedAt(null);
    hasJumpedToSavedPage.current = false;
    storedPageRef.current = 0;

    if (!isPdf || !documentMeta?.id) {
      setSavedPage(0);
      return;
    }

    let cancelled = false;
    const loadReadingProgress = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess?.session?.user?.id;

      let page: number | null = null;
      if (userId) {
        const { data } = await supabase
          .from('study_history')
          .select('last_page')
          .eq('user_id', userId)
          .eq('document_id', documentMeta.id)
          .maybeSingle();
        page = data?.last_page ?? null;
      }

      if (!page) {
        try {
          const stored = JSON.parse(localStorage.getItem('portal_study_history') || '[]');
          const mirrored = Array.isArray(stored)
            ? stored.find((item: { id: number }) => item.id === documentMeta.id)
            : null;
          page = mirrored?.last_page ?? null;
        } catch {
          page = null;
        }
      }

      if (!cancelled) {
        storedPageRef.current = page ?? 0;
        setSavedPage(page ?? 0);
      }
    };

    loadReadingProgress();
    return () => { cancelled = true; };
  }, [documentMeta?.id, isPdf]);

  const saveProgress = useCallback(async (page: number) => {
    if (!documentMeta?.id || page < 1) return;

    // Nothing worth writing: the row already holds this page, or the reader is
    // on page 1 of a document they have no stored position in — every document
    // opened would otherwise be stamped "resume at page 1". Page 1 *is* worth
    // storing when it replaces a real position; that is how a reader who starts
    // a document over stops being sent back to where they were.
    if (page === storedPageRef.current) return;
    if (page === 1 && storedPageRef.current === 0) return;

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) return;

    // Claimed before the write so the debounce and the flush-on-exit below
    // cannot both send the same page.
    storedPageRef.current = page;

    try {
      await saveReadingProgress({ userId, documentId: documentMeta.id, lastPage: page });
    } catch (error) {
      console.warn('Failed to save reading progress:', error);
    }

    // Mirrored whether or not the write above landed — that is what lets the
    // position survive a failed request. Only an entry already in the list is
    // patched; seeding it is logStudySession's job.
    try {
      const stored = JSON.parse(localStorage.getItem('portal_study_history') || '[]');
      if (Array.isArray(stored)) {
        localStorage.setItem('portal_study_history', JSON.stringify(
          stored.map((item: { id: number }) => (
            item.id === documentMeta.id ? { ...item, last_page: page } : item
          )),
        ));
      }
    } catch { /* localStorage is best effort */ }
  }, [documentMeta?.id, saveReadingProgress]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    restoredRef.current = restored;
  }, [currentPage, restored]);

  // Page heights are cached per index once measured. Zooming or resizing changes
  // every one of them, so the cache has to be dropped or scrollToIndex keeps
  // aiming at stale offsets and lands on the wrong page.
  useEffect(() => {
    if (numPages > 0) rowVirtualizer.measure();
  }, [scale, containerWidth, numPages, rowVirtualizer]);

  const goToPage = useCallback((page: number) => {
    if (numPages === 0) return;
    rowVirtualizer.scrollToIndex(Math.min(Math.max(page, 1), numPages) - 1, { align: 'start' });
  }, [numPages, rowVirtualizer]);

  // Resume where the reader stopped, once the PDF is loaded and laid out.
  // The ref guard makes the jump strictly once per document: `containerWidth`
  // and `numPages` below keep changing over a document's life — a window resize
  // re-runs this effect — and without it every resize would drag the reader back
  // to the saved page.
  useEffect(() => {
    if (hasJumpedToSavedPage.current || savedPage === null) return;

    // Images, text and Office files have no page to return to. Unblock the
    // writer so it does not sit armed forever, and stop.
    if (!isPdf) {
      hasJumpedToSavedPage.current = true;
      setRestored(true);
      return;
    }

    // scrollToIndex needs the row heights, which only exist once the document
    // has loaded and the container has been measured.
    if (numPages < 1 || containerWidth === 0) return;
    hasJumpedToSavedPage.current = true;

    if (savedPage <= 1 || savedPage > numPages) {
      setRestored(true);
      return;
    }

    goToPage(savedPage);
    setResumedAt(savedPage);
    // scrollToIndex re-aims as pages report their real heights, so currentPage
    // is still in flight for a moment after the call. Hold the writer back
    // until that settles instead of saving a page being scrolled past.
    settleTimer.current = setTimeout(() => setRestored(true), 1500);
  }, [savedPage, isPdf, numPages, containerWidth, goToPage]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  // The notice retires itself; nobody should have to dismiss a confirmation.
  useEffect(() => {
    if (resumedAt === null) return;
    const hide = setTimeout(() => setResumedAt(null), 8000);
    return () => clearTimeout(hide);
  }, [resumedAt]);

  // One write per pause in reading, rather than one per page scrolled past.
  useEffect(() => {
    if (!isPdf || !restored || numPages < 1) return;
    const timer = setTimeout(() => { void saveProgress(currentPage); }, 800);
    return () => clearTimeout(timer);
  }, [currentPage, isPdf, numPages, restored, saveProgress]);

  // That debounce is dropped on unmount and when the tab goes away — exactly
  // when the last position matters most — so flush on the way out.
  // `visibilitychange` rather than `pagehide`: a merely hidden page can still
  // finish the request.
  useEffect(() => {
    if (!isPdf) return;

    const flush = () => {
      if (restoredRef.current) void saveProgress(currentPageRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [isPdf, saveProgress]);

  useEffect(() => {
    setPageJump(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const firstMatch = pdfSearch.matches[0];
    if (firstMatch) goToPage(firstMatch.pageNumber);
  }, [goToPage, pdfSearch.matches]);

  const changePage = useCallback((offset: number) => {
    goToPage(currentPage + offset);
  }, [currentPage, goToPage]);

  const commitPageJump = () => {
    const requestedPage = Number.parseInt(pageJump, 10);
    if (Number.isFinite(requestedPage)) goToPage(requestedPage);
    else setPageJump(String(currentPage));
  };

  const submitPageJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitPageJump();
  };

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setIsOutlineOpen(false);
    setIsMinimapOpen(false);
    setIsShortcutsOpen(false);
    requestAnimationFrame(() => fullscreenTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableSelector = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
    requestAnimationFrame(() => fullscreenRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitFullscreen();
        return;
      }
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsShortcutsOpen(open => !open);
        return;
      }
      if (e.key === 'Tab' && fullscreenRef.current) {
        const focusable = Array.from(fullscreenRef.current.querySelectorAll<HTMLElement>(focusableSelector));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [exitFullscreen, isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && isPdf) {
        e.preventDefault();
        setIsSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }

      // Don't interfere with inputs or textareas, except Escape which closes search.
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key !== 'Escape') return;
      }

      if (e.key === 'ArrowRight') {
        if (isPdf) changePage(1);
      } else if (e.key === 'ArrowLeft') {
        if (isPdf) changePage(-1);
      } else if (e.key === '=' || e.key === '+') {
        if (canZoom) setScale(s => Math.min(s + 0.2, 2.5));
      } else if (e.key === '-') {
        if (canZoom) setScale(s => Math.max(s - 0.2, 0.6));
      } else if (e.key === 'Escape' && !isFullscreen) {
        if (pdfSearch.query) {
          pdfSearch.setQuery('');
          searchInputRef.current?.blur();
        } else {
          router.back();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changePage, router, isPdf, canZoom, isFullscreen, pdfSearch]);

  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    const match = direction === 'next' ? pdfSearch.next() : pdfSearch.prev();
    if (match) goToPage(match.pageNumber);
  }, [goToPage, pdfSearch]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out this document: ${documentMeta.title}\n\n`);
    window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
  };

  const handleOpenFile = (e: React.MouseEvent) => {
    // Opening the raw storage URL is public and must never be treated as a download.
    if (!canZoom) return;
    e.preventDefault();
    window.open(documentMeta.file_url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!(await ensureDownloadAuth())) return;
    if (isDownloading.current) return;

    const targetUrl = (e.currentTarget as HTMLAnchorElement).href || documentMeta.file_url;
    isDownloading.current = true;

    try {
      await trackDocumentStat(documentMeta.id, 'download');
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user?.id) {
        logStudySessionMutation.mutate({
          userId: sess.session.user.id,
          documentId: documentMeta.id,
          doc: {
            ...documentMeta,
            accessed_at: new Date().toISOString()
          }
        });
        await triggerStreakUpdate(sess.session.user.id);
      }
    } catch (error) {
      console.error("Tracking failed:", error);
    } finally {
      window.open(targetUrl, '_blank');
      setTimeout(() => { isDownloading.current = false; }, 2000);
    }
  };

  const handleToggleUpvote = async () => {
    if (!documentMeta) return;

    const isUpvoted = userRating === true;
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.user?.id) return showToast("Action Required", "Please log in to upvote.", "error");

      setUserRating(!isUpvoted); // optimistic
      setUpvotesCount((prev: number) => isUpvoted ? Math.max(0, prev - 1) : prev + 1);

      const result = await toggleUpvote(documentMeta.id);
      if (result === null) throw new Error("Failed to toggle upvote");

    } catch (error) {
      setUserRating(isUpvoted); // revert
      setUpvotesCount(isUpvoted ? upvotesCount + 1 : Math.max(0, upvotesCount - 1)); // revert
      const msg = error instanceof Error ? error.message : "Failed to upvote document.";
      showToast("Error", msg, "error");
    }
  };

  const handleSubmitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingQuality(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.user?.id) return showToast("Action Required", "Please log in to flag content.", "error");

      const { error } = await supabase.from('document_flags').insert({
        document_id: documentMeta.id,
        user_id: sess.session.user.id,
        reason: flagReason,
        description: flagDescription
      });

      if (error && error.code === '23505') {
        showToast("Notice", "You have already flagged this document.", "error");
      } else if (error) throw error;
      else {
        showToast("Report Submitted", "Thank you! Your report has been sent.", "success");
        setIsFlagModalOpen(false);
        setFlagDescription('');
      }
    } catch (error) {
      showToast("Submission Failed", "Something went wrong. Please try again.", "error");
    } finally {
      setIsSubmittingQuality(false);
    }
  };

  const pageEntries = Array.from({ length: numPages }, (_, index) => index + 1);

  return (
    <div
      ref={isFullscreen ? fullscreenRef : undefined}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen ? true : undefined}
      aria-label={isFullscreen ? `Reading ${documentMeta.title}` : undefined}
      className={isFullscreen
        ? "fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-black/80 p-0 backdrop-blur-sm"
        : "flex h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"}
    >
      <div className={isFullscreen ? "m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-surface shadow-2xl md:m-3" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>

        <Tooltip.Provider>
          <header className="relative flex min-h-12 shrink-0 items-center gap-2 bg-zinc-900 px-2.5 py-2 text-white shadow-md">
            <ToolTip label="Go back"><button aria-label="Go back" onClick={() => router.back()} className={TOOLBAR_BUTTON}><ArrowLeft size={17} /></button></ToolTip>
            <div className="min-w-0 flex-1 px-1">
              <h1 className="truncate text-center text-sm font-bold text-white">{documentMeta.title}</h1>
            </div>
            <div className="flex items-center gap-0.5">
              <ToolTip label={`Upvote${upvotesCount ? ` (${upvotesCount})` : ''}`}><button aria-label="Upvote document" onClick={handleToggleUpvote} className={`${TOOLBAR_BUTTON} ${userRating === true ? 'text-emerald-400' : ''}`}><ThumbsUp size={16} className={userRating === true ? 'fill-current' : ''} /></button></ToolTip>
              <ToolTip label="Report issue"><button aria-label="Report issue" onClick={() => setIsFlagModalOpen(true)} className={TOOLBAR_BUTTON}><Flag size={16} /></button></ToolTip>
              <DropdownMenu.Root>
                <ToolTip label="Share"><DropdownMenu.Trigger asChild><button aria-label="Share document" className={TOOLBAR_BUTTON}><Share2 size={16} /></button></DropdownMenu.Trigger></ToolTip>
                <DropdownMenu.Portal><DropdownMenu.Content className="z-50 min-w-36 overflow-hidden rounded-lg bg-zinc-900 p-1 shadow-xl ring-1 ring-white/10" align="end" sideOffset={6}>
                  <DropdownMenu.Item onClick={handleCopyLink} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-xs font-semibold text-zinc-200 outline-none hover:bg-white/10">{copied ? <Check size={14} className="text-emerald-400" /> : <LinkIcon size={14} />}{copied ? 'Copied' : 'Copy link'}</DropdownMenu.Item>
                  <DropdownMenu.Item onClick={handleWhatsAppShare} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-xs font-semibold text-emerald-400 outline-none hover:bg-white/10">WhatsApp</DropdownMenu.Item>
                </DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
              {canZoom ? <ToolTip label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}><button ref={fullscreenTriggerRef} aria-label={isFullscreen ? "Exit fullscreen reader" : "Open in fullscreen reader"} onClick={() => isFullscreen ? exitFullscreen() : setIsFullscreen(true)} className={`${TOOLBAR_BUTTON} text-indigo-300`}>{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button></ToolTip> : <ToolTip label="Open file"><a aria-label="Open file" href={documentMeta.file_url} target="_blank" rel="noopener noreferrer" onClick={handleOpenFile} className={`${TOOLBAR_BUTTON} text-indigo-300`}><Maximize size={16} /></a></ToolTip>}
            </div>
          </header>

          {canZoom && <div className="flex shrink-0 items-center justify-center gap-1 bg-zinc-950 px-2 py-1.5 text-zinc-200 shadow-inner">
            <ToolTip label="Zoom out"><button aria-label="Zoom Out" onClick={() => setScale(s => Math.max(s - 0.2, 0.6))} className={TOOLBAR_BUTTON}><ZoomOut size={17} /></button></ToolTip>
            <ToolTip label="Zoom presets"><DropdownMenu.Root><DropdownMenu.Trigger asChild><button aria-label="Zoom preset" className="motion-hover flex h-8 min-w-16 items-center justify-center gap-1 rounded-md px-2 text-xs font-bold tabular-nums text-zinc-200 hover:bg-white/10"><span>{Math.round(scale * 100)}%</span><ChevronDown size={13} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="z-50 min-w-28 rounded-lg bg-zinc-900 p-1 shadow-xl ring-1 ring-white/10" align="center" sideOffset={5}>{[0.75, 1, 1.25, 1.5, 2].map(preset => <DropdownMenu.Item key={preset} onClick={() => setScale(preset)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold text-zinc-200 outline-none hover:bg-white/10">{Math.round(preset * 100)}%</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></ToolTip>
            <ToolTip label="Zoom in"><button aria-label="Zoom In" onClick={() => setScale(s => Math.min(s + 0.2, 2.5))} className={TOOLBAR_BUTTON}><ZoomIn size={17} /></button></ToolTip>
            {isPdf && <><div className="mx-1 h-5 w-px bg-white/10" /><ToolTip label={isSearchOpen ? "Close search" : "Search document"}><button aria-label={isSearchOpen ? "Close document search" : "Open document search"} onClick={() => setIsSearchOpen(open => !open)} className={`${TOOLBAR_BUTTON} ${isSearchOpen ? 'bg-white/10 text-white' : ''}`}><Search size={16} /></button></ToolTip>{isSearchOpen && <div className="flex items-center gap-1"><input ref={searchInputRef} autoFocus aria-label="Search document text" value={pdfSearch.query} onChange={(event) => pdfSearch.setQuery(event.target.value)} placeholder="Search" className="motion-focus h-8 w-28 rounded-md border-0 bg-white/10 px-2 text-xs text-white outline-none placeholder:text-zinc-500 sm:w-40" /><span aria-live="polite" className="w-10 text-center text-[10px] tabular-nums text-zinc-400">{pdfSearch.isSearching ? '…' : pdfSearch.query ? `${pdfSearch.matches.length ? pdfSearch.activeIndex + 1 : 0}/${pdfSearch.matches.length}` : ''}</span>{pdfSearch.query && <button aria-label="Clear document search" onClick={() => pdfSearch.setQuery('')} className={TOOLBAR_BUTTON}><X size={14} /></button>}<button aria-label="Previous search result" disabled={!pdfSearch.matches.length} onClick={() => navigateSearch('prev')} className={TOOLBAR_BUTTON}><ChevronLeft size={15} /></button><button aria-label="Next search result" disabled={!pdfSearch.matches.length} onClick={() => navigateSearch('next')} className={TOOLBAR_BUTTON}><ChevronRight size={15} /></button></div>}</>}
            {isPdf && <><div className="mx-1 h-5 w-px bg-white/10" /><ToolTip label="Previous page"><button aria-label="Previous Page" onClick={() => changePage(-1)} disabled={currentPage <= 1} className={TOOLBAR_BUTTON}><ChevronLeft size={17} /></button></ToolTip><form onSubmit={submitPageJump} className="flex items-center"><input aria-label="Jump to page" value={pageJump} onChange={event => setPageJump(event.target.value.replace(/[^0-9]/g, ''))} onBlur={commitPageJump} className="h-8 w-10 rounded-md border-0 bg-white/10 text-center text-xs font-bold tabular-nums text-white outline-none focus:bg-white/20" /><span className="px-1 text-xs text-zinc-500">/ {numPages || '—'}</span></form><ToolTip label="Next page"><button aria-label="Next Page" onClick={() => changePage(1)} disabled={currentPage >= numPages} className={TOOLBAR_BUTTON}><ChevronRight size={17} /></button></ToolTip></>}
          </div>}

          {isPdf && <div className="h-0.5 shrink-0 bg-zinc-800" aria-label="Reading progress"><div className="h-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${numPages ? (currentPage / numPages) * 100 : 0}%` }} /></div>}
        </Tooltip.Provider>

        {isFullscreen && (
          <>
            <nav aria-label="Document breadcrumb" className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-2 text-xs font-semibold text-muted">
              <BookOpen size={14} aria-hidden="true" />
              <span>Documents</span><span aria-hidden="true">/</span><span className="truncate text-foreground">{documentMeta.title}</span>
            </nav>
            <div className="flex shrink-0 items-center justify-end gap-1 bg-zinc-900 px-3 py-1">
              <button aria-pressed={isMinimapOpen} aria-label="Toggle minimap" onClick={() => setIsMinimapOpen(open => !open)} className="motion-hover rounded-md p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><Map size={16} /></button>
              <button aria-pressed={isOutlineOpen} aria-label="Toggle document outline" onClick={() => { setIsOutlineOpen(open => !open); setIsAnnotationsOpen(false); }} className="motion-hover rounded-md p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><List size={16} /></button>
              <button aria-label="Split view (coming soon)" disabled className="motion-hover rounded-lg p-2 text-muted opacity-50"><Columns3 size={16} /></button>
              <button aria-pressed={isShortcutsOpen} aria-label="Show keyboard shortcuts" onClick={() => setIsShortcutsOpen(open => !open)} className="motion-hover rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><Keyboard size={16} /></button>
              <button aria-label="Exit fullscreen reader" onClick={exitFullscreen} className="motion-hover rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><Minimize size={16} /></button>
            </div>
          </>
        )}

        {resumedAt !== null && (
          <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-border bg-primary/5 px-4 py-2">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              Picked up where you left off — page {resumedAt}
            </span>
            <button
              onClick={() => { setResumedAt(null); goToPage(1); }}
              className="motion-hover motion-active rounded-lg px-2 py-1 text-sm font-bold text-primary hover:bg-primary/10"
            >
              Back to page 1
            </button>
            <button
              aria-label="Dismiss resume notice"
              onClick={() => setResumedAt(null)}
              className="motion-hover rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {(isAnnotationsOpen || (isFullscreen && isOutlineOpen)) && (
            <aside aria-label={isAnnotationsOpen ? "Annotations sidebar" : "Document outline"} className="custom-scrollbar hidden w-60 shrink-0 overflow-auto bg-surface p-4 md:block">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-foreground">{isAnnotationsOpen ? <PanelRight size={15} /> : <List size={15} />} {isAnnotationsOpen ? "Annotations" : "Outline"}</div>
              <p className="text-xs leading-relaxed text-muted">{isAnnotationsOpen ? "PDF annotations and page links" : "Page navigation"}</p>
              <div className="mt-3 space-y-1">
                {pageEntries.map(page => <button key={page} onClick={() => goToPage(page)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-muted hover:bg-surface-hover hover:text-foreground">{isAnnotationsOpen ? `Page ${page} annotations` : `Page ${page}`}</button>)}
              </div>
            </aside>
          )}
          <div ref={containerRef} className="custom-scrollbar flex min-w-0 flex-1 justify-center overflow-auto bg-surface-hover p-4">
            {isPdf && (
              <Document file={documentMeta.file_url} onLoadSuccess={onDocumentLoadSuccess} loading={<Loader2 className="mt-10 animate-spin text-primary" size={32} />} error={<p className="mt-10 text-xs text-destructive">Failed to load PDF. The file could not be fetched from storage.</p>}>
                {containerWidth > 0 && numPages > 0 && (
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: `${containerWidth * 0.95}px`,
                      position: 'relative',
                    }}
                  >
                    {virtualItems.map((virtualRow) => (
                      <div
                        key={virtualRow.index}
                        /* measureElement reads data-index and reports the row's real
                           height back, so scrollToIndex works on PDFs whose pages
                           aren't A4 and at zoom levels the estimate can't predict.
                           No fixed height here on purpose — that's what gets measured. */
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <div className="mb-4 shadow-lg ring-1 ring-foreground/5 h-fit">
                          <Page
                            pageNumber={virtualRow.index + 1}
                            scale={scale}
                            width={containerWidth * 0.95}
                            renderTextLayer={true}
                            customTextRenderer={({ pageNumber, itemIndex, str }) => pdfSearch.getTextRenderer(pageNumber, itemIndex, str)}
                            renderAnnotationLayer={true}
                            loading={<SkeletonBlock className="h-[500px] w-full rounded-none" />}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Document>
            )}

            {fileKind === "image" && containerWidth > 0 && (
              <div
                className="relative mb-4 bg-white shadow-lg ring-1 ring-foreground/5"
                style={{
                  width: `${containerWidth * 0.95 * scale}px`,
                  height: `${(containerWidth * 0.95 * scale) / imageRatio}px`,
                }}
              >
                {/* `fill` is the documented pattern for images of unknown dimensions;
                `unoptimized` keeps the original bytes so zooming stays legible
                and the server never re-encodes a scanned page on demand. */}
                <NextImage
                  src={documentMeta.file_url}
                  alt={documentMeta.title || "Uploaded image"}
                  fill
                  unoptimized
                  sizes="95vw"
                  style={{ objectFit: "contain" }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      setImageRatio(img.naturalWidth / img.naturalHeight);
                    }
                  }}
                />
              </div>
            )}

            {fileKind === "text" && (
              <div className="w-full max-w-3xl">
                {textError ? (
                  <p className="mt-10 text-center text-xs text-destructive">
                    Failed to load this file. It could not be fetched from storage.
                  </p>
                ) : textContent === null ? (
                  <div className="flex justify-center"><Loader2 className="mt-10 animate-spin text-primary" size={32} /></div>
                ) : (
                  <pre className="custom-scrollbar overflow-x-auto rounded-2xl border border-border bg-surface p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-lg">
                    {textContent}
                  </pre>
                )}
              </div>
            )}

            {(fileKind === "office" || fileKind === "unknown") && (
              <div className="flex w-full max-w-md flex-col items-center justify-center gap-4 self-center rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
                {(() => {
                  const Icon = UNSUPPORTED_ICONS[getExtension(documentMeta.file_url)] ?? FileIcon;
                  return <Icon size={48} className="text-primary" aria-hidden="true" />;
                })()}
                <div>
                  <p className="text-base font-extrabold text-foreground">Preview isn&apos;t available for this file type</p>
                  <p className="mt-1 text-sm text-muted">
                    {fileLabel} files open in the app you use for them. Download a copy or open it in a new tab.
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={buildDownloadHref(documentMeta.file_url, documentMeta.title)}
                    onClick={handleDownloadClick}
                    className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
                  >
                    <Download size={16} aria-hidden="true" /> Download
                  </a>
                  <a
                    href={documentMeta.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-surface-hover px-4 py-2.5 text-sm font-bold text-foreground"
                  >
                    <Maximize size={16} aria-hidden="true" /> Open in new tab
                  </a>
                </div>
              </div>
            )}
          </div>
          {isFullscreen && isMinimapOpen && isPdf && (
            <aside aria-label="Document minimap" className="custom-scrollbar hidden w-24 shrink-0 overflow-auto bg-surface p-2 lg:block">
              <div className="mb-2 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-muted"><Map size={12} /> Map</div>
              <div className="space-y-1">
                {pageEntries.map(page => <button key={page} aria-label={`Go to page ${page}`} onClick={() => goToPage(page)} className="flex h-8 w-full items-center justify-center rounded border border-border bg-surface-hover text-[10px] font-bold text-muted hover:border-primary hover:text-primary">{page}</button>)}
              </div>
            </aside>
          )}
        </div>

        {isFullscreen && isShortcutsOpen && (
          <div role="status" className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
            <section aria-label="Keyboard shortcuts" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-extrabold text-foreground"><Keyboard size={17} /> Keyboard shortcuts</h2><button aria-label="Close keyboard shortcuts" onClick={() => setIsShortcutsOpen(false)} className="rounded-lg p-1 text-muted hover:bg-surface-hover"><X size={17} /></button></div>
              <dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted">Show shortcuts</dt><dd className="font-bold text-foreground">?</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Exit fullscreen</dt><dd className="font-bold text-foreground">Esc</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Next / previous page</dt><dd className="font-bold text-foreground">← / →</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Zoom</dt><dd className="font-bold text-foreground">+ / −</dd></div></dl>
            </section>
          </div>
        )}
      </div>

      <Dialog.Root open={isFlagModalOpen} onOpenChange={setIsFlagModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-modal fixed top-[50%] left-[50%] z-[100] w-[calc(100%-2rem)] max-w-2xl translate-[-50%] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <Dialog.Title className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                <Flag size={16} className="text-destructive" aria-hidden="true" /> Report Issue
              </Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label="Close" className="motion-hover text-muted hover:text-foreground">
                  <X size={18} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Report an issue with this document such as incorrect content, duplication, or low quality.</Dialog.Description>
            <form onSubmit={handleSubmitFlag} className="space-y-4 p-4">
              <div>
                <label htmlFor="flag-reason" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Issue Type</label>
                <select id="flag-reason" value={flagReason} onChange={(e) => setFlagReason(e.target.value as 'incorrect' | 'duplicate' | 'low_quality' | 'other')} className="motion-focus w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-primary">
                  <option value="incorrect" className="bg-surface">Incorrect/Outdated Content</option>
                  <option value="duplicate" className="bg-surface">Duplicate Document</option>
                  <option value="low_quality" className="bg-surface">Poor Quality / Unreadable</option>
                  <option value="other" className="bg-surface">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="flag-description" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Additional Details (Optional)</label>
                <textarea id="flag-description" value={flagDescription} onChange={(e) => setFlagDescription(e.target.value)} className="motion-focus min-h-[80px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-primary" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <button type="button" className="motion-hover motion-active rounded-xl bg-surface-hover px-4 py-2 text-xs font-bold text-foreground">Cancel</button>
                </Dialog.Close>
                <button type="submit" disabled={isSubmittingQuality} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
                  {isSubmittingQuality ? <InlineSpinner label="Submitting report" size={14} /> : null} Submit Report
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
