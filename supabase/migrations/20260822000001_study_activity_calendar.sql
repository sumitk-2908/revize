-- Per-day study activity, so the profile heatmap can show every active day.
--
-- The heatmap used to be derived from `study_history`, which carries a
-- UNIQUE (user_id, document_id) constraint and is written with an upsert that
-- overwrites `accessed_at`. That means study_history holds exactly one row per
-- document, stamped with the *most recent* visit — so a student who read the
-- same two documents across four days produced at most two distinct dates on
-- the heatmap while `study_streaks.current_streak` correctly said 4.
--
-- Study days now get their own append-only-per-day table, written from the same
-- RPC that maintains the streak. The two can no longer disagree.

CREATE TABLE IF NOT EXISTS public.study_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  interaction_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, activity_date)
);

ALTER TABLE public.study_activity ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner. Every write goes through update_study_streak(),
-- which is SECURITY DEFINER, so no client-facing INSERT/UPDATE policy exists.
DROP POLICY IF EXISTS "Users can view own study activity" ON public.study_activity;
CREATE POLICY "Users can view own study activity" ON public.study_activity
FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.study_activity TO authenticated;
GRANT ALL ON public.study_activity TO service_role;

-- ---------------------------------------------------------------------------
-- Record the day alongside the streak
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_study_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Pinned to UTC rather than current_date so the day this function records is
  -- always the same day the backfill below computed, whatever the session
  -- timezone happens to be.
  v_today date := timezone('utc', now())::date;
  v_streak record;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Log the day first: the early return below fires on every visit after the
  -- first one each day, and those visits still belong on the heatmap.
  INSERT INTO public.study_activity (user_id, activity_date, interaction_count)
  VALUES (p_user_id, v_today, 1)
  ON CONFLICT (user_id, activity_date)
  DO UPDATE SET interaction_count = study_activity.interaction_count + 1;

  SELECT * INTO v_streak FROM public.study_streaks WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- First time studying: start the streak at 1.
    INSERT INTO public.study_streaks (user_id, current_streak, longest_streak, last_active_date)
    VALUES (p_user_id, 1, 1, v_today);
  ELSE
    -- Already counted today.
    IF v_streak.last_active_date = v_today THEN
      RETURN;
    END IF;

    IF v_streak.last_active_date = v_today - 1 THEN
      -- Studied yesterday: extend the streak.
      UPDATE public.study_streaks
      SET
        current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_active_date = v_today
      WHERE user_id = p_user_id;
    ELSE
      -- Gap of more than a day: restart at 1, but never lower the record.
      UPDATE public.study_streaks
      SET
        current_streak = 1,
        longest_streak = GREATEST(longest_streak, 1),
        last_active_date = v_today
      WHERE user_id = p_user_id;
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Every day already recoverable from study_history. This is a floor, not the
-- truth: repeat visits to a document were overwritten and cannot be recovered.
INSERT INTO public.study_activity (user_id, activity_date, interaction_count)
SELECT
  sh.user_id,
  (sh.accessed_at AT TIME ZONE 'UTC')::date,
  count(*)
FROM public.study_history sh
GROUP BY sh.user_id, (sh.accessed_at AT TIME ZONE 'UTC')::date
ON CONFLICT (user_id, activity_date) DO NOTHING;

-- Recover the days implied by each live streak. A student sitting on a 4-day
-- streak was demonstrably active on each of those 4 days, even where
-- study_history no longer shows it — this is what closes the gap users see
-- between their streak count and their heatmap.
INSERT INTO public.study_activity (user_id, activity_date, interaction_count)
SELECT
  s.user_id,
  s.last_active_date - (n - 1),
  1
FROM public.study_streaks s
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(s.current_streak, 0), 0)) AS n
WHERE s.last_active_date IS NOT NULL
ON CONFLICT (user_id, activity_date) DO NOTHING;
