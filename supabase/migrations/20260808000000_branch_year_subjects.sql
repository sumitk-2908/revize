-- Migration: Branch- and year-wise subjects
-- file: supabase/migrations/20260808000000_branch_year_subjects.sql
--
-- Adds a branch catalogue and a subject <-> (branch, year) join table so the same
-- subject row can be offered by several branches without colliding with the UNIQUE
-- constraints on subjects.name / subjects.slug. A NULL branch_id on an offering means
-- "common to all branches" -- that is how first-year subjects are stored.

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
CREATE TABLE public.branches (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.branches TO anon;
GRANT ALL ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
GRANT ALL ON SEQUENCE public.branches_id_seq TO anon;
GRANT ALL ON SEQUENCE public.branches_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.branches_id_seq TO service_role;

CREATE POLICY "Allow public read access on branches" ON public.branches
FOR SELECT USING (true);

CREATE POLICY "Admins can insert branches" ON public.branches
FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

CREATE POLICY "Admins can update branches" ON public.branches
FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

CREATE POLICY "Admins can delete branches" ON public.branches
FOR DELETE USING ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

-- ---------------------------------------------------------------------------
-- subject_offerings
-- ---------------------------------------------------------------------------
CREATE TABLE public.subject_offerings (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    -- NULL = offered to every branch (how first-year subjects are stored)
    branch_id INTEGER REFERENCES public.branches(id) ON DELETE CASCADE,
    year SMALLINT NOT NULL CHECK (year BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- A plain UNIQUE would not dedupe rows with a NULL branch_id, so guard each case
-- with its own partial index.
CREATE UNIQUE INDEX subject_offerings_branch_unique
    ON public.subject_offerings (subject_id, branch_id, year)
    WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX subject_offerings_common_unique
    ON public.subject_offerings (subject_id, year)
    WHERE branch_id IS NULL;

-- Students filter by (year, branch); admins list offerings per subject.
CREATE INDEX idx_subject_offerings_year_branch ON public.subject_offerings (year, branch_id);
CREATE INDEX idx_subject_offerings_subject_id ON public.subject_offerings (subject_id);

ALTER TABLE public.subject_offerings ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.subject_offerings TO anon;
GRANT ALL ON public.subject_offerings TO authenticated;
GRANT ALL ON public.subject_offerings TO service_role;
GRANT ALL ON SEQUENCE public.subject_offerings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subject_offerings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subject_offerings_id_seq TO service_role;

CREATE POLICY "Allow public read access on subject_offerings" ON public.subject_offerings
FOR SELECT USING (true);

CREATE POLICY "Admins can insert subject_offerings" ON public.subject_offerings
FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

CREATE POLICY "Admins can update subject_offerings" ON public.subject_offerings
FOR UPDATE USING ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

CREATE POLICY "Admins can delete subject_offerings" ON public.subject_offerings
FOR DELETE USING ((EXISTS ( SELECT 1 FROM public.admins WHERE (admins.user_id = auth.uid()) )));

-- ---------------------------------------------------------------------------
-- profiles: typed branch / year alongside the existing free-text columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN branch_id INTEGER REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN year_of_study SMALLINT CHECK (year_of_study BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Starter branches (admins can rename or delete any of these)
-- ---------------------------------------------------------------------------
INSERT INTO public.branches (code, name) VALUES
    ('CSE', 'Computer Science & Engineering'),
    ('IT',  'Information Technology'),
    ('ECE', 'Electronics & Communication Engineering'),
    ('EEE', 'Electrical & Electronics Engineering'),
    ('ME',  'Mechanical Engineering'),
    ('CE',  'Civil Engineering')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Every pre-existing subject is a first-year subject common to all branches.
INSERT INTO public.subject_offerings (subject_id, branch_id, year)
SELECT s.id, NULL, 1
FROM public.subjects s
ON CONFLICT DO NOTHING;

-- "2nd year" -> 2. Anything unparseable or out of range is left NULL.
UPDATE public.profiles
SET year_of_study = substring(academic_year from '^\d+')::smallint
WHERE academic_year ~ '^\d+'
  AND substring(academic_year from '^\d+')::smallint BETWEEN 1 AND 5;

-- Best-effort map of the old free-text branch onto the new catalogue. Students
-- whose text does not match a code (e.g. "B.Tech Computer Science") keep a blank
-- branch and re-pick it from the dropdown in their profile.
UPDATE public.profiles p
SET branch_id = b.id
FROM public.branches b
WHERE p.preferred_branch IS NOT NULL
  AND upper(trim(p.preferred_branch)) = b.code;
