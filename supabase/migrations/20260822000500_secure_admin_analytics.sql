-- Restrict portal-wide analytics to administrators.
-- The function is SECURITY DEFINER because it aggregates tables whose rows are
-- not intended to be exposed through this RPC to arbitrary callers.
CREATE OR REPLACE FUNCTION public.get_admin_analytics_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    total_docs integer;
    approved_docs integer;
    pending_docs integer;
    rejected_docs integer;
    total_downloads integer;
    total_views integer;
    total_flags integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.admins
        WHERE user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'not authorized'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT count(*),
           count(*) FILTER (WHERE status = 'approved'),
           count(*) FILTER (WHERE status = 'pending'),
           count(*) FILTER (WHERE status = 'rejected')
    INTO total_docs, approved_docs, pending_docs, rejected_docs
    FROM public.documents;

    SELECT COALESCE(sum(download_count), 0),
           COALESCE(sum(view_count), 0)
    INTO total_downloads, total_views
    FROM public.document_analytics;

    SELECT count(*)
    INTO total_flags
    FROM public.document_flags;

    RETURN json_build_object(
        'totalDocs', total_docs,
        'approvedDocs', approved_docs,
        'pendingDocs', pending_docs,
        'rejectedDocs', rejected_docs,
        'totalDownloads', total_downloads,
        'totalViews', total_views,
        'totalFlags', total_flags
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_analytics_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_stats() TO service_role;

-- Do not expose newly-created public routines to anonymous callers by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON ROUTINES FROM anon;
