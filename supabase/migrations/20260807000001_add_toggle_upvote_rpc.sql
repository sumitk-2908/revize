-- Adds the `toggle_upvote` RPC that the frontend has always called but which
-- was never created in a migration (PGRST202: function not found in schema cache).
--
-- Also repairs two latent bugs that would have broken upvoting even once the
-- RPC existed:
--   1. prevent_self_rating() compared `documents.uploaded_by = NEW.user_id::text`.
--      20260718000001_uploaded_by_uuid.sql changed uploaded_by from text to uuid,
--      and Postgres has no `uuid = text` operator, so the BEFORE INSERT trigger
--      raised "operator does not exist: uuid = text" on every rating.
--   2. update_document_rating_counts() issued a bare UPDATE against
--      document_analytics. Rows there are created lazily by increment_doc_stat,
--      so upvoting a document nobody had opened yet updated zero rows and the
--      count silently stayed at 0.

-- 1. Compare uuid to uuid, and use a real SQLSTATE so clients can detect it.
CREATE OR REPLACE FUNCTION public.prevent_self_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1 FROM documents
        WHERE id = NEW.document_id
          AND uploaded_by IS NOT NULL
          AND uploaded_by = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'You cannot rate your own document.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Upsert the analytics row instead of assuming it exists, and clamp at zero
--    so a double-fire can never drive a count negative.
CREATE OR REPLACE FUNCTION public.update_document_rating_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO document_analytics (document_id, upvotes, downvotes)
    VALUES (
      NEW.document_id,
      CASE WHEN NEW.is_useful THEN 1 ELSE 0 END,
      CASE WHEN NEW.is_useful THEN 0 ELSE 1 END
    )
    ON CONFLICT (document_id) DO UPDATE SET
      upvotes   = COALESCE(document_analytics.upvotes, 0)
                  + CASE WHEN NEW.is_useful THEN 1 ELSE 0 END,
      downvotes = COALESCE(document_analytics.downvotes, 0)
                  + CASE WHEN NEW.is_useful THEN 0 ELSE 1 END;

  ELSIF TG_OP = 'UPDATE' AND OLD.is_useful IS DISTINCT FROM NEW.is_useful THEN
    INSERT INTO document_analytics (document_id, upvotes, downvotes)
    VALUES (
      NEW.document_id,
      CASE WHEN NEW.is_useful THEN 1 ELSE 0 END,
      CASE WHEN NEW.is_useful THEN 0 ELSE 1 END
    )
    ON CONFLICT (document_id) DO UPDATE SET
      upvotes   = GREATEST(COALESCE(document_analytics.upvotes, 0)
                  + CASE WHEN NEW.is_useful THEN 1 ELSE -1 END, 0),
      downvotes = GREATEST(COALESCE(document_analytics.downvotes, 0)
                  + CASE WHEN NEW.is_useful THEN -1 ELSE 1 END, 0);

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE document_analytics SET
      upvotes   = GREATEST(COALESCE(upvotes, 0)
                  - CASE WHEN OLD.is_useful THEN 1 ELSE 0 END, 0),
      downvotes = GREATEST(COALESCE(downvotes, 0)
                  - CASE WHEN OLD.is_useful THEN 0 ELSE 1 END, 0)
    WHERE document_id = OLD.document_id;
  END IF;

  RETURN NULL;
END;
$function$;

-- 3. The RPC itself. Returns true when the document is now upvoted by this
--    user, false when the upvote was withdrawn -- matching the `Returns: boolean`
--    contract already declared in frontend/src/app/lib/database.types.ts.
--
--    SECURITY DEFINER is required because document_ratings RLS is scoped to
--    auth.uid() and the counter trigger writes to document_analytics, which
--    users cannot write directly. Because RLS is bypassed, the function
--    verifies p_user_id against auth.uid() itself -- otherwise any signed-in
--    user could vote as somebody else.
CREATE OR REPLACE FUNCTION public.toggle_upvote(p_document_id integer, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_is_useful boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to upvote.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You cannot vote on behalf of another user.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_useful INTO v_is_useful
  FROM document_ratings
  WHERE document_id = p_document_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO document_ratings (document_id, user_id, is_useful)
    VALUES (p_document_id, p_user_id, true);
    RETURN true;
  ELSIF v_is_useful THEN
    -- Already upvoted: withdraw it.
    DELETE FROM document_ratings
    WHERE document_id = p_document_id AND user_id = p_user_id;
    RETURN false;
  ELSE
    -- Previously downvoted: flip to an upvote.
    UPDATE document_ratings SET is_useful = true
    WHERE document_id = p_document_id AND user_id = p_user_id;
    RETURN true;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.toggle_upvote(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_upvote(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_upvote(integer, uuid) TO service_role;
