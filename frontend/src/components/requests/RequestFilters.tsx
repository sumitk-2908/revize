"use client";

import { ArrowDownUp, Filter } from "lucide-react";
import type { RequestSort, RequestStatusFilter } from "@/app/lib/api/requests";
import type { Subject } from "@/app/lib/api/subjects";

const STATUS_OPTIONS: { id: RequestStatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "all", label: "All" },
];

const SORT_OPTIONS: { id: RequestSort; label: string }[] = [
  { id: "wanted", label: "Most Wanted" },
  { id: "newest", label: "Newest" },
];

export interface RequestFiltersProps {
  subjects: Subject[];
  status: RequestStatusFilter;
  subject: string;
  sort: RequestSort;
  onStatusChange: (status: RequestStatusFilter) => void;
  onSubjectChange: (subject: string) => void;
  onSortChange: (sort: RequestSort) => void;
}

/** Status pills + subject and sort selects, styled to match
 *  components/subject/FilterSortControls.tsx. State is held by the board rather
 *  than the URL: the whole page is one client component. */
export default function RequestFilters({
  subjects,
  status,
  subject,
  sort,
  onStatusChange,
  onSubjectChange,
  onSortChange,
}: RequestFiltersProps) {
  const selectClasses =
    "motion-focus h-9 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-foreground outline-none disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
        <Filter size={16} className="mr-1 shrink-0 text-muted" aria-hidden="true" />
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onStatusChange(option.id)}
            aria-pressed={status === option.id}
            className={`motion-hover shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
              status === option.id
                ? "bg-primary text-primary-foreground"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor="request-subject-filter" className="sr-only">
          Filter by subject
        </label>
        <select
          id="request-subject-filter"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          className={selectClasses}
        >
          <option value="">All subjects</option>
          {subjects.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>

        <label htmlFor="request-sort" className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <ArrowDownUp size={14} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Sort</span>
        </label>
        <select
          id="request-sort"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as RequestSort)}
          className={selectClasses}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
