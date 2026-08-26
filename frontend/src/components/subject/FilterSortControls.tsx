"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { ArrowDownUp, Filter } from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "pyq", label: "PYQs" },
  { id: "tutorial_sheet", label: "Tutorials" },
  { id: "syllabus", label: "Syllabus" },
];

const SORT_OPTIONS = [
  { id: "created_at", label: "Newest" },
  { id: "upvotes", label: "Most Upvoted" },
  { id: "download_count", label: "Most Downloaded" },
];

export default function FilterSortControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentCategory = searchParams.get("category") || "all";
  const currentSort = searchParams.get("sort") || "created_at";

  const updateParams = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all" && value !== "created_at") {
        params.set(name, value);
      } else {
        params.delete(name);
      }

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  return (
    <div className="mb-3 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="relative min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pr-2 hide-scrollbar">
          <Filter size={15} className="mr-1 shrink-0 text-muted" />
          {CATEGORIES.map((category) => {
            const isActive = currentCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => updateParams("category", category.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-hover text-muted hover:text-foreground"
                  }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <label htmlFor="sort-select" className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <ArrowDownUp size={14} /> <span className="hidden sm:inline">Sort by</span>
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => updateParams("sort", e.target.value)}
          disabled={isPending}
          className="appearance-none rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1em] bg-no-repeat bg-[right_0.5rem_center]"
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
