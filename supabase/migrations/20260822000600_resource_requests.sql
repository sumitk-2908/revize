-- Resource requests: a "wanted notes" board.
--
-- Students post what they need; anyone can upvote so contributors can see which
-- gaps are worth filling. A request is closed out by an upload: the upload
-- carries the request id onto documents.fulfils_request_id, and the trigger at
-- the bottom of this file flips the request to 'fulfilled' the moment that
-- document is approved.
--
-- Why the fulfilment lives in a trigger rather than in the API: there are three
-- ways a document reaches 'approved' -- PATCH /{id}/status, PATCH /bulk-status,
-- and an admin upload that INSERTs straight to 'approved' -- and a row-level
-- trigger covers all three at once. 20260822000002_achievements_rework.sql was
-- written to fix exactly the bug of only handling the UPDATE paths, so this
-- trigger fires on INSERT as well.

-- ---------------------------------------------------------------------------
-- resource_requests
-- ---------------------------------------------------------------------------

CREATE TABLE public.resource_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Denormalised display name, exactly like documents.uploader_name. The
    -- profiles SELECT policy is own-row only (20260622160804_remote_schema.sql:345),
    -- so a board that joined profiles would render every requester except the
    -- viewer themselves as "Anonymous".
    requester_name TEXT,

    -- subject is the subject NAME, matching documents.subject (not a foreign key).
    subject TEXT NOT NULL,
    -- module_id is the module NUMBER (1..n), matching documents.module_id -- NOT
    -- modules.id. See the note in 20260807000000_add_module_counts_rpc.sql.
    -- NULL means "any module" / not module-scoped, as it does for documents.
    module_id INTEGER,
    category TEXT NOT NULL DEFAULT 'notes'
        CHECK (category IN ('notes', 'pyq', 'tutorial_sheet', 'syllabus')),

    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
    details TEXT CHECK (details IS NULL OR char_length(details) <= 500),

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'fulfilled', 'closed')),
    upvote_count INTEGER NOT NULL DEFAULT 0,

    fulfilled_document_id INTEGER,
    fulfilled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A fulfilled request always names the document that satisfied it. Combined
    -- with the column-level UPDATE grant below (which withholds
    -- fulfilled_document_id from clients), this makes a client-faked fulfilment
    -- impossible: setting status alone fails this check.
    CONSTRAINT resource_requests_fulfilled_needs_document
        CHECK (status <> 'fulfilled' OR fulfilled_document_id IS NOT NULL),

    -- Named explicitly because documents and resource_requests now reference each
    -- other in both directions; PostgREST embeds need the constraint name as a
    -- disambiguating hint.
    CONSTRAINT resource_requests_fulfilled_document_id_fkey
        FOREIGN KEY (fulfilled_document_id) REFERENCES public.documents(id) ON DELETE SET NULL
);

-- The board's default read: open requests, most wanted first.
CREATE INDEX resource_requests_board_idx
    ON public.resource_requests (status, upvote_count DESC, created_at DESC);
CREATE INDEX resource_requests_user_id_idx ON public.resource_requests (user_id);
CREATE INDEX resource_requests_subject_idx ON public.resource_requests (lower(subject));

-- Swallow double-submits without blocking two different students from asking for
-- the same thing (which is the signal the board exists to collect).
CREATE UNIQUE INDEX resource_requests_no_self_duplicate_idx
    ON public.resource_requests (user_id, lower(subject), category, lower(btrim(title)))
    WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- resource_request_upvotes
-- ---------------------------------------------------------------------------

CREATE TABLE public.resource_request_upvotes (
    request_id UUID NOT NULL REFERENCES public.resource_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, user_id)
);

-- "Which requests have I upvoted" filters on user_id, which is the PK's second
-- column and so cannot use the PK index.
CREATE INDEX resource_request_upvotes_user_id_idx ON public.resource_request_upvotes (user_id);

-- ---------------------------------------------------------------------------
-- Privileges
--
-- ALTER DEFAULT PRIVILEGES (20260622160804_remote_schema.sql:1-8) hands anon and
-- authenticated table-wide INSERT/UPDATE/DELETE on every new table in public, so
-- RLS alone would still let a requester POST {"upvote_count": 9999} or PATCH
-- their own row's counter. Narrow the writable columns instead: upvote_count and
-- the fulfilment triple are written only by the SECURITY DEFINER triggers below,
-- and anything else is a hard "permission denied for column" (SQLSTATE 42501).
--
-- SELECT stays table-wide -- PostgREST needs it to return rows -- and
-- service_role keeps full access for the backend.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE ON public.resource_requests FROM anon;
REVOKE INSERT, UPDATE ON public.resource_requests FROM authenticated;

GRANT INSERT (user_id, requester_name, subject, module_id, category, title, details)
    ON public.resource_requests TO authenticated;
GRANT UPDATE (subject, module_id, category, title, details, status)
    ON public.resource_requests TO authenticated;

-- Anonymous visitors read the board and nothing else.
REVOKE INSERT, UPDATE, DELETE ON public.resource_request_upvotes FROM anon;

-- ---------------------------------------------------------------------------
-- RLS
--
-- One policy per verb, following the style 20260717000005_consolidate_rls_policies.sql
-- established -- not the redundant per-verb duplication it was written to clean up.
-- ---------------------------------------------------------------------------

ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_request_upvotes ENABLE ROW LEVEL SECURITY;

-- The board is public: demand is worth showing to signed-out visitors too.
CREATE POLICY "Anyone can read resource requests"
ON public.resource_requests FOR SELECT
USING (true);

CREATE POLICY "Users can create own resource requests"
ON public.resource_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resource requests"
ON public.resource_requests FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resource requests"
ON public.resource_requests FOR DELETE
USING (auth.uid() = user_id);

-- Moderation. Gated on the admins table rather than user_roles.role: the two
-- disagree (audit finding #4) and admins is what proxy.ts, backend/app/auth.py,
-- and 20260822000500_secure_admin_analytics.sql all check.
CREATE POLICY "Admins can moderate resource requests"
ON public.resource_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid()
  )
);

-- Counts are read from resource_requests.upvote_count, so nobody needs to see
-- anybody else's vote rows -- only their own, to render the pressed state.
CREATE POLICY "Users can read own request upvotes"
ON public.resource_request_upvotes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own request upvotes"
ON public.resource_request_upvotes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own request upvotes"
ON public.resource_request_upvotes FOR DELETE
USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- upvote_count maintenance
--
-- SECURITY DEFINER is required. Upvoting somebody else's request means writing a
-- row the caller does not own: the "Users can update own resource requests"
-- policy would match zero rows, and the column grant above withholds
-- upvote_count from authenticated anyway. Same reasoning as award_achievement()
-- in 20260822000002_achievements_rework.sql.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maintain_resource_request_upvote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.resource_requests
    SET upvote_count = COALESCE(upvote_count, 0) + 1
    WHERE id = NEW.request_id;
    RETURN NEW;
  END IF;

  -- Clamped so a double-fire can never drive the count negative, matching
  -- update_document_rating_counts() in 20260807000001_add_toggle_upvote_rpc.sql.
  UPDATE public.resource_requests
  SET upvote_count = GREATEST(COALESCE(upvote_count, 0) - 1, 0)
  WHERE id = OLD.request_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_resource_request_upvote_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintain_resource_request_upvote_count() FROM anon;
REVOKE ALL ON FUNCTION public.maintain_resource_request_upvote_count() FROM authenticated;

CREATE TRIGGER trigger_resource_request_upvote_count
AFTER INSERT OR DELETE ON public.resource_request_upvotes
FOR EACH ROW EXECUTE FUNCTION public.maintain_resource_request_upvote_count();

-- ---------------------------------------------------------------------------
-- Fulfilment invariants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_resource_request_fulfilment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'fulfilled' THEN
    -- Reopening or closing a request drops its document link, so a request can
    -- never sit in a non-fulfilled state while still pointing at a document.
    NEW.fulfilled_document_id := NULL;
    NEW.fulfilled_by := NULL;
    NEW.fulfilled_at := NULL;
  ELSIF NEW.fulfilled_document_id IS NULL THEN
    -- The document that satisfied this request was deleted, and the FK's
    -- ON DELETE SET NULL is what just nulled this column. Reopen the request
    -- instead of letting resource_requests_fulfilled_needs_document reject the
    -- write -- that rejection would abort the admin's document deletion.
    NEW.status := 'open';
    NEW.fulfilled_by := NULL;
    NEW.fulfilled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_resource_request_fulfilment_guard
BEFORE UPDATE ON public.resource_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_resource_request_fulfilment();

-- Reuses the shared helper created by 20260717000009_document_comments.sql.
CREATE TRIGGER trigger_resource_requests_modtime
BEFORE UPDATE ON public.resource_requests
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- ---------------------------------------------------------------------------
-- Open-request cap
--
-- The board is written client-direct under RLS, so there is no API layer to hold
-- this limit; it has to live here. The message is user-facing -- requests.ts
-- surfaces it verbatim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_resource_request_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open integer;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.resource_requests
  WHERE user_id = NEW.user_id AND status = 'open';

  IF v_open >= 10 THEN
    RAISE EXCEPTION 'You already have 10 open requests. Close one before adding another.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_resource_request_limit
BEFORE INSERT ON public.resource_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_request_limit();

-- ---------------------------------------------------------------------------
-- documents -> the request an upload answers
-- ---------------------------------------------------------------------------

ALTER TABLE public.documents
    ADD COLUMN fulfils_request_id UUID;

ALTER TABLE public.documents
    ADD CONSTRAINT documents_fulfils_request_id_fkey
    FOREIGN KEY (fulfils_request_id) REFERENCES public.resource_requests(id) ON DELETE SET NULL;

-- Partial: only uploads started from the board carry a value.
CREATE INDEX documents_fulfils_request_id_idx
    ON public.documents (fulfils_request_id)
    WHERE fulfils_request_id IS NOT NULL;

-- The upload endpoint sets fulfils_request_id, but students cannot self-approve,
-- so the link only takes effect here -- when a moderator (or an admin's own
-- upload, which inserts as 'approved') puts the document live.
CREATE OR REPLACE FUNCTION public.fulfil_request_on_document_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.resource_requests;
BEGIN
  -- One comparison on the overwhelmingly common path: this trigger sees every
  -- write to documents, and almost none of them answer a request.
  IF NEW.fulfils_request_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Approval withdrawn: a moderator returned this document to pending, or
  -- rejected it after it had gone live. It no longer answers anything, so reopen
  -- the request rather than leaving the public board linking to a document
  -- students can no longer open. guard_resource_request_fulfilment() clears the
  -- fulfilment columns as status leaves 'fulfilled'.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.resource_requests
    SET status = 'open'
    WHERE id = NEW.fulfils_request_id
      AND status = 'fulfilled'
      AND fulfilled_document_id = NEW.id;
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NULL;
  END IF;

  -- Already live before this write: nothing new to fulfil.
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NULL;
  END IF;

  UPDATE public.resource_requests
  SET status = 'fulfilled',
      fulfilled_document_id = NEW.id,
      fulfilled_by = NEW.uploaded_by,
      fulfilled_at = now()
  -- Still open: if two contributors answered the same request, the first
  -- approval wins and the second changes nothing.
  WHERE id = NEW.fulfils_request_id
    AND status = 'open'
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- notifications has no INSERT policy at all
  -- (20260622160804_remote_schema.sql:333-335), so this insert works only
  -- because the function is SECURITY DEFINER. The table is in the realtime
  -- publication, so NotificationsContext delivers it as a live toast.
  IF v_request.user_id IS DISTINCT FROM NEW.uploaded_by THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_entity_id, is_read)
    VALUES (
      v_request.user_id,
      'Request Fulfilled',
      format('Your request "%s" was answered with "%s".', v_request.title, NEW.title),
      'request_fulfilled',
      NEW.id,
      false
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfil_request_on_document_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfil_request_on_document_approval() FROM anon;
REVOKE ALL ON FUNCTION public.fulfil_request_on_document_approval() FROM authenticated;

CREATE TRIGGER trigger_fulfil_request_on_approval
AFTER INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.fulfil_request_on_document_approval();
