export const subjectSlug = (subject: string) => subject.toLowerCase().replace(/ /g, "-");

/**
 * Slugify a document title for use as its URL segment.
 *
 * Must stay in lockstep with the `documents.slug` generated column
 * (see supabase/migrations/20260822000000_document_title_slug.sql):
 *   NULLIF(btrim(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '-'), '')
 *
 * Returns an empty string for a title with no alphanumeric characters, which
 * matches the column's NULL and tells callers to fall back to the numeric id.
 */
export const documentSlug = (title?: string | null) =>
  (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type SearchDocument = {
  id: string | number;
  title: string;
  subject?: string | null;
  module_id?: number | null;
  category?: string | null;
  /** Present whenever the row was selected with `*`; preferred over re-slugifying. */
  slug?: string | null;
};

/** The columns a document URL is built from. `subject` is supplied separately. */
type DocumentUrlParts = Pick<SearchDocument, "id" | "module_id" | "category" | "slug"> & {
  title?: string | null;
};

/**
 * Whether a document's URL omits the `module-<n>` segment.
 *
 * Uploads store NULL in `module_id` for exactly two cases — a `syllabus`
 * document, and any document in a subject flagged `is_non_module` (see
 * `UploadContext`) — so a null module is the database's own record of "this
 * resource does not belong to a module". `category` is checked as well so rows
 * that predate that rule, and callers that selected `category` but not
 * `module_id`, still resolve to the short URL.
 */
export const isModulelessDocument = (doc: Pick<SearchDocument, "module_id" | "category">) =>
  doc.module_id == null || doc.category === "syllabus";

/**
 * The document's own URL segment.
 *
 * Prefers the stored `slug` so the href is byte-identical to what the route
 * resolver matches on, and falls back to slugifying the title for callers that
 * selected a narrower column set. Documents whose title slugifies to nothing
 * keep their numeric id, which the route still resolves.
 */
const documentSegment = (doc: DocumentUrlParts) =>
  doc.slug || documentSlug(doc.title) || String(doc.id);

/**
 * Path to a document under a subject segment the caller already knows.
 *
 * Module-less documents live one level up, directly under the subject:
 *   /subject/<subject>/<title-slug>            (syllabus, non-module subjects)
 *   /subject/<subject>/module-<n>/<title-slug> (everything else)
 *
 * Prefer this over `documentHref` wherever the real subject slug is in hand —
 * a subject's canonical slug lives in the `subjects` table and does not always
 * match slugifying its name. The document route redirects to whichever of the
 * two forms this returns, so a link built from a partial row self-corrects.
 */
export const documentPath = (subjectSegment: string, doc: DocumentUrlParts) =>
  isModulelessDocument(doc)
    ? `/subject/${subjectSegment}/${documentSegment(doc)}`
    : `/subject/${subjectSegment}/module-${doc.module_id}/${documentSegment(doc)}`;

/** `documentPath` for callers that only have the subject's display name. */
export const documentHref = (doc: SearchDocument) =>
  documentPath(doc.subject ? subjectSlug(doc.subject) : "unknown", doc);
