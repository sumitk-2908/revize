"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Layers, FileText, ArrowDownUp } from "lucide-react";
import { searchDocuments } from "@/app/lib/api/documents";
import { type Module, type Subject } from "@/app/lib/api/subjects";
import { normalizeTitle } from "@/app/lib/subject-config";
import DocumentInteractiveGrid from "./DocumentInteractiveGrid";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ScrollReveal } from "@/components/ui/Motion";
import type { DocumentRecord } from "@/app/lib/document-types";

export default function SubjectTabs({
  subjectDetails,
  modules,
  moduleCounts,
  subjectSlug
}: {
  subjectDetails: Subject;
  modules: Module[];
  moduleCounts: Record<number, number>;
  subjectSlug: string;
}) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "notes" | "pyq" | "tutorial_sheet" | "syllabus">("dashboard");
  const [sortBy, setSortBy] = useState<"created_at" | "upvotes" | "download_count">("created_at");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Non-module subjects have no module grid, so their dashboard lists every
  // resource in the subject instead.
  const showModuleGrid = activeTab === "dashboard" && !subjectDetails?.is_non_module;

  useEffect(() => {
    if (showModuleGrid) return;

    let cancelled = false;
    const fetchTabData = async () => {
      setLoading(true);
      const response = await searchDocuments({
        subject: subjectDetails.name,
        category: activeTab === "dashboard" ? undefined : activeTab,
        sortBy: sortBy,
        limit: 50
      });
      if (cancelled) return;
      setDocuments(response.data);

      setLoading(false);
    };

    fetchTabData();
    return () => { cancelled = true; };
  }, [activeTab, sortBy, subjectDetails.name, showModuleGrid]);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-1 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 after:pointer-events-none after:absolute after:top-0 after:right-0 after:h-full after:w-8 after:bg-gradient-to-l after:from-surface after:to-transparent after:content-['']">
          <div className="scrollbar-none flex gap-1 overflow-x-auto pr-8">
            {(["dashboard", "notes", "pyq", "tutorial_sheet", "syllabus"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap border-b-2 px-4 py-2 text-xs font-bold transition-colors ${activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
                  }`}
              >
                {normalizeTitle(tab === "tutorial_sheet" ? "Tutorial" : tab)}
              </button>
            ))}
          </div>
        </div>
        {!showModuleGrid && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto pb-1 sm:pb-0">
            <label htmlFor="subject-sort" className="text-xs font-bold text-muted flex items-center gap-1.5">
              <ArrowDownUp size={14} /> Sort by
            </label>
            <select
              id="subject-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1em] bg-no-repeat bg-[right_0.5rem_center]"
            >
              <option value="created_at">Newest</option>
              <option value="upvotes">Most Upvoted</option>
              <option value="download_count">Most Downloaded</option>
            </select>
          </div>
        )}
      </div>

      {showModuleGrid ? (
        <ErrorBoundary title="Course Modules could not load" message="The module grid hit an unexpected problem. Try refreshing.">
          <div className="space-y-4 pt-6">
            <h2 className="text-xs font-extrabold tracking-wider text-muted uppercase">
              Course Modules
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {modules.map((mod, index) => {
                const count = moduleCounts[mod.module_number] || 0;

                return (
                  <ScrollReveal key={mod.id} transition={{ duration: 0.42, delay: Math.min(index * 0.05, 0.25), ease: [0.32, 0.72, 0, 1] }}>
                    <Link
                      href={`/subject/${subjectSlug}/module-${mod.module_number}`}
                      className="group relative flex h-full flex-col items-start justify-between overflow-hidden rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-1 hover:shadow-md"
                    >
                      <div className="absolute left-0 top-0 h-1 w-full bg-primary" />
                      <div className="w-full">
                        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                          <Layers size={21} />
                        </div>
                        <h2 className="text-base font-bold tracking-tight text-foreground">
                          {normalizeTitle(mod.name || `Module ${mod.module_number}`)}
                        </h2>
                        {mod.name && mod.name.trim().toLowerCase() !== `module ${mod.module_number}` && (
                          <p className="mt-1 text-sm text-muted">Module {mod.module_number}</p>
                        )}
                      </div>

                      <div className="mt-4">
                        {count > 0 ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-500">
                            <FileText size={14} />
                            <span>{count} resource{count !== 1 ? 's' : ''}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3 py-1 text-xs font-medium text-muted">
                            <div className="size-1.5 rounded-full bg-muted/50" />
                            <span>No resources yet</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </ErrorBoundary>
      ) : (
        <div className="space-y-4 pt-6">
          {activeTab === "dashboard" && (
            <h2 className="text-xs font-extrabold tracking-wider text-muted uppercase">
              All Resources
            </h2>
          )}
          <ErrorBoundary
            title="Document grid could not load"
            message="The filtered resources hit an unexpected problem. Try again or switch tabs."
          >
            <DocumentInteractiveGrid
              initialDocuments={documents}
              subjectSlug={subjectSlug}
              loading={loading}
            />
          </ErrorBoundary>
        </div>
      )}
    </>
  );
}
