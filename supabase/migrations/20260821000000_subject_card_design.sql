-- Migration: Per-subject grid card design
-- file: supabase/migrations/20260821000000_subject_card_design.sql
--
-- Lets an admin design each subject's card in the subject grid, instead of every card
-- rendering from the one hard-coded map in the frontend. Every column is nullable and
-- NULL means "not designed yet" -- the frontend then derives a look from the subject
-- itself, so existing rows keep working untouched.
--
-- These columns store registry KEYS ('indigo', 'flask-conical', 'gradient'), never CSS.
-- The registry at frontend/src/app/lib/subject-design.ts owns the valid keys and falls
-- back to the derived default for any key it does not recognise, so adding a palette or
-- an icon later needs no migration. Only length is constrained here.

ALTER TABLE public.subjects
    ADD COLUMN card_theme   TEXT,
    ADD COLUMN card_icon    TEXT,
    ADD COLUMN card_layout  TEXT,
    ADD COLUMN card_pattern TEXT,
    ADD COLUMN card_badge   TEXT,
    ADD COLUMN card_span    TEXT;

ALTER TABLE public.subjects
    ADD CONSTRAINT subjects_card_theme_length   CHECK (card_theme   IS NULL OR char_length(card_theme)   <= 32),
    ADD CONSTRAINT subjects_card_icon_length    CHECK (card_icon    IS NULL OR char_length(card_icon)    <= 32),
    ADD CONSTRAINT subjects_card_layout_length  CHECK (card_layout  IS NULL OR char_length(card_layout)  <= 32),
    ADD CONSTRAINT subjects_card_pattern_length CHECK (card_pattern IS NULL OR char_length(card_pattern) <= 32),
    -- Renders inside a small pill on the card, so it has to stay short.
    ADD CONSTRAINT subjects_card_badge_length   CHECK (card_badge   IS NULL OR char_length(card_badge)   <= 24),
    -- Unlike the others this maps to grid geometry, so the set really is closed.
    ADD CONSTRAINT subjects_card_span_valid     CHECK (card_span    IS NULL OR card_span IN ('normal', 'wide'));

-- No new policy or grant: the admin RLS on public.subjects added in
-- 20260717000007_admin_subject_management.sql gates UPDATE on membership of public.admins
-- and does not reference any column, so it already covers these.
