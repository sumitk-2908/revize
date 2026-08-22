-- Reading progress is kept on the existing per-user, per-document history row.
-- NULL means the document was opened before page tracking was introduced.
ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS last_page integer;

ALTER TABLE public.study_history
  DROP CONSTRAINT IF EXISTS study_history_last_page_check;

ALTER TABLE public.study_history
  ADD CONSTRAINT study_history_last_page_check
  CHECK (last_page IS NULL OR last_page >= 1);
