import { cache } from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { supabase } from "@/app/lib/api/core";
import { subjectSlug } from "@/components/layout/utils";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { CommentSection } from "@/components/comments/CommentSection";
// Standard import of the wrapper component
import PDFViewerWrapper from "@/components/pdf/PDFViewerWrapper";

type RouteParams = { subjectSlug: string; moduleSlug: string; documentSlug: string };

const DOCUMENT_SELECT = "*, document_analytics(upvotes, view_count, download_count)";

/**
 * Resolve the last URL segment to a document.
 *
 * The segment is the slugified title the uploader gave the document. Titles
 * carry no uniqueness constraint, so a slug can match more than one row; the
 * subject and module already in the URL narrow it down, and the lowest id wins
 * after that so a given URL always lands on the same document.
 *
 * Numeric segments are the pre-slug URL format and still resolve, so existing
 * bookmarks, shared links, and indexed pages keep working.
 *
 * cache() dedupes the read between generateMetadata and the page component.
 */
const resolveDocument = cache(async ({ subjectSlug: subject, moduleSlug, documentSlug }: RouteParams) => {
  const segment = decodeURIComponent(documentSlug).toLowerCase();

  if (/^\d+$/.test(segment)) {
    const { data } = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("id", parseInt(segment, 10))
      .maybeSingle();

    return { doc: data ?? null, isLegacyIdUrl: true };
  }

  const { data: matches } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("slug", segment)
    .order("id", { ascending: true });

  if (!matches || matches.length === 0) return { doc: null, isLegacyIdUrl: false };

  const moduleNumber = parseInt(moduleSlug.replace("module-", ""), 10);
  const scoped = matches.filter(
    (d) =>
      subjectSlug(d.subject ?? "") === subject.toLowerCase() &&
      (Number.isNaN(moduleNumber) || (d.module_id ?? 1) === moduleNumber),
  );

  return { doc: scoped[0] ?? matches[0], isLegacyIdUrl: false };
});

// Generate dynamic SEO tags for Google/Social Previews
export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const resolved = await params;
  const { doc } = await resolveDocument(resolved);

  if (!doc) return { title: "Document Not Found" };

  const subjectName = resolved.subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const canonicalPath = `/subject/${resolved.subjectSlug}/${resolved.moduleSlug}/${doc.slug || doc.id}`;

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

// Server Component
export default async function PDFViewerPage({ params }: { params: Promise<RouteParams> }) {
  const resolved = await params;
  const { doc: documentMeta, isLegacyIdUrl } = await resolveDocument(resolved);

  if (!documentMeta) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
        <p className="text-sm font-bold text-muted">
          Document not found or has been removed.
        </p>
      </div>
    );
  }

  // Send old numeric-id links to the title URL. The subject and module segments
  // are carried over verbatim rather than rebuilt, because a subject's canonical
  // slug lives in the subjects table and may not match slugifying its name.
  if (isLegacyIdUrl && documentMeta.slug) {
    redirect(`/subject/${resolved.subjectSlug}/${resolved.moduleSlug}/${documentMeta.slug}`);
  }

  // Use the wrapper to render the client logic
  return (
    <div className="mx-auto flex max-w-[90rem] flex-col space-y-4">
      <Breadcrumb />
      <div className="flex flex-col gap-6">
        <div className="w-full min-w-0">
          <PDFViewerWrapper documentMeta={documentMeta} />
        </div>
        <div className="w-full shrink-0">
          <CommentSection documentId={documentMeta.id} />
        </div>
      </div>
    </div>
  );
}
