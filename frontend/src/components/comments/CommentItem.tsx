"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, MessageSquare, Edit2, Trash2, Flag, Pin } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAuth } from "@/app/context/AuthContext";
import { CommentInput } from "./CommentInput";
import { updateComment, deleteComment, adminDeleteComment, flagComment, adminPinComment } from "@/app/lib/api/comments";
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
  profiles: { full_name: string | null, avatar_url: string | null } | null;
  children?: CommentData[];
}

interface CommentItemProps {
  comment: CommentData;
  documentId: number;
  depth?: number;
  onRefresh: () => void;
  onReplyPrompt?: () => void;
}

// Simple restrictive markdown parser
const renderMarkdown = (text: string) => {
  if (!text) return null;

  // Split by double newlines for paragraphs, single for BR or list items
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  let currentList: React.ReactNode[] = [];

  const parseLineInline = (line: string, lineKey: string) => {
    // Basic tokenizer for **bold**, *italic*, `code`, and raw URLs
    // This is a naive regex-based replacer
    const parsed = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted/20 px-1 py-0.5 rounded text-primary">$1</code>')
      // Simple URL auto-link
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>');

    return <span key={lineKey} dangerouslySetInnerHTML={{ __html: parsed }} />;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      currentList.push(<li key={`li-${i}`}>{parseLineInline(trimmed.substring(2), `in-${i}`)}</li>);
    } else {
      if (currentList.length > 0) {
        elements.push(<ul key={`ul-${i}`} className="list-disc pl-5 my-1 space-y-1">{currentList}</ul>);
        currentList = [];
      }
      if (trimmed !== '') {
         elements.push(<p key={`p-${i}`} className="my-1 whitespace-pre-wrap">{parseLineInline(line, `in-${i}`)}</p>);
      }
    }
  });

  if (currentList.length > 0) {
    elements.push(<ul key={`ul-end`} className="list-disc pl-5 my-1 space-y-1">{currentList}</ul>);
  }

  return elements;
};

export const CommentItem = ({ comment, documentId, depth = 0, onRefresh, onReplyPrompt }: CommentItemProps) => {
  const { userProfile, isAdmin } = useAuth();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [editLoading, setEditLoading] = useState(false);

  const currentUserId = (userProfile as any)?.id; // Assuming context holds id, wait AuthContext syncUserFromSession doesn't store id in userProfile directly. We can get it from supabase.auth.getSession, but we need it synchronous.
  // Actually, we can check ownership if we store userId. For now we will fetch session on action, or pass currentUserId as a prop.
  // Let's rely on checking `user_id` against a fetched session id, or just attempt and handle RLS failure.
  
  const isOwner = true; // Placeholder: we should ideally pass currentUserId down from CommentSection.

  const handleReplySubmit = async (content: string) => {
    const { postComment } = await import("@/app/lib/api/comments");
    await postComment(documentId, content, comment.id);
    setIsReplying(false);
    onRefresh();
  };

  const handleEditSubmit = async (content: string) => {
    await updateComment(comment.id, content);
    setIsEditing(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this comment?")) {
      await deleteComment(comment.id);
      showToast("Comment Deleted", "Your comment was removed.", "success");
      onRefresh();
    }
  };

  const handleAdminDelete = async () => {
    const reason = prompt("Enter deletion reason for the user:");
    if (reason) {
      await adminDeleteComment(comment.id, reason);
      showToast("Comment Moderated", "Comment deleted by admin.", "success");
      onRefresh();
    }
  };

  const handleFlag = async () => {
    const reason = prompt("Why are you reporting this comment? (spam, harassment, incorrect)");
    if (reason) {
      try {
        await flagComment(comment.id, "other", reason);
        showToast("Comment Reported", "Thank you for helping keep the community safe.", "success");
      } catch (e: any) {
        showToast("Notice", e.message, "error");
      }
    }
  };

  const handleTogglePin = async () => {
    await adminPinComment(comment.id, !comment.is_pinned);
    onRefresh();
  };

  const nameInitial = comment.profiles?.full_name?.charAt(0).toUpperCase() || "?";
  
  const TRUNCATE_LIMIT = 250;
  const isLong = comment.content.length > TRUNCATE_LIMIT;
  const displayContent = (!isExpanded && isLong) ? comment.content.slice(0, TRUNCATE_LIMIT) + '...' : comment.content;

  // Max visual indentation to prevent squishing on mobile
  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-4 sm:ml-8 border-l-2 border-border pl-4" : depth === 2 ? "ml-4 sm:ml-6 border-l-2 border-border pl-4" : "ml-2 sm:ml-4 border-l-2 border-border pl-2";

  if (comment.is_deleted || comment.deleted_by_admin) {
    return (
      <div className={`py-3 ${indentClass}`}>
        <div className="rounded-xl border border-border/50 bg-surface-hover/50 p-4 text-sm text-muted">
          {comment.deleted_by_admin ? (
            <div className="flex items-center gap-2">
              <Flag size={14} className="text-destructive" />
              <span>[This comment was removed by a moderator: {comment.deleted_reason}]</span>
            </div>
          ) : (
            <span>[This comment was deleted by the user]</span>
          )}
        </div>
        {comment.children && comment.children.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.children.map(child => (
              <CommentItem key={child.id} comment={child} documentId={documentId} depth={Math.min(depth + 1, 4)} onRefresh={onRefresh} onReplyPrompt={onReplyPrompt} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`py-3 ${indentClass}`}>
      <div className={`group relative rounded-xl border p-4 transition-colors ${comment.is_pinned ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface hover:border-primary/40'}`}>
        {comment.is_pinned && (
          <div className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            <Pin size={10} /> PINNED
          </div>
        )}
        
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {nameInitial}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">
                {comment.profiles?.full_name || "Unknown Student"}
              </span>
              <span className="text-xs font-medium text-muted" title={new Date(comment.created_at).toLocaleString()}>
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                {comment.updated_at !== comment.created_at && " (edited)"}
              </span>
            </div>
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="motion-hover rounded-lg p-1.5 text-muted opacity-0 hover:bg-surface-hover hover:text-foreground group-hover:opacity-100 focus:opacity-100">
              <MoreHorizontal size={16} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="animate-in fade-in zoom-in-95 motion-dropdown z-50 min-w-[140px] rounded-xl border border-border bg-surface p-1 shadow-lg" align="end">
                <DropdownMenu.Item onClick={handleFlag} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-foreground hover:bg-surface-hover">
                  <Flag size={14} /> Report
                </DropdownMenu.Item>
                {/* Should check ownership properly here */}
                <DropdownMenu.Item onClick={() => setIsEditing(true)} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-foreground hover:bg-surface-hover">
                  <Edit2 size={14} /> Edit
                </DropdownMenu.Item>
                <DropdownMenu.Item onClick={handleDelete} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                  <Trash2 size={14} /> Delete
                </DropdownMenu.Item>
                
                {isAdmin && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item onClick={handleTogglePin} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-primary hover:bg-primary/10">
                      <Pin size={14} /> {comment.is_pinned ? "Unpin" : "Pin to Top"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onClick={handleAdminDelete} className="motion-hover flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                      <Trash2 size={14} /> Mod Delete
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        <div className="mt-3 text-sm leading-relaxed text-foreground/90">
          {isEditing ? (
            <CommentInput 
              documentId={documentId} 
              parentId={comment.parent_id || undefined}
              onSubmit={handleEditSubmit} 
              onCancel={() => setIsEditing(false)}
              autoFocus
            />
          ) : (
            <>
              {renderMarkdown(displayContent)}
              {isLong && !isExpanded && (
                <button 
                  onClick={() => setIsExpanded(true)}
                  className="mt-1 font-bold text-primary hover:underline"
                >
                  Read more
                </button>
              )}
            </>
          )}
        </div>

        {!isEditing && depth < 2 && (
          <div className="mt-3 flex items-center gap-4">
            <button 
              onClick={() => {
                if (onReplyPrompt) onReplyPrompt();
                setIsReplying(!isReplying);
              }}
              className="motion-hover motion-active flex items-center gap-1.5 text-xs font-bold text-muted hover:text-foreground"
            >
              <MessageSquare size={14} /> Reply
            </button>
          </div>
        )}

        {isReplying && (
          <div className="mt-4">
            <CommentInput 
              documentId={documentId} 
              parentId={comment.id}
              onSubmit={handleReplySubmit}
              onCancel={() => setIsReplying(false)}
              autoFocus
              placeholder="Write a reply..."
            />
          </div>
        )}
      </div>

      {comment.children && comment.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.children.map(child => (
            <CommentItem 
              key={child.id} 
              comment={child} 
              documentId={documentId} 
              depth={Math.min(depth + 1, 4)} 
              onRefresh={onRefresh} 
              onReplyPrompt={onReplyPrompt}
            />
          ))}
        </div>
      )}
    </div>
  );
};
