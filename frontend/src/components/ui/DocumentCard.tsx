"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, Bookmark, Trash2, FileText, NotebookPen, FileQuestion, ListChecks, ThumbsUp, BookOpen, type LucideIcon } from "lucide-react";
import { SUBJECT_UI_MAP, normalizeTitle } from "@/app/lib/subject-config";
import type { DocumentWithAnalytics } from "@/app/lib/document-types";
import { subjectSlug as generateSlug, documentPath } from "@/components/layout/utils";
import { DiscoveryTooltip } from "@/components/ui/DiscoveryTooltip";
import { getFileLabel } from "@/app/lib/file-types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  notes: NotebookPen,
  pyq: FileQuestion,
  tutorial_sheet: BookOpen,
  syllabus: ListChecks
};

const CATEGORY_LABELS: Record<string, string> = {
  notes: "Notes",
  pyq: "PYQ",
  tutorial_sheet: "Tutorial Sheet",
  syllabus: "Syllabus"
};

const getCategoryLabel = (category: string) =>
  CATEGORY_LABELS[category] || category.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return "recently";
  const days = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

export interface DocumentCardProps {
  doc: DocumentWithAnalytics;
  subjectSlug?: string;
  isBookmarked?: boolean;
  isUpvoted?: boolean;
  currentUpvoteCount?: number;
  isAdmin?: boolean;
  isSuggestion?: boolean;
  badgeText?: string;
  onDownload?: (e: React.MouseEvent, doc: DocumentWithAnalytics) => void;
  onToggleBookmark?: (id: number) => void;
  onToggleUpvote?: (id: number) => void;
  onDelete?: (id: number) => void;
  isDownloading?: boolean;
  showBookmarkTooltip?: boolean;
  showReadingProgress?: boolean;
}

export default function DocumentCard({
  doc,
  subjectSlug,
  isBookmarked = false,
  isUpvoted = false,
  currentUpvoteCount,
  isAdmin = false,
  isSuggestion = false,
  badgeText,
  onToggleBookmark,
  onToggleUpvote,
  onDelete,
  showBookmarkTooltip = false,
  showReadingProgress = false
}: DocumentCardProps) {

  const slug = subjectSlug || (doc.subject ? generateSlug(doc.subject) : "default");
  const ui = SUBJECT_UI_MAP[slug] || SUBJECT_UI_MAP["default"];
  const accentBorderColor = ui.border ? ui.border.replace('border-', 'border-l-') : 'border-l-muted';
  const gradientWashClass = {
    "border-primary": "bg-linear-to-br from-primary/5 via-surface to-primary/5",
    "border-success": "bg-linear-to-br from-success/5 via-surface to-success/5",
    "border-warning": "bg-linear-to-br from-warning/5 via-surface to-warning/5",
    "border-destructive": "bg-linear-to-br from-destructive/5 via-surface to-destructive/5",
    "border-sky-500": "bg-linear-to-br from-sky-500/5 via-surface to-sky-500/5",
  }[ui.border as string] || "bg-linear-to-br from-primary/5 via-surface to-primary/5";
  const analyticsObj = Array.isArray(doc.document_analytics) ? doc.document_analytics[0] : doc.document_analytics;
  const viewCount = analyticsObj?.view_count ?? doc.view_count ?? 0;
  const upvoteCount = currentUpvoteCount !== undefined ? currentUpvoteCount : (analyticsObj?.upvotes || 0);

  const Icon = CATEGORY_ICONS[doc.category] || FileText;
  const targetSubjectSlug = subjectSlug || (doc.subject ? generateSlug(doc.subject) : "default");
  // Module-less documents (syllabus, non-module subjects) sit directly under the
  // subject; the rest keep their /module-<n>/ segment.
  const docHref = documentPath(targetSubjectSlug, doc);

  const bookmarkButton = onToggleBookmark ? (
    <button
      onClick={(e) => { e.preventDefault(); onToggleBookmark(doc.id); }}
      className={`motion-hover motion-active absolute top-2 right-2 rounded-lg border p-1.5 shadow-sm backdrop-blur-md ${isBookmarked
        ? "border-warning bg-warning text-white"
        : "border-border/60 bg-background/70 text-warning hover:bg-warning/10"
        }`}
      aria-label={isBookmarked ? "Remove bookmark" : "Bookmark resource"}
    >
      <Bookmark size={13} className={isBookmarked ? "fill-white text-white" : "text-warning"} />
    </button>
  ) : null;

  return (
    <article className={`group flex flex-col rounded-2xl border border-l-[3px] ${accentBorderColor} ${gradientWashClass} p-4 shadow-sm transition duration-150 hover:-translate-y-1 hover:shadow-md sm:p-5 ${isSuggestion
      ? "border-amber-500/20 hover:border-amber-500/40 hover:border-y-amber-500/40 dark:hover:border-indigo-500"
      : isBookmarked
        ? "border-warning/20 hover:border-warning/40 hover:border-y-warning/40"
        : "border-border hover:border-y-border hover:border-r-border"
      }`}>

      {isSuggestion && badgeText && (
        <span className="mb-3 self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
          {badgeText}
        </span>
      )}

      {/* Thumbnail with category badge (top-left) and bookmark button (top-right) */}
      <div className="relative mb-3 flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-background sm:mb-4 sm:h-32">
        {doc.thumbnail_url ? (
          <Image src={doc.thumbnail_url} alt={`${doc.title} thumbnail`} fill sizes="(max-width: 768px) 100vw, 33vw" className="motion-hover size-full object-cover object-top opacity-90 group-hover:opacity-100" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted">
            <Icon size={32} className="opacity-50" />
          </div>
        )}
        {/* Category Badge: top-left */}
        <span className="absolute top-2 left-2 rounded-md bg-foreground/80 px-2 py-1 text-xs font-extrabold text-background shadow-sm backdrop-blur-md">
          {getCategoryLabel(doc.category)}
        </span>
        {/* Bookmark Button: top-right */}
        {showBookmarkTooltip && bookmarkButton ? (
          <DiscoveryTooltip featureKey="bookmark_button" text="Save this document for later" side="left" align="center">
            {bookmarkButton}
          </DiscoveryTooltip>
        ) : (
          bookmarkButton
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-start gap-3">
          {/* Card Title */}
          <h3 className="line-clamp-2 min-h-[2.25rem] min-w-0 flex-1 text-xl leading-tight font-medium tracking-tight text-foreground sm:min-h-[2.5rem]">
            {normalizeTitle(doc.title)}
          </h3>
          {/* File type chip: top-right of the card details, clear of the bookmark overlay. */}
          <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[10px] font-bold tracking-wide text-muted shadow-sm backdrop-blur-md">
            {getFileLabel(doc.file_url)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          {doc.uploaded_by && doc.uploader_name ? (
            <Link
              href={`/contributor/${doc.uploaded_by}`}
              className="truncate text-xs font-bold tracking-wider text-primary uppercase hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {doc.uploader_name}
            </Link>
          ) : (
            <span className="truncate text-xs font-bold tracking-wider text-primary uppercase">
              {doc.uploader_name || 'Anonymous'}
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted tabular-nums">
          <span>{doc.page_count ? `${doc.page_count} pgs` : getFileLabel(doc.file_url)}</span>
          <span>·</span>
          <span>{doc.file_size ? `${doc.file_size.toFixed(1)} MB` : 'N/A'}</span>
          <span>·</span>
          <span>{getTimeAgo(doc.created_at ?? null)}</span>
        </div>
        {/* Page 1 is not a position worth resuming to, and a document read to
            its last page has nothing left to resume. Compared numerically so a
            missing page_count cannot leak a bare 0 into the markup. */}
        {showReadingProgress && (doc.last_page ?? 0) > 1 && (doc.last_page ?? 0) < (doc.page_count ?? 0) && (
          <p className="mt-2 text-xs font-bold text-primary tabular-nums">Resume at page {doc.last_page}</p>
        )}
      </div>

      {/* Bottom action row: view and upvote counts. Downloads are available in fullscreen mode only. */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 sm:mt-4 sm:pt-4">
        <Link
          href={docHref}
          aria-label={`View ${doc.title}, ${viewCount} view${viewCount !== 1 ? "s" : ""}`}
          className="motion-hover motion-active inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-primary py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Eye size={13} aria-hidden="true" /> {viewCount}
        </Link>

        {onToggleUpvote ? (
          <button
            onClick={() => onToggleUpvote(doc.id)}
            aria-label={`${isUpvoted ? "Remove upvote from" : "Upvote"} ${doc.title}, ${upvoteCount} upvote${upvoteCount !== 1 ? "s" : ""}`}
            aria-pressed={isUpvoted}
            className={`motion-hover motion-active flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold ${isUpvoted ? "border-success bg-success/10 text-success hover:bg-success/20" : "border-border text-muted hover:border-success/50 hover:text-success"}`}
          >
            <ThumbsUp size={14} aria-hidden="true" className={isUpvoted ? "fill-success" : ""} />
            {upvoteCount}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-muted tabular-nums" aria-label={`${upvoteCount} upvote${upvoteCount !== 1 ? "s" : ""}`}>
            <ThumbsUp size={14} aria-hidden="true" />
            {upvoteCount}
          </span>
        )}

        {isAdmin && onDelete && (
          <button
            aria-label={`Delete ${doc.title}`}
            onClick={() => onDelete(doc.id)}
            className="motion-hover motion-active rounded-xl border border-destructive/30 p-2 text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
