"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  ArrowLeft, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Share2, Link as LinkIcon, Check, Maximize,
  ThumbsUp, ThumbsDown, Flag, X,
  Download, File as FileIcon, FileText, FileSpreadsheet, Presentation
} from "lucide-react";
import { usePathname, useRouter } from 'next/navigation';
import NextImage from "next/image";
import { supabase } from "@/app/lib/api/core";
import { trackDocumentStat, toggleUpvote, getUserUpvotes } from "@/app/lib/api/analytics";
import { triggerStreakUpdate } from "@/app/lib/api/profile";
import { useLogStudySessionMutation } from "@/app/hooks/useStudyHistory";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Document, Page, pdfjs } from 'react-pdf';
import { useVirtualizer } from '@tanstack/react-virtual';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { InlineSpinner, SkeletonBlock } from "@/components/layout/SharedLayouts";
import { dispatchToast as showToast } from "@/app/lib/toast";
import { buildDownloadHref, getExtension, getFileKind, getFileLabel } from "@/app/lib/file-types";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Icon shown on the download-only card for file types with no in-app preview.
const UNSUPPORTED_ICONS: Record<string, typeof FileIcon> = {
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
};

export default function PDFViewerClient({ documentMeta }: { documentMeta: any }) {
  const router = useRouter();
  const logStudySessionMutation = useLogStudySessionMutation();

  // How this document renders is derived from the extension on its stored URL —
  // there is no file-type column, so this also covers every pre-existing row.
  const fileKind = getFileKind(documentMeta?.file_url);
  const fileLabel = getFileLabel(documentMeta?.file_url);
  const isPdf = fileKind === "pdf";

  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
    return () => window.removeEventListener("resize", updateWidth);
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

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

  const changePage = useCallback((offset: number) => {
    goToPage(currentPage + offset);
  }, [currentPage, goToPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with inputs or textareas
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        if (isPdf) changePage(1);
      } else if (e.key === 'ArrowLeft') {
        if (isPdf) changePage(-1);
      } else if (e.key === '=' || e.key === '+') {
        if (canZoom) setScale(s => Math.min(s + 0.2, 2.5));
      } else if (e.key === '-') {
        if (canZoom) setScale(s => Math.max(s - 0.2, 0.6));
      } else if (e.key === 'Escape') {
        router.back();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changePage, router, isPdf, canZoom]);

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

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading.current) return;

    // Read the href now: React nulls `currentTarget` once the handler returns,
    // and everything below this line is async. Lets one handler serve both the
    // "FullScreen" link (raw file) and the "Download" button (?download= href).
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

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      
      {/* 1. Header: w-full ensures it takes full width for flex distributions */}
      <div className="flex min-h-[3.5rem] w-full shrink-0 flex-col justify-between gap-3 border-b border-border bg-surface-hover p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-2">
        
        <button onClick={() => router.back()} className="motion-hover motion-active flex shrink-0 items-center gap-1.5 self-start rounded-xl px-2 py-1.5 text-sm font-bold text-muted hover:bg-surface-hover sm:gap-2 sm:self-auto sm:px-3">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Go Back</span><span className="sm:hidden">Back</span>
        </button>
        
       {/* 2. Text Container: items-center and text-center applied universally */}
        <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center px-1 sm:px-4">
          <h1 className="w-full text-center text-base leading-tight font-extrabold break-words whitespace-normal text-foreground sm:text-sm">
            {documentMeta.title}
          </h1>
          <p className="mt-1 w-full text-center text-sm leading-tight font-semibold break-words whitespace-normal text-primary">
            Uploaded by {documentMeta.uploader_name || 'Anonymous'}
          </p>
        </div>
        
        {/* 3. Action Icons: Labels added for Report and Share to fill space evenly */}
        <div className="mt-2 flex w-full shrink-0 items-center justify-between gap-1 text-muted sm:mt-0 sm:w-auto sm:justify-end sm:gap-2">
          
          <div className="flex shrink-0 items-center gap-1 border-r border-border pr-2 sm:mr-2 sm:pr-3">
            <button onClick={handleToggleUpvote} className={`motion-hover motion-active flex items-center gap-1.5 rounded-lg p-1.5 font-bold ${userRating === true ? 'bg-success/10 text-success' : 'text-muted hover:bg-success/10 hover:text-success'}`}>
              <ThumbsUp size={16} className={userRating === true ? 'fill-current' : ''} />
              <span className="text-sm">{upvotesCount}</span>
            </button>
          </div>

          <button onClick={() => setIsFlagModalOpen(true)} className="motion-hover motion-active flex shrink-0 items-center gap-1.5 rounded-lg p-1.5 text-muted hover:bg-destructive/10 hover:text-destructive sm:mr-1">
            <Flag size={16} /> <span className="text-sm font-bold">Report</span>
          </button> 

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="motion-hover motion-active flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-foreground hover:bg-surface-hover sm:px-3">
                <Share2 size={14} /> <span className="text-sm font-bold">Share</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="animate-in fade-in zoom-in-95 motion-dropdown z-50 min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg" align="end" sideOffset={5}>
                <DropdownMenu.Item onClick={handleCopyLink} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-foreground outline-none hover:bg-surface-hover">
                  {copied ? <Check size={14} className="text-success" /> : <LinkIcon size={14} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </DropdownMenu.Item>
                <DropdownMenu.Item onClick={handleWhatsAppShare} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-success outline-none hover:bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1  8 8v.5z"/></svg>
                  WhatsApp
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <a href={documentMeta.file_url} target="_blank" rel="noopener noreferrer" onClick={handleDownloadClick} className="motion-hover motion-active flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-primary hover:bg-primary/10 sm:px-3">
             <span className="hidden sm:inline">{canZoom ? "FullScreen" : "Open"}</span> <Maximize size={14} />
          </a>
        </div>
      </div>

      {canZoom && (
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="flex items-center gap-1">
            <button aria-label="Zoom Out" onClick={() => setScale(s => Math.max(s - 0.2, 0.6))} className="motion-hover motion-active rounded-lg p-1.5 text-muted hover:bg-surface-hover"><ZoomOut size={18} aria-hidden="true" /></button>
            <span className="w-10 text-center text-sm font-bold text-foreground tabular-nums" aria-hidden="true">{Math.round(scale * 100)}%</span>
            <button aria-label="Zoom In" onClick={() => setScale(s => Math.min(s + 0.2, 2.5))} className="motion-hover motion-active rounded-lg p-1.5 text-muted hover:bg-surface-hover"><ZoomIn size={18} aria-hidden="true" /></button>
          </div>

          {isPdf ? (
            <>
              <div className="flex items-center gap-2">
                <button aria-label="Previous Page" onClick={() => changePage(-1)} disabled={currentPage <= 1} className="motion-hover motion-active flex items-center justify-center rounded-lg bg-surface-hover p-1.5 text-foreground disabled:opacity-50"><ChevronLeft size={18} aria-hidden="true" /></button>
                <span className="text-sm font-bold text-muted tabular-nums" aria-hidden="true">Page {currentPage} of {numPages || '--'}</span>
                <button aria-label="Next Page" onClick={() => changePage(1)} disabled={currentPage >= numPages} className="motion-hover motion-active flex items-center justify-center rounded-lg bg-surface-hover p-1.5 text-foreground disabled:opacity-50"><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
              {/* ARIA Live region for screen readers to announce page changes */}
              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {numPages > 0 ? `Page ${currentPage} of ${numPages}` : 'Loading PDF'}
              </div>
            </>
          ) : (
            <span className="text-sm font-bold tracking-wider text-muted uppercase">{fileLabel}</span>
          )}
        </div>
      )}

      <div ref={containerRef} className="custom-scrollbar flex flex-1 justify-center overflow-auto bg-surface-hover p-4">
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

      <Dialog.Root open={isFlagModalOpen} onOpenChange={setIsFlagModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-modal fixed top-[50%] left-[50%] z-[100] w-full max-w-md translate-[-50%] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
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
