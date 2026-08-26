"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Flag, MessageSquare, MoreHorizontal, Pin, ThumbsUp, Trash2, Edit2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAuth } from "@/app/context/AuthContext";
import { CommentInput } from "./CommentInput";
import { MarkdownPreview } from "./MarkdownPreview";
import { updateComment, deleteComment, adminDeleteComment, flagComment, adminPinComment, postComment } from "@/app/lib/api/comments";
import { dispatchToast as showToast } from "@/app/lib/toast";

interface CommentData {
  id: string;
  document_id: number;
  user_id: string;
  content: string;
  parent_id: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  deleted_by_admin: boolean;
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string | null; avatar_url?: string | null } | null;
  children?: CommentData[];
}

interface CommentItemProps {
  comment: CommentData;
  documentId: number;
  depth?: number;
  onRefresh: () => void;
  onReplyPrompt?: () => void;
}

const reactions = ["👍", "❤️", "😂", "🎉", "🤔"];

export const CommentItem = ({ comment, documentId, depth = 0, onRefresh, onReplyPrompt }: CommentItemProps) => {
  const { isAdmin } = useAuth();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(null);
  const [localVotes, setLocalVotes] = useState(0);
  const children = comment.children || [];
  const isLong = comment.content.length > 280;
  const displayContent = !isExpanded && isLong ? `${comment.content.slice(0, 280)}…` : comment.content;
  const name = comment.profiles?.full_name || "Unknown Student";
  const initials = name.charAt(0).toUpperCase();

  const handleReplySubmit = async (content: string) => {
    await postComment(documentId, content, comment.id);
    setIsReplying(false);
    onRefresh();
  };
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    await deleteComment(comment.id);
    showToast("Comment Deleted", "Your comment was removed.", "success");
    onRefresh();
  };
  const handleFlag = async () => {
    const reason = prompt("Why are you reporting this comment?");
    if (reason) {
      try { await flagComment(comment.id, "other", reason); showToast("Comment Reported", "Thank you for helping keep the community safe.", "success"); }
      catch (error: any) { showToast("Notice", error.message, "error"); }
    }
  };
  const handleAdminDelete = async () => {
    const reason = prompt("Enter deletion reason for the user:");
    if (reason) { await adminDeleteComment(comment.id, reason); onRefresh(); }
  };

  const thread = children.length > 0 && !isCollapsed && <div className="mt-1 space-y-1 border-l-2 border-border/70 pl-3 sm:pl-6">{children.map((child) => <CommentItem key={child.id} comment={child} documentId={documentId} depth={Math.min(depth + 1, 6)} onRefresh={onRefresh} onReplyPrompt={onReplyPrompt} />)}</div>;

  if (comment.is_deleted || comment.deleted_by_admin) {
    return <div className="py-2"><div className="rounded-lg bg-surface-hover/60 px-3 py-3 text-sm italic text-muted">{comment.deleted_by_admin ? `[This comment was removed by a moderator${comment.deleted_reason ? `: ${comment.deleted_reason}` : ""}]` : "[This comment was deleted by the user]"}</div>{thread}</div>;
  }

  return (
    <article className="group py-2" aria-label={`Comment by ${name}`}>
      <div className={`relative rounded-xl border bg-surface px-3 py-3 sm:px-4 ${comment.is_pinned ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30"}`}>
        {comment.is_pinned && <span className="absolute -top-2 right-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground"><Pin size={10} /> PINNED</span>}
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5 text-muted">
            <button type="button" onClick={() => setLocalVotes((votes) => votes ? 0 : 1)} className={`rounded-md p-1 hover:bg-primary/10 hover:text-primary ${localVotes ? "text-primary" : ""}`} aria-label="Upvote comment"><ThumbsUp size={15} /></button>
            <span className="text-xs font-extrabold tabular-nums">{localVotes}</span>
          </div>
          <div className="min-w-0 flex-1">
            <header className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">{initials}</div>}
                <div className="min-w-0"><div className="truncate text-sm font-extrabold text-foreground">{name}</div><time dateTime={comment.created_at} title={new Date(comment.created_at).toLocaleString()} className="text-xs font-medium text-muted">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}{comment.updated_at !== comment.created_at && " · edited"}</time></div>
              </div>
              <DropdownMenu.Root><DropdownMenu.Trigger aria-label="Comment actions" className="rounded-lg p-1 text-muted opacity-0 hover:bg-surface-hover hover:text-foreground group-hover:opacity-100 focus:opacity-100"><MoreHorizontal size={17} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-50 min-w-[150px] rounded-xl border border-border bg-surface p-1 shadow-xl"><DropdownMenu.Item onClick={handleFlag} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-surface-hover"><Flag size={14} /> Report</DropdownMenu.Item><DropdownMenu.Item onClick={() => setIsEditing(true)} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-surface-hover"><Edit2 size={14} /> Edit</DropdownMenu.Item><DropdownMenu.Item onClick={handleDelete} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Delete</DropdownMenu.Item>{isAdmin && <><DropdownMenu.Separator className="my-1 h-px bg-border" /><DropdownMenu.Item onClick={() => adminPinComment(comment.id, !comment.is_pinned).then(onRefresh)} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm text-primary hover:bg-primary/10"><Pin size={14} /> {comment.is_pinned ? "Unpin" : "Pin"}</DropdownMenu.Item><DropdownMenu.Item onClick={handleAdminDelete} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Mod Delete</DropdownMenu.Item></>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
            </header>
            <div className="mt-3 text-sm text-foreground/90">{isEditing ? <CommentInput documentId={documentId} parentId={comment.parent_id || undefined} onSubmit={async (content) => { await updateComment(comment.id, content); setIsEditing(false); onRefresh(); }} onCancel={() => setIsEditing(false)} autoFocus /> : <><MarkdownPreview content={displayContent} />{isLong && <button type="button" onClick={() => setIsExpanded((value) => !value)} className="font-bold text-primary hover:underline">{isExpanded ? "Show less" : "Read more"}</button>}</>}</div>
            <div className="relative mt-3 flex items-center gap-4 text-xs font-bold text-muted"><button type="button" onClick={() => { onReplyPrompt?.(); setIsReplying((value) => !value); }} className="flex items-center gap-1.5 hover:text-foreground"><MessageSquare size={14} /> Reply</button>{children.length > 0 && <button type="button" onClick={() => setIsCollapsed((value) => !value)} className="flex items-center gap-1 hover:text-foreground">{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {isCollapsed ? `Show ${children.length} ${children.length === 1 ? "reply" : "replies"}` : "Collapse thread"}</button>}<div className="absolute bottom-6 left-0 hidden translate-y-full items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-lg group-hover:flex">{reactions.map((reaction) => <button key={reaction} type="button" onClick={() => setSelectedReaction(selectedReaction === reaction ? null : reaction)} className={`rounded-md px-1.5 py-1 text-base hover:bg-surface-hover ${selectedReaction === reaction ? "bg-primary/10" : ""}`} aria-label={`React ${reaction}`}>{reaction}</button>)}</div>{selectedReaction && <span className="rounded-full bg-surface-hover px-2 py-1 text-sm">{selectedReaction} 1</span>}</div>
            {isReplying && <div className="mt-4"><CommentInput documentId={documentId} parentId={comment.id} onSubmit={handleReplySubmit} onCancel={() => setIsReplying(false)} autoFocus placeholder="Write a reply..." /></div>}
          </div>
        </div>
      </div>
      {thread}
    </article>
  );
};
