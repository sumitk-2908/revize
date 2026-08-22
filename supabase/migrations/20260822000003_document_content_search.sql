-- Full-text search over extracted document content.
-- Existing metadata search remains in `documents.fts`; this is additive.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_text text;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, coalesce(content_text, ''::text))
  ) STORED;

CREATE INDEX IF NOT EXISTS documents_content_tsv_idx
  ON public.documents USING gin (content_tsv);

GRANT SELECT ON public.documents TO anon, authenticated, service_role;
