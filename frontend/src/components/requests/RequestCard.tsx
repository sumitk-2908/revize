"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  ListChecks,
  NotebookPen,
  BookOpen,
  ThumbsUp,
  Trash2,
  Undo2,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { documentHref } from "@/components/layout/utils";
import type { ResourceRequest } from "@/app/lib/api/requests";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  notes: NotebookPen,
  pyq: FileQuestion,
  tutorial_sheet: BookOpen,
  syllabus: ListChecks,
};

const CATEGORY_LABELS: Record<string, string> = {
  notes: "Notes",
  pyq: "PYQ",
  tutorial_sheet: "Tutorial",
  syllabus: "Syllabus",
};

const getTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return "recently";
  const days = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export interface RequestCardProps {
  request: ResourceRequest;
  isUpvoted: boolean;
  /** Own requests get close/reopen/delete; upvoting your own is still allowed. */
  isOwner: boolean;
  isAdmin?: boolean;
  onToggleUpvote: (request: ResourceRequest) => void;
  onFulfil: (request: ResourceRequest) => void;
  onSetStatus?: (request: ResourceRequest, status: "open" | "closed") => void;
  onDelete?: (request: ResourceRequest) => void;
}

export default function RequestCard({
  request,
  isUpvoted,
  isOwner,
  isAdmin = false,
  onToggleUpvote,
  onFulfil,
  onSetStatus,
  onDelete,
}: RequestCardProps) {
  const Icon = CATEGORY_ICONS[request.category] || ClipboardList;
  const isFulfilled = request.status === "fulfilled";
  const isClosed = request.status === "closed";

  const accent = isFulfilled
    ? "border-success/30 bg-success/5"
    : isClosed
      ? "border-border bg-surface-hover/40"
      : "border-border bg-surface";

  return (
    <article className={`motion-hover flex flex-col gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-start ${accent}`}>
      <button
        type="button"
        onClick={() => onToggleUpvote(request)}
        aria-label={isUpvoted ? `Remove your upvote from ${request.title}` : `Upvote ${request.title}`}
        aria-pressed={isUpvoted}
        className={`motion-hover motion-active flex shrink-0 flex-row items-center justify-center gap-1.5 self-start rounded-xl border px-3 py-2 text-sm font-bold tabular-nums sm:w-16 sm:flex-col sm:gap-0.5 sm:py-2.5 ${
          isUpvoted
            ? "border-success bg-success/10 text-success hover:bg-success/20"
            : "border-border text-muted hover:border-success/50 hover:text-success"
        }`}
      >
        <ThumbsUp size={14} className={isUpvoted ? "fill-success" : ""} aria-hidden="true" />
        {request.upvote_count}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground/80 px-2 py-1 text-xs font-extrabold tracking-wider text-background uppercase">
            <Icon size={11} aria-hidden="true" />
            {CATEGORY_LABELS[request.category] || request.category}
          </span>
          {isFulfilled && (
            <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-xs font-extrabold tracking-wider text-success uppercase">
              <CheckCircle2 size={11} aria-hidden="true" /> Fulfilled
            </span>
          )}
          {isClosed && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-xs font-extrabold tracking-wider text-muted uppercase">
              <XCircle size={11} aria-hidden="true" /> Closed
            </span>
          )}
        </div>

        <h3 className="mt-2 text-lg leading-tight font-bold tracking-tight text-foreground">
          {request.title}
        </h3>

        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted">
          <span className="font-bold text-primary uppercase">{request.subject}</span>
          {request.module_id != null && (
            <>
              <span aria-hidden="true">·</span>
              <span>Module {request.module_id}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{request.requester_name || "A student"}</span>
          <span aria-hidden="true">·</span>
          <span>{getTimeAgo(request.created_at)}</span>
        </p>

        {request.details && (
          <p className="mt-2 text-sm leading-6 font-medium whitespace-pre-line text-muted">{request.details}</p>
        )}

        {isFulfilled && request.fulfilled_document && (
          <Link
            href={documentHref(request.fulfilled_document)}
            className="motion-hover motion-active mt-3 inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm font-bold text-success hover:bg-success/20"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            <span className="truncate">{request.fulfilled_document.title}</span>
          </Link>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {!isFulfilled && (
            <button
              type="button"
              onClick={() => onFulfil(request)}
              className="motion-hover motion-active inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              <Upload size={13} aria-hidden="true" /> Upload for this
            </button>
          )}

          {isOwner && onSetStatus && !isFulfilled && (
            <button
              type="button"
              onClick={() => onSetStatus(request, isClosed ? "open" : "closed")}
              className="motion-hover motion-active inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-hover px-3 py-2 text-sm font-bold text-foreground hover:opacity-80"
            >
              {isClosed ? (
                <>
                  <Undo2 size={13} aria-hidden="true" /> Reopen
                </>
              ) : (
                <>
                  <XCircle size={13} aria-hidden="true" /> Close
                </>
              )}
            </button>
          )}

          {(isOwner || isAdmin) && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(request)}
              aria-label={`Delete request ${request.title}`}
              className="motion-hover motion-active rounded-xl border border-destructive/30 p-2 text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
