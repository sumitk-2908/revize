"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, Send, AtSign } from "lucide-react";
import { searchUsersForMention } from "@/app/lib/api/comments";
import { MarkdownPreview } from "./MarkdownPreview";

interface CommentInputProps {
  documentId: number;
  parentId?: string;
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

export const CommentInput = ({ documentId, parentId, onSubmit, placeholder = "Add to the discussion...", autoFocus = false, onCancel }: CommentInputProps) => {
  const draftKey = `draft_comment_${documentId}_${parentId || "root"}`;
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<{ id: string; full_name: string }[]>([]);
  const [isSearchingMentions, setIsSearchingMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_CHARS = 1000;
  const WARNING_THRESHOLD = 900;

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) setContent(saved);
  }, [draftKey]);

  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMentions(true);
      setMentionResults(await searchUsersForMention(mentionQuery));
      setIsSearchingMentions(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value.slice(0, MAX_CHARS);
    setContent(next);
    localStorage.setItem(draftKey, next);
    const beforeCursor = next.slice(0, event.target.selectionStart);
    const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9_ ]*)$/);
    setMentionQuery(match ? match[2] : null);
  };

  const handleSelectMention = (name: string) => {
    if (mentionQuery === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const match = before.match(/(^|\s)@([a-zA-Z0-9_ ]*)$/);
    if (!match) return;
    const start = match.index === 0 && before.startsWith("@") ? 0 : match.index! + 1;
    const replacement = `${before.slice(0, start)}@${name} `;
    const next = replacement + after;
    setContent(next);
    localStorage.setItem(draftKey, next);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(replacement.length, replacement.length);
    }, 0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim() || content.length > MAX_CHARS) return;
    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent("");
      setIsPreview(false);
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isWarning = content.length >= WARNING_THRESHOLD;
  const isOverLimit = content.length >= MAX_CHARS;

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-border bg-background focus-within:border-primary/60">
        <div className="flex items-center justify-between border-b border-border bg-surface-hover/60 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-bold text-muted">
            <span className="rounded-md bg-background px-2 py-1 text-foreground">Markdown</span>
            <span className="hidden sm:inline">supports **bold**, *italic*, lists, quotes and `code`</span>
          </div>
          <button type="button" onClick={() => setIsPreview((value) => !value)} className="motion-hover flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-muted hover:bg-background hover:text-foreground" aria-pressed={isPreview}>
            {isPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {isPreview ? "Write" : "Preview"}
          </button>
        </div>
        {isPreview ? (
          <div className="min-h-[100px] p-3 text-sm text-foreground">{content.trim() ? <MarkdownPreview content={content} /> : <span className="text-muted">Nothing to preview yet.</span>}</div>
        ) : (
          <div className="relative">
            <textarea ref={textareaRef} value={content} onChange={handleChange} autoFocus={autoFocus} placeholder={placeholder} className="min-h-[100px] w-full resize-none bg-transparent p-3 text-sm text-foreground outline-none" />
            {mentionQuery !== null && (
              <div className="absolute left-2 top-full z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
                {isSearchingMentions ? <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> Searching...</div> : mentionResults.length ? mentionResults.map((user) => <button key={user.id} type="button" onClick={() => handleSelectMention(user.full_name)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-hover"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{user.full_name.charAt(0)}</span>{user.full_name}</button>) : <div className="p-3 text-center text-xs text-muted">No users found</div>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 text-xs font-bold tabular-nums ${isOverLimit ? "text-destructive" : isWarning ? "text-orange-500" : "text-muted"}`}><AtSign size={13} />{content.length} / {MAX_CHARS}</div>
        <div className="flex items-center gap-2">{onCancel && <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-bold text-muted hover:bg-surface-hover hover:text-foreground">Cancel</button>}<button type="submit" disabled={isSubmitting || !content.trim() || isOverLimit} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">{isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post</button></div>
      </div>
    </form>
  );
};
