"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Subject, Branch, subjectMatchesFilter } from "@/app/lib/api/subjects";
import { SUBJECT_UI_MAP, ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { CardGrid, EmptyState } from "@/components/layout/SharedLayouts";
import { BookOpen, Upload, FileText, Filter, ChevronDown, X } from "lucide-react";
import { requestUploadPrompt } from "@/app/lib/student-prompts";

interface SubjectGridProps {
  subjects: Subject[];
  subjectCounts: Record<string, number>;
  branches: Branch[];
  defaultBranchId?: number | null;
  defaultYear?: number | null;
}

export default function SubjectGrid({ subjects, subjectCounts, branches, defaultBranchId = null, defaultYear = null }: SubjectGridProps) {
  const [selectedSubject, setSelectedSubject] = useState("All");
  const [activeIndex, setActiveIndex] = useState(0);
  const elementsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  // The profile arrives after first paint, so the branch/year filters follow it until
  // the student picks something themselves — the override wins from then on.
  const [branchOverride, setBranchOverride] = useState<{ value: number | null } | null>(null);
  const [yearOverride, setYearOverride] = useState<{ value: number | null } | null>(null);
  const branchId = branchOverride ? branchOverride.value : defaultBranchId;
  const year = yearOverride ? yearOverride.value : defaultYear;

  const filteredSubjects = subjects
    .filter(sub => subjectMatchesFilter(sub, branchId, year))
    .filter(sub => selectedSubject === "All" || sub.name === selectedSubject);

  const branchName = branches.find(b => b.id === branchId)?.code;
  const isFiltered = branchId !== null || year !== null;
  const filterSummary = [branchName, getYearLabel(year)].filter(Boolean).join(" · ");

  const clearFilters = () => {
    setBranchOverride({ value: null });
    setYearOverride({ value: null });
  };

  useEffect(() => {
    setActiveIndex(0);
    elementsRef.current = elementsRef.current.slice(0, filteredSubjects.length);
  }, [selectedSubject, branchId, year, filteredSubjects.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const totalItems = filteredSubjects.length;
    if (totalItems === 0) return;
    let newIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); newIndex = (index + 1) % totalItems; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); newIndex = (index - 1 + totalItems) % totalItems; }
    else if (e.key === 'Home') { e.preventDefault(); newIndex = 0; }
    else if (e.key === 'End') { e.preventDefault(); newIndex = totalItems - 1; }
    if (newIndex !== index) { setActiveIndex(newIndex); elementsRef.current[newIndex]?.focus(); }
  };

  const selectClass = "motion-hover motion-focus h-11 w-full appearance-none cursor-pointer rounded-xl border border-border/60 bg-surface pl-10 pr-10 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors hover:border-border focus:border-primary focus:ring-1 focus:ring-primary/20";

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:w-64">
          <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Filter subjects"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className={selectClass}
          >
            <option value="All">All Subjects</option>
            {subjects.map((sub) => (
              <option key={`filter-${sub.slug}`} value={sub.name}>
                {sub.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <ChevronDown className="size-4 text-muted-foreground opacity-50" />
          </div>
        </div>

        {branches.length > 0 && (
          <div className="relative w-full sm:w-52">
            <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              aria-label="Filter subjects by branch"
              value={branchId ?? ""}
              onChange={(e) => setBranchOverride({ value: e.target.value ? Number(e.target.value) : null })}
              className={selectClass}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.code}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <ChevronDown className="size-4 text-muted-foreground opacity-50" />
            </div>
          </div>
        )}

        <div className="relative w-full sm:w-44">
          <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Filter subjects by year"
            value={year ?? ""}
            onChange={(e) => setYearOverride({ value: e.target.value ? Number(e.target.value) : null })}
            className={selectClass}
          >
            <option value="">All Years</option>
            {ACADEMIC_YEARS.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <ChevronDown className="size-4 text-muted-foreground opacity-50" />
          </div>
        </div>
      </div>

      {isFiltered && filterSummary && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Showing {filterSummary}
          </span>
          <button
            onClick={clearFilters}
            className="motion-hover inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-xs font-bold text-muted hover:text-foreground"
          >
            <X size={12} /> Show all subjects
          </button>
        </div>
      )}

      {filteredSubjects.length === 0 ? (
        <EmptyState
          title="No subjects match this filter"
          message="Clear the branch and year filters to see everything, or upload notes for a class your batch needs."
          icon={BookOpen}
          action={
            <>
              <button onClick={() => { setSelectedSubject("All"); clearFilters(); }} className="motion-hover motion-active rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-hover">
                Show all subjects
              </button>
              <button onClick={requestUploadPrompt} className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                <Upload size={15} /> Upload Notes
              </button>
            </>
          }
        />
      ) : (
        <CardGrid cols="5">
          {filteredSubjects.map((sub, index) => {
            const ui = SUBJECT_UI_MAP[sub.slug] || SUBJECT_UI_MAP["default"];
            const Icon = ui.icon;
            const count = subjectCounts[sub.name.toUpperCase()] || 0;

          return (
            <motion.div layout key={sub.slug} className="flex w-full">
              <Link
                href={`/subject/${sub.slug}`}
                role="listitem"
                ref={(el) => { if (el) elementsRef.current[index] = el; }}
                tabIndex={activeIndex === index ? 0 : -1}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="group motion-hover motion-active relative flex w-full flex-col items-start justify-between overflow-hidden rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`absolute left-0 top-0 h-1 w-full ${ui.topBar || ui.color.replace('text-', 'bg-')}`} />
                <div className="w-full">
                  <div className={`mb-4 flex size-12 items-center justify-center rounded-xl ${ui.bg} ${ui.color} transition-transform group-hover:scale-110`}>
                    <Icon size={24} />
                  </div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">{sub.name}</h2>
                </div>

                <div className="mt-6">
                  {count > 0 ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                      <FileText size={14} />
                      <span>{count} resource{count !== 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3 py-1 text-xs font-medium text-muted">
                      <div className="size-1.5 rounded-full bg-muted-foreground/50" />
                      <span>No resources yet</span>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
            );
          })}
        </CardGrid>
      )}
    </>
  );
}
