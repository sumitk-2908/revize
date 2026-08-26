-- Per-student progress through a document's flashcards and quiz.
--
-- Lives on study_history for the same reason reading progress does
-- (20260822000700_reading_progress.sql): this is per-user, per-document study
-- state, the table is already UNIQUE (user_id, document_id), a row already
-- exists for every document a student opens, and the owner-only policies from
-- the initial schema already cover a new column — SELECT, INSERT and UPDATE are
-- each gated on auth.uid() = user_id, so no new policy is needed and no student
-- can read or write another student's ratings. Table-level GRANT ALL likewise
-- extends to new columns, so no new grant is needed either.
--
-- One jsonb column rather than a column per artifact: the shape is a UI detail
-- (which card was rated, which option was picked) that no SQL reads, filters or
-- aggregates, and flashcards and quizzes would otherwise want another column
-- each every time the study panel grows a feature.
--
-- Shape:
--   {
--     "flashcards": { "version": 3, "ratings": { "0": "easy", "2": "hard" } },
--     "quiz":       { "version": 2, "answers": { "0": 1, "1": 3 } }
--   }
--
-- `version` is the document_ai_content.version the progress was recorded
-- against. Position in the payload array is the only identity a card or question
-- has, so ratings recorded against v2 say nothing about v3's cards once an admin
-- publishes a regenerated set. The client compares the two and discards a
-- mismatch rather than showing a rating against a card the student never saw.
ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS study_progress jsonb;

ALTER TABLE public.study_history
  DROP CONSTRAINT IF EXISTS study_history_study_progress_check;

-- An object, not an array or a bare scalar. Keeps one malformed client write
-- from forcing every later read to be defensive about the top-level type.
ALTER TABLE public.study_history
  ADD CONSTRAINT study_history_study_progress_check
  CHECK (study_progress IS NULL OR jsonb_typeof(study_progress) = 'object');
