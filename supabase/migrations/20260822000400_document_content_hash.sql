-- Duplicate detection is intentionally advisory rather than a unique constraint:
-- identical bytes may legitimately be catalogued under different subjects.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_sha256 text;

CREATE INDEX IF NOT EXISTS documents_file_sha256_idx
  ON public.documents (file_sha256)
  WHERE file_sha256 IS NOT NULL;
