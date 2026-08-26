import { cache } from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { supabase } from "@/app/lib/api/core";
import { format } from "date-fns";
import { subjectSlug as slugifySubject, documentPath, isModulelessDocument } from "@/components/layout/utils";
import { normalizeTitle } from "@/app/lib/subject-config";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { CommentSection } from "@/components/comments/CommentSection";
import AiStudyTools from "@/components/subject/AiStudyTools";
// Standard import of the wrapper component
import PDFViewerWrapper from "@/components/pdf/PDFViewerWrapper";
import { FileText, HardDrive, UserRound, CalendarDays, Layers3 } from "lucide-react";

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

  const subjectName = normalizeTitle(subjectSegment.replace(/-/g, " "));
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
  const analytics = Array.isArray(documentMeta.document_analytics)
    ? documentMeta.document_analytics[0]
    : documentMeta.document_analytics;
  const uploadedDate = documentMeta.created_at
    ? format(new Date(documentMeta.created_at), "MMM d, yyyy")
    : null;
  const fileSize = typeof documentMeta.file_size === "number"
    ? `${(documentMeta.file_size / (1024 * 1024)).toFixed(1)} MB`
    : null;

  return (
    <div className="mx-auto max-w-[90rem] space-y-4">
      <Breadcrumb />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <PDFViewerWrapper documentMeta={documentMeta} />
          <AiStudyTools documentId={documentMeta.id} summary={summary} />
          <CommentSection documentId={documentMeta.id} />
        </div>

        <aside className="order-first lg:order-last lg:sticky lg:top-24" aria-label="Document metadata">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="line-clamp-3 text-base font-extrabold leading-snug text-foreground">{documentMeta.title}</h1>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">{normalizeTitle(documentMeta.category || "document")}</p>
              </div>
            </div>
            <dl className="space-y-4 border-t border-border pt-4 text-sm">
              {documentMeta.uploader_name && <div className="flex gap-3"><UserRound size={15} className="mt-0.5 shrink-0 text-muted" /><div><dt className="text-xs font-semibold text-muted">Uploaded by</dt><dd className="font-bold text-foreground">{documentMeta.uploader_name}</dd></div></div>}
              {uploadedDate && <div className="flex gap-3"><CalendarDays size={15} className="mt-0.5 shrink-0 text-muted" /><div><dt className="text-xs font-semibold text-muted">Added</dt><dd className="font-bold text-foreground">{uploadedDate}</dd></div></div>}
              {fileSize && <div className="flex gap-3"><HardDrive size={15} className="mt-0.5 shrink-0 text-muted" /><div><dt className="text-xs font-semibold text-muted">File size</dt><dd className="font-bold text-foreground">{fileSize}</dd></div></div>}
              {documentMeta.page_count && <div className="flex gap-3"><Layers3 size={15} className="mt-0.5 shrink-0 text-muted" /><div><dt className="text-xs font-semibold text-muted">Pages</dt><dd className="font-bold text-foreground">{documentMeta.page_count}</dd></div></div>}
            </dl>
            {analytics && <p className="mt-5 border-t border-border pt-4 text-xs font-semibold text-muted">{analytics.view_count || 0} views · {analytics.download_count || 0} downloads</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
