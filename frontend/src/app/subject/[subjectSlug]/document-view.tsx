import { cache } from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { supabase } from "@/app/lib/api/core";
import { subjectSlug as slugifySubject, documentPath, isModulelessDocument } from "@/components/layout/utils";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { CommentSection } from "@/components/comments/CommentSection";
import AiStudyTools from "@/components/subject/AiStudyTools";
// Standard import of the wrapper component
import PDFViewerWrapper from "@/components/pdf/PDFViewerWrapper";

/**
 * The document page, shared by the two URL shapes that can address a document:
 *
 *   /subject/<subject>/module-<n>/<title-slug>  → [moduleOrDocumentSlug]/[documentSlug]
 *   /subject/<subject>/<title-slug>             → [moduleOrDocumentSlug]
 *
 * The second form is the canonical one for documents with no module — a
 * `syllabus` upload, or anything in a subject flagged `is_non_module`. Both
 * routes render this component and it redirects to whichever form
 * `documentPath` considers canonical, so old `/module-1/` links keep working.
 */

const DOCUMENT_SELECT =
  "*, document_analytics(upvotes, view_count, download_count), document_ai_content(kind, payload, version, status)";

/** The module a URL segment addresses, or null when the URL carries no module. */
const moduleNumberOf = (moduleSlug: string | null) => {
  if (!moduleSlug) return null;
  const parsed = parseInt(moduleSlug.replace("module-", ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Resolve the last URL segment to a document.
 *
 * The segment is the slugified title the uploader gave the document. Titles
 * carry no uniqueness constraint, so a slug can match more than one row; the
 * subject already in the URL narrows it down, then the module segment (or its
 * absence) narrows it further, and the lowest id wins after that so a given URL
 * always lands on the same document. Each narrowing step falls back to the
 * wider set rather than 404ing, so a link built from a partial row still
 * resolves and gets redirected to the canonical URL.
 *
 * Numeric segments are the pre-slug URL format and still resolve, so existing
 * bookmarks, shared links, and indexed pages keep working.
 *
 * Takes primitives rather than the params object so cache() actually dedupes
 * the read between generateMetadata and the page component.
 */
export const resolveDocument = cache(
  async (subjectSegment: string, moduleSlug: string | null, docSegment: string) => {
    const segment = decodeURIComponent(docSegment).toLowerCase();

    if (/^\d+$/.test(segment)) {
      const { data } = await supabase
        .from("documents")
        .select(DOCUMENT_SELECT)
        .eq("id", parseInt(segment, 10))
        .maybeSingle();

      return data ?? null;
    }

    const { data: matches } = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("slug", segment)
      .order("id", { ascending: true });

    if (!matches || matches.length === 0) return null;

    const inSubject = matches.filter(
      (d) => slugifySubject(d.subject ?? "") === subjectSegment.toLowerCase(),
    );
    const candidates = inSubject.length > 0 ? inSubject : matches;

    const moduleNumber = moduleNumberOf(moduleSlug);
    // A module URL narrows to that module, treating a module-less document as
    // module 1 the way the old link builder did. The module-less URL instead
    // prefers the documents that canonically live there.
    const preferred =
      moduleNumber === null
        ? candidates.filter(isModulelessDocument)
        : candidates.filter((d) => (d.module_id ?? 1) === moduleNumber);

    return preferred[0] ?? candidates[0];
  },
);

/** Dynamic SEO tags for Google/social previews, shared by both routes. */
export async function documentMetadata(
  subjectSegment: string,
  moduleSlug: string | null,
  docSegment: string,
): Promise<Metadata> {
  const doc = await resolveDocument(subjectSegment, moduleSlug, docSegment);

  if (!doc) return { title: "Document Not Found" };

  const subjectName = subjectSegment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const canonicalPath = documentPath(subjectSegment, doc);

  return {
    title: `${doc.title} - ${subjectName}`,
    description: `Download or view ${doc.category} uploaded by ${doc.uploader_name || "a student"}.`,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: doc.title,
      description: `View this document for ${subjectName}.`,
      type: "article",
      url: canonicalPath,
      images: [{ url: "/icon-512x512.png" }],
    },
    twitter: {
      title: doc.title,
      description: `View this document for ${subjectName}.`,
    },
  };
}

export default async function DocumentView({
  subjectSegment,
  moduleSlug,
  docSegment,
}: {
  subjectSegment: string;
  /** The `module-<n>` segment, or null for the module-less URL. */
  moduleSlug: string | null;
  docSegment: string;
}) {
  const documentMeta = await resolveDocument(subjectSegment, moduleSlug, docSegment);

  if (!documentMeta) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
        <p className="text-sm font-bold text-muted">
          Document not found or has been removed.
        </p>
      </div>
    );
  }

  // Send every other spelling of this document's URL to the canonical one: old
  // numeric-id links, a `/module-<n>/` link to a document that has no module,
  // and a module-less link to one that does. The subject segment is carried
  // over verbatim rather than rebuilt, because a subject's canonical slug lives
  // in the subjects table and may not match slugifying its name.
  const canonicalPath = documentPath(subjectSegment, documentMeta);
  const currentPath = moduleSlug
    ? `/subject/${subjectSegment}/${moduleSlug}/${docSegment}`
    : `/subject/${subjectSegment}/${docSegment}`;

  if (currentPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  const summaryContent = documentMeta.document_ai_content?.find(
    (content) => content.kind === "summary" && content.status === "published",
  );
  const summaryPayload =
    summaryContent?.payload && typeof summaryContent.payload === "object" && !Array.isArray(summaryContent.payload)
      ? summaryContent.payload as { summary?: unknown; key_points?: unknown }
      : null;
  const summaryText = typeof summaryPayload?.summary === "string" ? summaryPayload.summary : "";
  const keyPoints = Array.isArray(summaryPayload?.key_points)
    ? summaryPayload.key_points.filter((point): point is string => typeof point === "string")
    : [];
  // Handed to AiStudyTools rather than rendered here, so the text still arrives
  // in the server-rendered HTML (and stays indexable) while the student reveals
  // it with the Generate button.
  const summary =
    summaryContent && (summaryText || keyPoints.length > 0)
      ? { text: summaryText, keyPoints }
      : null;

  // Use the wrapper to render the client logic
  return (
    <div className="mx-auto flex max-w-[90rem] flex-col space-y-4">
      <Breadcrumb />
      <div className="flex flex-col gap-6">
        <div className="w-full min-w-0">
          <PDFViewerWrapper documentMeta={documentMeta} />
        </div>
        <AiStudyTools documentId={documentMeta.id} summary={summary} />
        <div className="w-full shrink-0">
          <CommentSection documentId={documentMeta.id} />
        </div>
      </div>
    </div>
  );
}
