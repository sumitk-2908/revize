-- Migration: Add get_module_counts RPC
-- file: supabase/migrations/20260807000000_add_module_counts_rpc.sql
--
-- The frontend (cached-subjects.ts -> getCachedModuleCounts) calls
-- get_module_counts to render per-module resource counts on subject pages,
-- but the function was never created in the database. Every call returned
-- PGRST202 ("Could not find the function public.get_module_counts"), which
-- getCachedModuleCounts rethrows, so the subject page fell through to its
-- error boundary ("Subject page could not load").
--
-- Notes on the schema this matches:
--   * documents.subject is the subject NAME (text), not a foreign key.
--   * documents.module_id holds the module NUMBER (1..n), matching
--     modules.module_number -- not modules.id. The module route
--     (/subject/[slug]/module-N) queries .eq('module_id', moduleNumber),
--     and SubjectTabs reads moduleCounts[mod.module_number].

CREATE OR REPLACE FUNCTION public.get_module_counts(p_subject text)
 RETURNS TABLE(module_id integer, count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT d.module_id, count(*)::bigint
  FROM public.documents d
  WHERE d.status = 'approved'
    AND d.module_id IS NOT NULL
    AND lower(d.subject) = lower(p_subject)
  GROUP BY d.module_id;
$function$;

GRANT ALL ON FUNCTION public.get_module_counts(text) TO anon;
GRANT ALL ON FUNCTION public.get_module_counts(text) TO authenticated;
GRANT ALL ON FUNCTION public.get_module_counts(text) TO service_role;
