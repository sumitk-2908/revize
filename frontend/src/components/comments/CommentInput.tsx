"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, AtSign } from "lucide-react";
import { searchUsersForMention } from "@/app/lib/api/comments";

interface CommentInputProps {
  documentId: number;
  parentId?: string;
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

export const CommentInput = ({ 
  documentId, 
  parentId, 
  onSubmit, 
  placeholder = "Add to the discussion...",
  autoFocus = false,
  onCancel
}: CommentInputProps) => {
  const draftKey = `draft_comment_${documentId}_${parentId || 'root'}`;
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Mentions State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<{id: string, full_name: string}[]>([]);
  const [isSearchingMentions, setIsSearchingMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const MAX_CHARS = 1000;
  const WARNING_THRESHOLD = 900;

  // Restore draft on mount
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      setContent(saved);
    }
  }, [draftKey]);

  // Handle Mentions Search
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }

    const search = async () => {
      setIsSearchingMentions(true);
      const results = await searchUsersForMention(mentionQuery);
      setMentionResults(results);
      setIsSearchingMentions(false);
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newContent = e.target.value;
    if (newContent.length > MAX_CHARS) {
      newContent = newContent.slice(0, MAX_CHARS);
    }
    
    setContent(newContent);
    localStorage.setItem(draftKey, newContent);

    // Mentions logic
    const cursor = e.target.selectionStart;
    const textBeforeCursor = newContent.slice(0, cursor);
    
    // Regex matches "@name" at the end of the text before the cursor
    const match = textBeforeCursor.match(/(^|\s)@([a-zA-Z0-9_ ]*)$/);
    if (match) {
      setMentionQuery(match[2]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleSelectMention = (name: string) => {
    if (mentionQuery === null || !textareaRef.current) return;
    
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = content.slice(0, cursor);
    const textAfterCursor = content.slice(cursor);
    
    // Replace the matched "@query" with "@name "
    const match = textBeforeCursor.match(/(^|\s)@([a-zA-Z0-9_ ]*)$/);
    if (match) {
      const startIdx = match.index === 0 && textBeforeCursor.startsWith('@') ? 0 : match.index! + 1;
      const newBefore = textBeforeCursor.slice(0, startIdx) + `@${name} `;
      const finalContent = newBefore + textAfterCursor;
      
      setContent(finalContent);
      localStorage.setItem(draftKey, finalContent);
      
      // Reset mention state
      setMentionQuery(null);
      
      // Re-focus and set cursor position (need timeout for React to render)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newBefore.length, newBefore.length);
        }
      }, 0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.length > MAX_CHARS) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent("");
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const charCount = content.length;
  const isWarning = charCount >= WARNING_THRESHOLD;
  const isOverLimit = charCount >= MAX_CHARS;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={`motion-focus min-h-[100px] w-full resize-none rounded-xl border bg-background p-3 text-sm text-foreground outline-none transition-colors ${
            isWarning ? 'border-orange-500 focus:border-orange-500' : 
            isOverLimit ? 'border-destructive focus:border-destructive' : 
            'border-border focus:border-primary'
          }`}
        />
        
        {/* Mentions Dropdown */}
        {mentionQuery !== null && (
          <div 
            ref={dropdownRef}
            className="absolute z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
            style={{ 
              top: '100%', 
              left: 0 
            }}
          >
            {isSearchingMentions ? (
              <div className="p-3 text-center text-xs text-muted flex justify-center items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Searching...
              </div>
            ) : mentionResults.length > 0 ? (
              mentionResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectMention(user.full_name)}
                  className="motion-hover flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-surface-hover"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{user.full_name}</span>
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-muted">No users found</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold tabular-nums ${
            isOverLimit ? 'text-destructive' : 
            isWarning ? 'text-orange-500' : 'text-muted'
          }`}>
            {charCount} / {MAX_CHARS}
          </span>
          <span className="hidden sm:inline text-xs text-muted">
            (Supports bold, italic, lists, and inline code)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="motion-hover motion-active rounded-lg px-4 py-2 text-xs font-bold text-muted hover:bg-surface-hover hover:text-foreground"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !content.trim() || isOverLimit}
            className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Post
          </button>
        </div>
      </div>
    </form>
  );
};
