-- Prevent large extracted PDF text from making documents.content_tsv exceed
-- PostgreSQL's ~1 MB tsvector limit during INSERT/UPDATE.
--
-- A PDF's compressed file size is unrelated to the size of its extracted text,
-- so even a sub-500 KB document can produce a very large text layer. Keep the
-- complete (bounded) content_text value for reading/AI, but index only the first
-- 200,000 characters. This also makes updates to older/backfilled rows safe.

DROP INDEX IF EXISTS public.documents_content_tsv_idx;

ALTER TABLE public.documents
  DROP COLUMN IF EXISTS content_tsv;

ALTER TABLE public.documents
  ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english'::regconfig,
      left(coalesce(content_text, ''::text), 200000)
    )
  ) STORED;

CREATE INDEX documents_content_tsv_idx
  ON public.documents USING gin (content_tsv);
