"use client";

import { useState, useEffect, useRef } from "react";
import { ScrollReveal } from "@/components/ui/Motion";
import { Subject, Branch, subjectMatchesFilter } from "@/app/lib/api/subjects";
import { ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { resolveSubjectDesign, spanClass } from "@/app/lib/subject-design";
import SubjectCard from "@/components/subject/SubjectCard";
import { CardGrid, EmptyState } from "@/components/layout/SharedLayouts";
import { BookOpen, Upload, Filter, X } from "lucide-react";
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
      <div className="mb-6 flex h-10 min-w-0 items-center gap-2 overflow-x-auto hide-scrollbar">
        <Filter size={15} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="shrink-0 text-xs font-bold text-muted">Branch</span>
        <button
          type="button"
          onClick={() => setBranchOverride({ value: null })}
          aria-pressed={branchId === null}
          className={`motion-hover motion-active shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${branchId === null ? "bg-primary text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}
        >
          All branches
        </button>
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => setBranchOverride({ value: branch.id })}
            aria-pressed={branchId === branch.id}
            className={`motion-hover motion-active shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${branchId === branch.id ? "bg-primary text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}
          >
            {branch.code}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <span className="shrink-0 text-xs font-bold text-muted">Year</span>
        <button
          type="button"
          onClick={() => setYearOverride({ value: null })}
          aria-pressed={year === null}
          className={`motion-hover motion-active shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${year === null ? "bg-primary text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}
        >
          All years
        </button>
        {ACADEMIC_YEARS.map((academicYear) => (
          <button
            key={academicYear.value}
            type="button"
            onClick={() => setYearOverride({ value: academicYear.value })}
            aria-pressed={year === academicYear.value}
            className={`motion-hover motion-active shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${year === academicYear.value ? "bg-primary text-white" : "bg-surface-hover text-muted hover:text-foreground"}`}
          >
            {academicYear.label}
          </button>
        ))}
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
