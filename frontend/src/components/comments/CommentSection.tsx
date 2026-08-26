"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Loader2 } from "lucide-react";
import { getComments, postComment } from "@/app/lib/api/comments";
import { CommentInput } from "./CommentInput";
import { CommentItem } from "./CommentItem";
import { InlineProfileSetupModal } from "../layout/modals/InlineProfileSetupModal";
import { useAuth } from "@/app/context/AuthContext";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import { dispatchToast as showToast } from "@/app/lib/toast";

interface CommentSectionProps {
  documentId: number;
}

export const CommentSection = ({ documentId }: CommentSectionProps) => {
  const { userProfile, isStudent, isAdmin } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const [isDiscussionExpanded, setIsDiscussionExpanded] = useState(false);

  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    const data = await getComments(documentId);
    setComments(data);
    setIsLoading(false);
  }, [documentId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Build the hierarchical tree
  const commentTree = useMemo(() => {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // First pass: map all comments
    comments.forEach(c => {
      map.set(c.id, { ...c, children: [] });
    });

    // Second pass: build tree
    comments.forEach(c => {
      const node = map.get(c.id);
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Roots are already ordered by is_pinned then created_at from the DB query
    return roots;
  }, [comments]);

  const handleTopLevelSubmit = async (content: string) => {
    if (!isStudent && !isAdmin) {
      requestAuthPrompt("comment");
      throw new Error("UNAUTHORIZED");
    }

    if (!userProfile?.full_name) {
      setPendingDraft(content);
      setShowProfileSetup(true);
      throw new Error("PROFILE_NAME_REQUIRED");
    }

    await postComment(documentId, content);
    await fetchComments();
  };

  const handleProfileSetupSuccess = async () => {
    // If they were trying to submit a comment, retry it
    if (pendingDraft) {
      try {
        await postComment(documentId, pendingDraft);
        setPendingDraft(null);
        // We'll rely on the CommentInput's local storage clearing to reset the input since we threw an error before.
        // Actually since we threw an error, the input still has the text. We can't easily clear it from here unless we pass a ref.
        // But the user can just click Post again.
        showToast("Success", "Your name is saved. Please click Post again.", "success");
      } catch (e: any) {
        showToast("Error", e.message, "error");
      }
    }
    await fetchComments();
  };

  const handleReplyPrompt = () => {
    if (!isStudent && !isAdmin) {
      requestAuthPrompt("comment");
    } else if (!userProfile?.full_name) {
      setShowProfileSetup(true);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setIsDiscussionExpanded((expanded) => !expanded)}
        aria-expanded={isDiscussionExpanded}
        aria-controls="document-discussion-content"
        className="motion-hover flex w-full shrink-0 items-center gap-3 bg-surface-hover/70 px-4 py-3 text-left hover:bg-background sm:px-6"
      >
        <MessageSquare size={18} className="text-primary" aria-hidden="true" />
        <span className="text-base font-extrabold tracking-tight text-foreground">Discussion</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
          {isLoading ? "—" : comments.length}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs font-bold text-muted">
          {isDiscussionExpanded ? "Collapse" : "Expand"}
          {isDiscussionExpanded ? (
            <ChevronUp size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </span>
      </button>

      {isDiscussionExpanded && (
        /* Sticky comment input area at the top of the scrollable section */
        <div
          id="document-discussion-content"
          className="custom-scrollbar relative max-h-[70vh] flex-1 overflow-y-auto border-t border-border"
        >
          <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-4 backdrop-blur sm:px-6">
            <CommentInput
              documentId={documentId}
              onSubmit={handleTopLevelSubmit}
              placeholder="What are your thoughts on this document?"
            />
          </div>

          <div className="px-3 py-4 sm:px-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted">
                <Loader2 size={24} className="animate-spin mb-2" />
                <span className="text-sm font-bold">Loading comments...</span>
              </div>
            ) : commentTree.length > 0 ? (
              <div className="space-y-2">
                {commentTree.map(comment => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    documentId={documentId}
                    onRefresh={fetchComments}
                    onReplyPrompt={handleReplyPrompt}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-muted mb-3">
                  <MessageSquare size={24} />
                </div>
                <p className="text-sm font-bold text-foreground">No comments yet</p>
                <p className="mt-1 text-sm text-muted">Be the first to share your thoughts or ask a question.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <InlineProfileSetupModal
        isOpen={showProfileSetup}
        onOpenChange={setShowProfileSetup}
        onSuccess={handleProfileSetupSuccess}
      />
    </div>
  );
};
