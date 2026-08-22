-- Human-readable document URLs.
--
-- Documents used to be addressed by their numeric id:
--   /subject/<subject>/module-<n>/482
-- They are now addressed by a slug derived from the title the uploader gave:
--   /subject/<subject>/module-<n>/unit-3-deadlock-notes
--
-- The slug is a STORED generated column so it can never drift from the title
-- and so the lookup is a single indexed equality check. The expression is
-- inlined rather than wrapped in a helper function because generated columns
-- must reference only built-in immutable functions to survive a dump/restore.
--
-- NULLIF guards the degenerate case of a title with no alphanumeric characters
-- at all ("###"), which would otherwise slugify to an empty string and produce
-- an unroutable URL. Callers fall back to the numeric id when slug IS NULL.

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS slug text GENERATED ALWAYS AS (
  NULLIF(btrim(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '-'), '')
) STORED;

-- Titles carry no uniqueness constraint, so the resolver reads every row that
-- matches the slug and then narrows by subject + module. This index keeps that
-- read to the handful of rows that actually share a title.
CREATE INDEX IF NOT EXISTS idx_documents_slug ON public.documents (slug);

-- Covers the common case where the module is known from the URL.
CREATE INDEX IF NOT EXISTS idx_documents_module_slug ON public.documents (module_id, slug);
