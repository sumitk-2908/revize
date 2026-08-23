-- AI study content: summaries, flashcards, and quizzes, curated before students
-- see them (features #15 and #23 in plans/feature-implementation-plan.md).
--
-- Supersedes two earlier drafts of this idea, neither of which was ever applied:
-- `documents.ai_summary`/`ai_key_points`/`ai_generated_at`/`ai_model` columns, and
-- a `document_study_sets` cache table. Both auto-published model output straight
-- to students, and the columns version could be pre-filled by a student: RLS
-- policy "Student Insert Pending" lets them PostgREST-insert their own pending
-- document, and a column-level REVOKE does not subtract from a table-level INSERT
-- grant in PostgreSQL. This table closes that by construction — there is no
-- client write path at all, and nothing reaches a student until an admin
-- publishes it.
--
-- One row per (document, kind, version) rather than one JSON package per
-- document, so regenerating a quiz does not force re-reviewing the summary and a
-- student reading the summary does not download the quiz answer key.

CREATE TABLE public.document_ai_content (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id integer NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('summary', 'flashcards', 'quiz')),
    version     integer NOT NULL DEFAULT 1,
    payload     jsonb NOT NULL,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

    -- 'generated' is a Groq draft via app.llm; 'manual' is JSON an admin pasted
    -- from ChatGPT or Gemini. The manual path exists because it clears three
    -- limits no amount of tuning fixes: the 200K tokens/day free tier shared by
    -- the whole organisation, the 20,000-character input clip that the
    -- 8K-tokens-per-minute allowance forces, and Tesseract's measured 37.9
    -- confidence on handwritten notes (a multimodal model reads the scan itself).
    source      text NOT NULL CHECK (source IN ('manual', 'generated')),
    model       text,

    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    published_at timestamptz,

    CONSTRAINT document_ai_content_version_key UNIQUE (document_id, kind, version)
);

-- Full version history, but exactly one live row per artifact. Enforced here so
-- a buggy publish path cannot produce two.
CREATE UNIQUE INDEX document_ai_content_one_published_idx
    ON public.document_ai_content (document_id, kind)
    WHERE status = 'published';

ALTER TABLE public.document_ai_content ENABLE ROW LEVEL SECURITY;

-- Both read policies require status = 'published', so drafts are invisible to
-- every client and the document page's embed needs no filter of its own. Two
-- policies rather than one, because the artifacts differ in sensitivity.

-- The summary is derived from an already-public approved PDF. Being anon-readable
-- is what lets it ride the existing server-component SELECT on documents (which
-- runs the session-less client) and reach the SSR'd HTML, so it is cached by the
-- service worker's `pages` strategy and indexable.
CREATE POLICY "Anyone can read published summaries for approved documents"
ON public.document_ai_content FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND kind = 'summary'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_ai_content.document_id
      AND d.status = 'approved'
  )
);

-- Flashcards and quizzes carry answer keys, so they are signed-in only — the
-- rule the superseded document_study_sets migration also chose.
CREATE POLICY "Signed-in users can read published study sets"
ON public.document_ai_content FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND kind IN ('flashcards', 'quiz')
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_ai_content.document_id
      AND d.status = 'approved'
  )
);

-- No client write policy and no admin read policy on purpose. Admins read drafts
-- through the backend's service-role client, which bypasses RLS, matching every
-- other privileged path in this repo. The REVOKE states the no-client-writes
-- intent explicitly and survives a policy being added carelessly later.
GRANT SELECT ON public.document_ai_content TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.document_ai_content TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.document_ai_content FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- Atomic publish
-- ---------------------------------------------------------------------------
-- document_ai_content_one_published_idx means archive-then-promote has to be one
-- transaction, so it lives in a function rather than two PostgREST calls.
--
-- Authorization stays in the backend's verify_admin (admins row plus AAL2 TOTP):
-- every caller here is the service-role key, so an internal auth.uid() check
-- would be NULL and reject the only legitimate caller. EXECUTE is granted to
-- service_role alone, so there is no other caller to guard against.
CREATE OR REPLACE FUNCTION public.publish_ai_content(
    p_document_id integer,
    p_kind text,
    p_version integer,
    p_admin_id uuid
)
RETURNS public.document_ai_content
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.document_ai_content;
BEGIN
    -- Already live: hand it back untouched. Archiving and re-promoting the same
    -- row would move published_at for a no-op, and matching it as "archived"
    -- below would make the error message for a genuine miss dishonest.
    SELECT * INTO v_row
      FROM public.document_ai_content
     WHERE document_id = p_document_id
       AND kind = p_kind
       AND version = p_version
       AND status = 'published';

    IF FOUND THEN
        RETURN v_row;
    END IF;

    UPDATE public.document_ai_content
       SET status = 'archived'
     WHERE document_id = p_document_id
       AND kind = p_kind
       AND status = 'published';

    -- 'archived' as well as 'draft' so rollback — re-publishing a superseded
    -- version — goes through this same path and the same one-live-row guarantee.
    UPDATE public.document_ai_content
       SET status = 'published',
           published_at = timezone('utc', now()),
           reviewed_by = p_admin_id
     WHERE document_id = p_document_id
       AND kind = p_kind
       AND version = p_version
       AND status IN ('draft', 'archived')
    RETURNING * INTO v_row;

    -- Raising here rolls back the archive above too, so a failed publish never
    -- leaves the document with nothing live.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No draft or archived version % of % for document %',
            p_version, p_kind, p_document_id;
    END IF;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
-- The CHECK from 20260718000000_admin_audit_log.sql lists only the four
-- moderation actions, so logging a publish would throw at runtime without this.
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN ('approve', 'reject', 'delete', 'dismiss_flags', 'ai_publish'));
