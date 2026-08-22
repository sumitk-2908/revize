-- Achievements: make every badge reachable, and reachable sooner.
--
-- Audit of the previous state, all five badges the profile page advertises:
--
--   pioneer        awarded  — trigger on documents, UPDATE only
--   contributor    awarded  — trigger on documents, UPDATE only, threshold 10
--   streak_7       awarded  — trigger on study_streaks, UPDATE only
--   downloads_100  NEVER    — no trigger, no function, no backend call
--   scholar        NEVER    — no trigger, no function, no backend call
--
-- So two of five badges were permanently unobtainable, and the three that did
-- work all fired from UPDATE-only triggers: a document inserted straight to
-- 'approved' (admin upload path) skipped pioneer/contributor entirely, and a
-- freshly INSERTed study_streaks row could not award anything.
--
-- This migration gives every badge a trigger, lowers the thresholds so a normal
-- student earns something in their first session, and backfills what users have
-- already earned under the new rules.
--
--   pioneer       1 approved upload            (unchanged)
--   contributor   3 approved uploads           (was 10)
--   downloads_10  10 downloads on your uploads (replaces downloads_100)
--   explorer      3 documents opened           (new)
--   scholar       15 unique documents opened   (was 50)
--   streak_3      3-day streak                 (new)
--   streak_7      7-day streak                 (unchanged)
--   curator       3 bookmarks                  (new)
--
-- Every function below is SECURITY DEFINER because user_achievements has a
-- SELECT-only RLS policy: an insert attempted as the `authenticated` role (the
-- study_history and student_bookmarks triggers fire from client writes) would
-- otherwise be silently refused.

-- ---------------------------------------------------------------------------
-- Shared award helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_achievement(p_user_id uuid, p_badge text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.user_achievements (user_id, badge_type)
  SELECT p_user_id, p_badge
  WHERE p_user_id IS NOT NULL
  ON CONFLICT (user_id, badge_type) DO NOTHING;
$$;

-- This grants a badge to an arbitrary user id, so it must never be callable
-- from a client session. Triggers do not check EXECUTE on their function, and
-- the callers below are themselves SECURITY DEFINER, so revoking costs nothing.
REVOKE ALL ON FUNCTION public.award_achievement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_achievement(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.award_achievement(uuid, text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Upload badges: pioneer, contributor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_achievements_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approved integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' OR NEW.uploaded_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Already approved before this write: nothing new to award.
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  PERFORM public.award_achievement(NEW.uploaded_by, 'pioneer');

  SELECT count(*) INTO v_approved
  FROM public.documents
  WHERE uploaded_by = NEW.uploaded_by AND status = 'approved';

  IF v_approved >= 3 THEN
    PERFORM public.award_achievement(NEW.uploaded_by, 'contributor');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_achievements_on_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_achievements_on_approval() FROM anon;
REVOKE ALL ON FUNCTION public.check_achievements_on_approval() FROM authenticated;

-- Recreated to add INSERT, so an admin upload that lands as 'approved' counts.
DROP TRIGGER IF EXISTS trigger_achievements_on_approval ON public.documents;
CREATE TRIGGER trigger_achievements_on_approval
AFTER INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.check_achievements_on_approval();

-- ---------------------------------------------------------------------------
-- Streak badges: streak_3, streak_7
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_streak_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- longest_streak counts too: a streak earned and then broken was still
  -- earned, and taking the max makes the check order-independent.
  v_best integer := GREATEST(COALESCE(NEW.current_streak, 0), COALESCE(NEW.longest_streak, 0));
BEGIN
  IF v_best >= 3 THEN
    PERFORM public.award_achievement(NEW.user_id, 'streak_3');
  END IF;

  IF v_best >= 7 THEN
    PERFORM public.award_achievement(NEW.user_id, 'streak_7');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_streak_badge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_streak_badge() FROM anon;
REVOKE ALL ON FUNCTION public.check_streak_badge() FROM authenticated;

DROP TRIGGER IF EXISTS trigger_streak_badge ON public.study_streaks;
CREATE TRIGGER trigger_streak_badge
AFTER INSERT OR UPDATE ON public.study_streaks
FOR EACH ROW EXECUTE FUNCTION public.check_streak_badge();

-- ---------------------------------------------------------------------------
-- Reading badges: explorer, scholar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_reading_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seen integer;
BEGIN
  -- study_history is UNIQUE (user_id, document_id), so the row count for a
  -- user is exactly their number of distinct documents opened.
  SELECT count(*) INTO v_seen
  FROM public.study_history
  WHERE user_id = NEW.user_id;

  IF v_seen >= 3 THEN
    PERFORM public.award_achievement(NEW.user_id, 'explorer');
  END IF;

  IF v_seen >= 15 THEN
    PERFORM public.award_achievement(NEW.user_id, 'scholar');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_reading_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_reading_badges() FROM anon;
REVOKE ALL ON FUNCTION public.check_reading_badges() FROM authenticated;

DROP TRIGGER IF EXISTS trigger_reading_badges ON public.study_history;
CREATE TRIGGER trigger_reading_badges
AFTER INSERT ON public.study_history
FOR EACH ROW EXECUTE FUNCTION public.check_reading_badges();

-- ---------------------------------------------------------------------------
-- Library badge: curator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_bookmark_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saved integer;
BEGIN
  SELECT count(*) INTO v_saved
  FROM public.student_bookmarks
  WHERE user_id = NEW.user_id;

  IF v_saved >= 3 THEN
    PERFORM public.award_achievement(NEW.user_id, 'curator');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_bookmark_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_bookmark_badges() FROM anon;
REVOKE ALL ON FUNCTION public.check_bookmark_badges() FROM authenticated;

DROP TRIGGER IF EXISTS trigger_bookmark_badges ON public.student_bookmarks;
CREATE TRIGGER trigger_bookmark_badges
AFTER INSERT ON public.student_bookmarks
FOR EACH ROW EXECUTE FUNCTION public.check_bookmark_badges();

-- ---------------------------------------------------------------------------
-- Impact badge: downloads_10
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_download_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uploader uuid;
  v_downloads bigint;
BEGIN
  -- increment_doc_stat() writes this table on every view as well as every
  -- download. Bail out unless the download counter actually moved, so a view
  -- costs one comparison instead of two queries.
  IF TG_OP = 'UPDATE' AND NEW.download_count IS NOT DISTINCT FROM OLD.download_count THEN
    RETURN NEW;
  END IF;

  SELECT uploaded_by INTO v_uploader
  FROM public.documents
  WHERE id = NEW.document_id;

  IF v_uploader IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(da.download_count), 0) INTO v_downloads
  FROM public.documents d
  JOIN public.document_analytics da ON da.document_id = d.id
  WHERE d.uploaded_by = v_uploader AND d.status = 'approved';

  IF v_downloads >= 10 THEN
    PERFORM public.award_achievement(v_uploader, 'downloads_10');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_download_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_download_badges() FROM anon;
REVOKE ALL ON FUNCTION public.check_download_badges() FROM authenticated;

DROP TRIGGER IF EXISTS trigger_download_badges ON public.document_analytics;
CREATE TRIGGER trigger_download_badges
AFTER INSERT OR UPDATE ON public.document_analytics
FOR EACH ROW EXECUTE FUNCTION public.check_download_badges();

-- ---------------------------------------------------------------------------
-- Backfill: grant what existing users have already earned
-- ---------------------------------------------------------------------------

-- pioneer + contributor
INSERT INTO public.user_achievements (user_id, badge_type)
SELECT d.uploaded_by, b.badge
FROM (
  SELECT uploaded_by, count(*) AS approved
  FROM public.documents
  WHERE status = 'approved' AND uploaded_by IS NOT NULL
  GROUP BY uploaded_by
) d
CROSS JOIN (VALUES ('pioneer'::text, 1), ('contributor'::text, 3)) AS b(badge, threshold)
WHERE d.approved >= b.threshold
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- explorer + scholar
INSERT INTO public.user_achievements (user_id, badge_type)
SELECT h.user_id, b.badge
FROM (
  SELECT user_id, count(*) AS seen
  FROM public.study_history
  GROUP BY user_id
) h
CROSS JOIN (VALUES ('explorer'::text, 3), ('scholar'::text, 15)) AS b(badge, threshold)
WHERE h.seen >= b.threshold
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- streak_3 + streak_7
INSERT INTO public.user_achievements (user_id, badge_type)
SELECT s.user_id, b.badge
FROM public.study_streaks s
CROSS JOIN (VALUES ('streak_3'::text, 3), ('streak_7'::text, 7)) AS b(badge, threshold)
WHERE GREATEST(COALESCE(s.current_streak, 0), COALESCE(s.longest_streak, 0)) >= b.threshold
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- curator
INSERT INTO public.user_achievements (user_id, badge_type)
SELECT bm.user_id, 'curator'::text
FROM public.student_bookmarks bm
GROUP BY bm.user_id
HAVING count(*) >= 3
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- downloads_10
INSERT INTO public.user_achievements (user_id, badge_type)
SELECT d.uploaded_by, 'downloads_10'::text
FROM public.documents d
JOIN public.document_analytics da ON da.document_id = d.id
WHERE d.status = 'approved' AND d.uploaded_by IS NOT NULL
GROUP BY d.uploaded_by
HAVING COALESCE(sum(da.download_count), 0) >= 10
ON CONFLICT (user_id, badge_type) DO NOTHING;
