import { Metadata } from "next";
import DocumentView, { documentMetadata } from "../../document-view";

/**
 * A document inside a module: /subject/<subject>/module-<n>/<title-slug>
 *
 * Documents with no module are canonically one level up, at
 * /subject/<subject>/<title-slug>, and `DocumentView` redirects there.
 */
type RouteParams = { subjectSlug: string; moduleOrDocumentSlug: string; documentSlug: string };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { subjectSlug, moduleOrDocumentSlug, documentSlug } = await params;

  return documentMetadata(subjectSlug, moduleOrDocumentSlug, documentSlug);
}

export default async function PDFViewerPage({ params }: { params: Promise<RouteParams> }) {
  const { subjectSlug, moduleOrDocumentSlug, documentSlug } = await params;

  return (
    <DocumentView
      subjectSegment={subjectSlug}
      moduleSlug={moduleOrDocumentSlug}
      docSegment={documentSlug}
    />
  );
}
