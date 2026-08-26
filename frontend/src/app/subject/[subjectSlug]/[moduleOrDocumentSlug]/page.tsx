import { getCachedSubjectBySlug } from "@/app/lib/api/cached-subjects";
import { normalizeSubjectTitle, normalizeTitle } from "@/app/lib/subject-config";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import DocumentInteractiveGrid from "@/components/subject/DocumentInteractiveGrid";
import FilterSortControls from "@/components/subject/FilterSortControls";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getPaginatedDocumentsByModule } from "@/app/lib/api/documents";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { Metadata } from "next";
import DocumentView, { documentMetadata } from "../document-view";

/**
 * Two kinds of URL land on this segment, because Next.js allows only one dynamic
 * folder per level:
 *
 *   /subject/<subject>/module-3      → the module's document listing
 *   /subject/<subject>/<title-slug>  → a document with no module (a `syllabus`
 *                                      upload, or any document in a subject
 *                                      flagged `is_non_module`)
 *
 * A `module-<n>` segment always wins, so a document actually titled "Module 3"
 * is only reachable through its `/module-<n>/` URL.
 */
const MODULE_SEGMENT = /^module-\d+$/;

type RouteParams = { subjectSlug: string; moduleOrDocumentSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { subjectSlug, moduleOrDocumentSlug } = await params;

  if (!MODULE_SEGMENT.test(moduleOrDocumentSlug)) {
    return documentMetadata(subjectSlug, null, moduleOrDocumentSlug);
  }

  const subjectName = normalizeTitle(subjectSlug.replace(/-/g, " "));
  const moduleNumber = parseInt(moduleOrDocumentSlug.replace("module-", "")) || 1;

  return {
    title: `Module ${moduleNumber} - ${subjectName}`,
    description: `Study materials and documents for Module ${moduleNumber} of ${subjectName}.`,
  };
}

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { subjectSlug, moduleOrDocumentSlug } = await params;

  if (!MODULE_SEGMENT.test(moduleOrDocumentSlug)) {
    return (
      <DocumentView
        subjectSegment={subjectSlug}
        moduleSlug={null}
        docSegment={moduleOrDocumentSlug}
      />
    );
  }

  const { category, sort } = await searchParams;

  const categoryStr = typeof category === "string" ? category : "all";
  const sortStr = typeof sort === "string" ? sort : "created_at";

  const subjectQueryName = subjectSlug.replace(/-/g, " ").toUpperCase();
  const moduleNumber = parseInt(moduleOrDocumentSlug.replace("module-", "")) || 1;

  const dbSubject = await getCachedSubjectBySlug(subjectSlug).catch(() => null);

  const subjectDisplayName = normalizeSubjectTitle(dbSubject?.name || subjectQueryName);

  const { data: documents, total: count } = await getPaginatedDocumentsByModule(
    moduleNumber,
    1,
    20,
    categoryStr,
    sortStr,
    subjectQueryName
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3 sm:space-y-6">
      <Breadcrumb />

      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/subject/${subjectSlug}`}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-primary"
          >
            <ArrowLeft size={14} /> Back to {subjectDisplayName}
          </Link>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Module {moduleNumber}
          </p>
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-3xl">
            {subjectDisplayName} resources
          </h1>
        </div>
        <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-bold text-muted">
          <FileText size={15} className="text-primary" aria-hidden="true" />
          <span>{count || 0} document{count === 1 ? "" : "s"}</span>
        </div>
      </header>

      <ErrorBoundary
        title="Document grid could not load"
        message="The module resources hit an unexpected problem. You can retry this grid or keep browsing other sections."
      >
        <FilterSortControls />
        <DocumentInteractiveGrid
          initialDocuments={documents || []}
          subjectSlug={subjectSlug}
          paginationConfig={{
            queryKey: ["module-docs", moduleNumber.toString(), categoryStr, sortStr, subjectQueryName],
            moduleId: moduleNumber,
            category: categoryStr,
            sortBy: sortStr,
            subjectName: subjectQueryName
          }}
        />
      </ErrorBoundary>
    </div>
  );
}
