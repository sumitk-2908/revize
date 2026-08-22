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

/**
 * Link to a document: /subject/<subject>/module-<n>/<title-slug>
 *
 * Prefers the stored `slug` so the href is byte-identical to what the resolver
 * matches on, and falls back to slugifying the title for callers that selected
 * a narrower column set. Documents whose title slugifies to nothing keep their
 * numeric id, which the route still resolves.
 */
export const documentHref = (doc: SearchDocument) => {
  const segment = doc.slug || documentSlug(doc.title) || String(doc.id);
  const subject = doc.subject ? subjectSlug(doc.subject) : "unknown";
  return `/subject/${subject}/module-${doc.module_id || 1}/${segment}`;
};
