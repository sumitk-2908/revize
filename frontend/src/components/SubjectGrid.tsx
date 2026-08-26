"use client";

import { useState, useEffect, useRef } from "react";
import { ScrollReveal } from "@/components/ui/Motion";
import { Subject, Branch, subjectMatchesFilter } from "@/app/lib/api/subjects";
import { ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { resolveSubjectDesign, spanClass } from "@/app/lib/subject-design";
import SubjectCard from "@/components/subject/SubjectCard";
import { CardGrid, EmptyState } from "@/components/layout/SharedLayouts";
import { BookOpen, Upload } from "lucide-react";
import { requestUploadPrompt } from "@/app/lib/student-prompts";

interface SubjectGridProps {
  subjects: Subject[];
  subjectCounts: Record<string, number>;
  branches: Branch[];
  defaultBranchId?: number | null;
  defaultYear?: number | null;
}

export default function SubjectGrid({ subjects, subjectCounts, branches, defaultBranchId = null, defaultYear = null }: SubjectGridProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const elementsRef = useRef<(HTMLElement | null)[]>([]);

  // The profile arrives after first paint, so the branch/year filters follow it until
  // the student picks something themselves — the override wins from then on.
  const [branchOverride, setBranchOverride] = useState<{ value: number | null } | null>(null);
  const [yearOverride, setYearOverride] = useState<{ value: number | null } | null>(null);
  const branchId = branchOverride ? branchOverride.value : defaultBranchId;
  const year = yearOverride ? yearOverride.value : defaultYear;

  const filteredSubjects = subjects.filter(sub => subjectMatchesFilter(sub, branchId, year));

  const clearFilters = () => {
    setBranchOverride({ value: null });
    setYearOverride({ value: null });
  };

  useEffect(() => {
    setActiveIndex(0);
    elementsRef.current = elementsRef.current.slice(0, filteredSubjects.length);
  }, [branchId, year, filteredSubjects.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, index: number) => {
    const totalItems = filteredSubjects.length;
    if (totalItems === 0) return;
    let newIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); newIndex = (index + 1) % totalItems; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); newIndex = (index - 1 + totalItems) % totalItems; }
    else if (e.key === 'Home') { e.preventDefault(); newIndex = 0; }
    else if (e.key === 'End') { e.preventDefault(); newIndex = totalItems - 1; }
    if (newIndex !== index) { setActiveIndex(newIndex); elementsRef.current[newIndex]?.focus(); }
  };


  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <label className="min-w-0">
          <span className="mb-1.5 block text-xs font-bold text-muted">Branch</span>
          <select
            aria-label="Filter by branch"
            value={branchId ?? ""}
            onChange={(event) => setBranchOverride({ value: event.target.value ? Number(event.target.value) : null })}
            className="motion-focus h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.code}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 block text-xs font-bold text-muted">Year</span>
          <select
            aria-label="Filter by year"
            value={year ?? ""}
            onChange={(event) => setYearOverride({ value: event.target.value ? Number(event.target.value) : null })}
            className="motion-focus h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">All years</option>
            {ACADEMIC_YEARS.map((academicYear) => (
              <option key={academicYear.value} value={academicYear.value}>{academicYear.label}</option>
            ))}
          </select>
        </label>
      </div>

      {filteredSubjects.length === 0 ? (
        <EmptyState
          title="No subjects match this filter"
          message="Clear the branch and year filters to see everything, or upload notes for a class your batch needs."
          icon={BookOpen}
          action={
            <>
              <button onClick={clearFilters} className="motion-hover motion-active rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-hover">
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
            const design = resolveSubjectDesign(sub);
            const count = subjectCounts[sub.name.toUpperCase()] || 0;

            return (
              <ScrollReveal key={sub.slug} layout className={`flex w-full ${spanClass(design.span)}`} transition={{ duration: 0.42, delay: Math.min(index * 0.045, 0.3), ease: [0.32, 0.72, 0, 1] }}>
                <SubjectCard
                  name={sub.name}
                  count={count}
                  design={design}
                  href={`/subject/${sub.slug}`}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  ref={(el) => { if (el) elementsRef.current[index] = el; }}
                />
              </ScrollReveal>
            );
          })}
        </CardGrid>
      )}
    </>
  );
}
