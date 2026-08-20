"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { Check, ChevronDown, Search } from "lucide-react";
import { Subject } from "@/app/lib/api/subjects";

interface SubjectComboboxProps {
  subjects: Subject[];
  /** The committed subject name. Always one of `subjects`, never free text. */
  value: string;
  /** Called only with a real subject name — typed text never reaches it. */
  onChange: (subjectName: string) => void;
  id?: string;
  disabled?: boolean;
}

/** A searchable subject picker that stays constrained to real subjects: the typed
 *  query lives here, and only a chosen subject's name is ever handed to onChange. */
export default function SubjectCombobox({ subjects, value, onChange, id = "subject-combobox", disabled = false }: SubjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);

  const fuse = useMemo(() => new Fuse(subjects, { keys: ["name"], threshold: 0.4 }), [subjects]);
  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return subjects;
    return fuse.search(trimmed).map(result => result.item);
  }, [fuse, query, subjects]);

  const selectedIndex = Math.min(activeIndex, Math.max(matches.length - 1, 0));
  const listboxId = `${id}-listbox`;

  // Keep the highlighted option visible while arrowing through a long subject list.
  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  const openList = () => {
    if (disabled || open) return;
    setQuery("");
    setActiveIndex(Math.max(subjects.findIndex(sub => sub.name === value), 0));
    setOpen(true);
  };

  /** Closes without committing, so the input falls back to the current selection. */
  const cancel = () => {
    setOpen(false);
    setQuery("");
  };

  const commit = (subjectName: string) => {
    onChange(subjectName);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(index => matches.length ? (index + step + matches.length) % matches.length : 0);
      return;
    }
    if (event.key === "Enter") {
      // Never let a partial query through — only a highlighted match commits.
      event.preventDefault();
      if (open && matches[selectedIndex]) commit(matches[selectedIndex].name);
      return;
    }
    if (event.key === "Escape" && open) {
      // Contain it here, or the surrounding Radix dialog dismisses too.
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  return (
    <div className="relative">
      <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[selectedIndex] ? `${id}-option-${matches[selectedIndex].id}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : value}
        placeholder={open ? value || "Search subjects..." : "Search subjects..."}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
        onFocus={openList}
        onClick={openList}
        onBlur={cancel}
        onKeyDown={handleKeyDown}
        className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-8 text-xs text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50"
      />
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" aria-hidden="true" />

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Subjects"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {matches.map((subject, index) => {
            const isActive = index === selectedIndex;
            const isSelected = subject.name === value;
            return (
              <button
                key={subject.id}
                id={`${id}-option-${subject.id}`}
                ref={isActive ? activeOptionRef : undefined}
                type="button"
                role="option"
                aria-selected={isSelected}
                // Keeps focus on the input so onBlur does not cancel the click.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(subject.name)}
                className={`motion-hover flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-surface-hover"}`}
              >
                <span className="truncate">{subject.name}</span>
                {isSelected && <Check size={13} className="shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
          {matches.length === 0 && (
            <div className="px-3 py-2 text-xs font-semibold text-muted">No subjects found.</div>
          )}
        </div>
      )}
    </div>
  );
}
