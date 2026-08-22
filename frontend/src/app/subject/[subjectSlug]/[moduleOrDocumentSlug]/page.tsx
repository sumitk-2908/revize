import { getCachedSubjectBySlug } from "@/app/lib/api/cached-subjects";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DocumentInteractiveGrid from "@/components/subject/DocumentInteractiveGrid";
import FilterSortControls from "@/components/subject/FilterSortControls";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { getPaginatedDocumentsByModule } from "@/app/lib/api/documents";
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

  const subjectName = subjectSlug.replace(/-/g, " ").toUpperCase();
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

  const subjectName = subjectSlug.replace(/-/g, " ").toUpperCase();
  const moduleNumber = parseInt(moduleOrDocumentSlug.replace("module-", "")) || 1;

  const dbSubject = await getCachedSubjectBySlug(subjectSlug).catch(() => null);

  const subjectDisplayName = dbSubject?.name || subjectName;

  const { data: documents, total: count } = await getPaginatedDocumentsByModule(
    moduleNumber,
    1,
    20,
    categoryStr,
    sortStr,
    subjectName
  );

  return (
    <div className="animate-fade-up mx-auto max-w-6xl space-y-6">
      <Link
        href={`/subject/${subjectSlug}`}
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary"
      >
        <ArrowLeft size={14} /> Back to {subjectDisplayName}
      </Link>

      <div className="border-b pb-4">
        <h1 className="text-xl font-extrabold sm:text-2xl">
          {subjectDisplayName}
        </h1>

        <p className="mt-1 text-xs font-bold text-primary">
          Module {moduleNumber} Repository ({count || 0} items)
        </p>
      </div>

      <ErrorBoundary
        title="Document grid could not load"
        message="The module resources hit an unexpected problem. You can retry this grid or keep browsing other sections."
      >
        <FilterSortControls />
        <DocumentInteractiveGrid
          initialDocuments={documents || []}
          subjectSlug={subjectSlug}
          paginationConfig={{
            queryKey: ["module-docs", moduleNumber.toString(), categoryStr, sortStr, subjectName],
            moduleId: moduleNumber,
            category: categoryStr,
            sortBy: sortStr,
            subjectName: subjectName
          }}
        />
      </ErrorBoundary>
    </div>
  );
}
