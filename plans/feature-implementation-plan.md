# Feature Audit & Implementation Plan — Academic Portal

> Generated 2026-08-22. Audit of the shipped codebase plus a ranked backlog of new features.
> Companion doc: `plans/implementation-plan.md` (an unrelated production-hardening plan — that one refactors what exists; this one adds what doesn't).

## Context

This document answers two questions: what is already built, and what is worth building next — ranked by **Usefulness + Feasibility**.

**Why the audit came first:** this codebase is far more complete than a typical student project. `docs/FEATURES.md` already checks off full-text search, filters/sort/pagination, moderation with bulk review and audit logs, bookmarks, study history, ratings, upvotes, threaded comments with mentions/pinning/flagging, realtime notifications, achievements, streaks, activity heatmaps, admin analytics, TOTP MFA, and a PWA shell with offline fallback. The real risk in a "suggest features" exercise here is **proposing something that already exists**. Every row in the table below was checked against the shipped code, and partial overlaps are flagged explicitly rather than hidden.

**Goals driving the scoring:**
- Optimize for **real student adoption**, not demo polish.
- **Prefer zero new dependencies.** New free npm/pip libs are acceptable; an **LLM API is acceptable**; **no email provider** is approved, so email-dependent features are deprioritized and marked as such.

---

## Audit summary

**Stack:** Next.js 16.2.7 App Router / React 19.2.4 / TS / Tailwind 4 / Radix / TanStack Query+Virtual · FastAPI (no ORM; Supabase PostgREST client) · Supabase Postgres 17 with RLS + FTS + Realtime · Cloudflare R2 for files via boto3 · PyMuPDF for PDF processing.

**Split data access:** browser → Supabase directly under RLS for reads and personal writes; FastAPI → privileged work only (upload validation, R2, moderation, audit). Any new feature must pick a side deliberately.

Findings that shape the rankings below:

1. **Search only indexes metadata.** `documents.fts` is a generated column over `title`/`subject`/`category`/`module_id` only ([supabase/migrations/20260622160804_remote_schema.sql](../supabase/migrations/20260622160804_remote_schema.sql)). Document *contents* are not searchable — the single biggest discovery gap, and PyMuPDF is already installed to fix it.
2. **The viewer already renders `renderTextLayer={true}`** ([frontend/src/components/pdf/PDFViewerClient.tsx:404](../frontend/src/components/pdf/PDFViewerClient.tsx#L404)), so in-viewer text search is achievable with **no backend and no new dependency**.
3. **`get_admin_analytics_stats()` is `SECURITY DEFINER` with no authorization check**, and the base migration sets `ALTER DEFAULT PRIVILEGES … GRANT ALL ON ROUTINES TO anon`. Portal-wide counts are readable by anonymous callers. Real, small, worth fixing first.
4. **Two competing admin sources of truth**: `proxy.ts`, `backend/app/auth.py`, and most RLS policies check the `admins` table, but `AuthContext.tsx:91` and `DocumentInteractiveGrid.tsx:85` check `user_roles.role`. They can disagree.
5. **`document_comments` RLS is `SELECT true` including soft-deleted rows** — deleted comment text is filtered client-side only, so it is still readable through the API.
6. **`document_daily_stats` exists and is populated** but has no user-facing consumer beyond the trending view — per-document time series are already there for free.
7. **Bookmarks are flat.** `student_bookmarks` has no grouping concept.
8. **Uploads are single-file** and store no content hash, so duplicates are invisible to moderators.
9. `study_history` records *that* a doc was opened, not *where the reader stopped*.
10. Radix `animate-in` / `data-[state]` classes are inert (no animate plugin installed) — ~100 classes emit no CSS.
11. Dead weight: `degrees`, `semesters` (RLS on, zero policies, zero consumers), and `frontend/src/__lintbase/*` tracked-but-lint-ignored copies of real components.

**Confirmed absent** (so the proposals below are not duplicates): leaderboard, flashcards/quiz, spaced repetition, bookmark collections, user-created highlights/annotations, resource requests, subject-level Q&A, semantic search / pgvector / embeddings, i18n, OCR, content-hash dedupe, reading position.

---

## Ranked features

Sorted by **Combined = Usefulness + Feasibility**, descending; ties broken by Usefulness.
**FE-only** = no backend, API, or DB change required. **⚠ Overlap** = partially duplicates something shipped; scope carefully.

| # | Feature | Category | Usefulness | Feasibility | User Impact | Notes |
|---|---|---|---|---|---|---|
| 1 | In-viewer text search (Ctrl+F inside a document) | Discovery | 8 | 9 | Turns a 60-page scanned unit into something skimmable in seconds; the #1 thing students do with lecture notes | **FE-only.** Text layer already rendered at `PDFViewerClient.tsx:404`; search the `numPages` text content client-side and scroll the existing `useVirtualizer`. No new dep. |
| 2 | Full-text search **inside** document content | Discovery | 9 | 7 | "Which notes cover Karnaugh maps?" becomes answerable — today search sees only titles | Extract text at upload with **already-installed PyMuPDF**; add `content_tsv`; backfill existing rows. Extends `documents.fts`, does not replace it. |
| 3 | Duplicate-upload detection via SHA-256 | Contributor Tools | 8 | 8 | Stops the same PYQ being uploaded six times; saves the moderator queue and keeps the library trustworthy | Hash the bytes already buffered in `documents.py` upload; indexed lookup; warn uploader + show moderator "possible duplicate of #N". |
| 4 | Bookmark collections / folders | Study Tools | 8 | 8 | "Exam prep — DSA Unit 3" beats one flat list of 40 saves; directly drives return visits | New `bookmark_collections` + join table. ⚠ **Overlap** with flat `student_bookmarks` — additive, keep uncollected saves working. |
| 5 | Contributor leaderboard (weekly + all-time) | Gamification | 7 | 9 | Makes contributing socially visible; the cheapest lever on upload volume | Data already exists in `document_analytics` + `documents.uploaded_by`. One RPC + one page. No new tables. |
| 6 | Fix `get_admin_analytics_stats` authorization | Security | 7 | 9 | Closes an anonymous read of portal-wide stats | **Do this first — ~30 min.** `SECURITY DEFINER` with no admin check + `GRANT ALL ON ROUTINES TO anon`. Mini-spec after the deep dives. |
| 7 | PDF highlights + personal margin notes | Study Tools | 9 | 6 | The strongest "I live in this app" feature; converts a file host into a study tool | New `document_highlights` table (page, rect, color, note). Coordinate math against the react-pdf text layer is the hard part. |
| 8 | Multi-file bulk upload | Contributor Tools | 8 | 7 | A contributor with a semester of notes currently uploads one file at a time; this is the main contribution bottleneck | Reuse `uploadWithProgress` XHR per file, queue with concurrency 2–3. Backend unchanged apart from the 5/min rate limit. |
| 9 | Resource requests board ("wanted" notes) | Community | 8 | 7 | Surfaces demand, tells contributors exactly what to upload, fixes content gaps | New `resource_requests` + upvotes. Pairs naturally with #13. |
| 10 | Reading progress / resume at page | Study Tools | 7 | 8 | "Continue studying" currently reopens page 1 of a 90-page PDF | Add `last_page` to `study_history`; viewer already tracks `currentPage`. Small, high-frequency payoff. |
| 11 | "Similar / related documents" on viewer page | Discovery | 7 | 8 | Keeps a session going instead of ending at one download | Reuse subject+module+category, or `ts_rank` against the new `content_tsv` from #2. |
| 12 | Contributor-facing analytics (my docs over time) | Analytics | 7 | 8 | Shows a contributor their work is used — strong retention loop for the people who matter most | `document_daily_stats` is **already populated** with no consumer. Needs a small chart (hand-rolled SVG; no chart lib installed). |
| 13 | Admin content-gap dashboard | Analytics | 7 | 8 | Points moderators at empty modules — the fastest route to a library students trust | One RPC left-joining `subject_offerings`/`modules` against approved doc counts. |
| 14 | Restore Radix enter/exit animations | Performance | 5 | 10 | Every dropdown/modal/toast currently pops with no transition | **FE-only.** ~100 `animate-in`/`data-[state]` classes emit no CSS; add the animate plugin or hand-write the keyframes. Pure polish, near-zero risk. |
| 15 | AI document summary + key points (cached) | Study Tools | 8 | 6 | A 3-line summary before downloading a 40-page PDF saves real time | LLM API approved. Generate once on approval, cache in a column — never per-view. Needs the text extraction from #2 first. |
| 16 | Auto-fill upload metadata from filename/content | Contributor Tools | 7 | 7 | Fewer miscategorized uploads = less moderation churn | Suggest subject/module/category from filename + first page text. Reuse `SubjectCombobox` + `fuse.js` (already installed). |
| 17 | Unify the admin source of truth | Security | 7 | 7 | Removes a class of "admin UI shows for non-admins" bugs | `admins` table vs `user_roles.role` disagree across `AuthContext.tsx:91`, `proxy.ts:53`, `auth.py:80`, and RLS. Pick `admins`; migrate policies. |
| 18 | Comment upvotes + "best answer" | Community | 6 | 8 | Surfaces the one useful reply in a long thread | Mirrors the existing `toggle_upvote` RPC pattern. ⚠ **Overlap** with document upvotes — reuse, don't reinvent. |
| 19 | Expanded badges + progress-to-next | Gamification | 6 | 8 | Three badges (`pioneer`, `contributor`, `streak_7`) is a thin ladder | ⚠ **Overlap** — extend the existing trigger-driven `user_achievements`, don't build a parallel system. |
| 20 | Accessibility pass: focus traps, skip link, reduced-motion | Accessibility | 6 | 8 | Makes keyboard and screen-reader use viable; also an SEO/quality win | **FE-only.** ⚠ **Overlap** — 139 aria/role/keyboard usages already exist across 29 files; this is completion, not greenfield. |
| 21 | Quick-look preview modal from result grids | Discovery | 6 | 8 | Judge a doc without a full page navigation | **FE-only.** `thumbnail_url` already stored for PDFs and images. |
| 22 | Stop serving soft-deleted comment text | Security | 6 | 8 | Deleted comments are still readable via the API | RLS is `SELECT true` including `is_deleted` rows; filtering is client-side only. Tighten the policy or use a view. |
| 23 | AI flashcards + quiz generation | Study Tools | 8 | 5 | Highest-ceiling study feature; also the most work and the only one with per-use cost | Depends on #2 and #15. Cache aggressively; cap generation per document. |
| 24 | Subject/module-level Q&A threads | Community | 7 | 6 | Comments are per-document only, so "how do we solve Q3?" has nowhere to live | New `subject_threads`. ⚠ **Overlap** with `document_comments` — consider generalizing that table instead of adding a second one. |
| 25 | Subject subscription alerts ("new notes in DSA") | Notifications | 7 | 6 | Brings students back when content they care about lands | In-app + realtime only — **no email provider approved**, so no digest. Realtime plumbing already exists in `NotificationsContext`. |
| 26 | HTTP caching + ETags on `/search` | Performance | 5 | 8 | Faster repeat searches, lower hosting bill | Endpoint is public and cacheable; currently sends no cache headers. |
| 27 | Semantic search (pgvector + embeddings) | Discovery | 8 | 4 | Finds "matrix inverse" notes titled "Unit 2" | ⚠ **Overlap** — do #2 first; keyword FTS over real content solves most of this at a fraction of the cost. Revisit only if #2 proves insufficient. |
| 28 | Exam countdown + study planner | Study Tools | 6 | 6 | Gives the portal a reason to be opened daily, not just before deadlines | Needs an exam-date source; no academic calendar exists in the schema. |
| 29 | Notification preferences | Notifications | 5 | 7 | Mutes noise once #25 exists | Low value until there is more than one notification type to mute. |
| 30 | Spaced-repetition review queue | Study Tools | 7 | 4 | Real learning gains for the students who adopt it | Only meaningful after #23. Scheduling state + daily queue is a feature in its own right. |
| 31 | Document versioning with history | Contributor Tools | 6 | 5 | "Updated 2026 PYQ set" without losing the old one | ⚠ **Overlap** — `resubmission_count` and the resubmit flow already handle the rejected-doc case; this is the approved-doc case. |
| 32 | Study groups / shared collections | Community | 5 | 4 | Nice for cohorts, but needs invites, permissions, and a sharing model | Lowest ratio here. Do #4 first and see whether sharing is actually requested. |

---

## Top 5 deep dives

### 1. In-viewer text search — Combined 17 · **frontend-only**

**User story:** As a student with a 60-page scanned unit open, I press `Ctrl+F`, type "Karnaugh", and jump straight to the pages that mention it, with hits highlighted and a next/previous control.

**Why it is cheap here:** [PDFViewerClient.tsx:404](../frontend/src/components/pdf/PDFViewerClient.tsx#L404) already sets `renderTextLayer={true}`, and the file already owns a `useVirtualizer` (line 61), `currentPage` state, and a `scale` control. Searching means reading text that pdf.js is already producing and scrolling a virtualizer that already exists.

**Files to modify**
- [frontend/src/components/pdf/PDFViewerClient.tsx](../frontend/src/components/pdf/PDFViewerClient.tsx) — add search state, a toolbar input next to the existing zoom/page controls (~line 352), `Ctrl+F` / `Escape` handling alongside the existing arrow-key handler (~line 191), and `virtualizer.scrollToIndex(page - 1)` on hit navigation.
- New `frontend/src/components/pdf/usePdfTextSearch.ts` — extract per-page text via `pdfjs` `getTextContent()`, cache it in a ref keyed by page, return `{ matches, activeIndex, next, prev }`.
- [frontend/src/app/globals.css](../frontend/src/app/globals.css) — one highlight utility class for matched spans.

**DB changes:** none. **New API endpoints:** none. **New dependencies:** none (`react-pdf` already exposes `pdfjs`).

**Effort:** ~1 day. Watch two things: pdf.js text items are fragmented, so a match spanning items needs normalized concatenation with an offset map back to spans; and only extract text for pages on demand, or a 200-page PDF will stall the main thread.

---

### 2. Full-text search inside document content — Combined 16

**User story:** As a student who cannot remember which file covers a topic, I search "Karnaugh map" and get every approved document whose *contents* mention it, ranked alongside the title matches I already get today.

**Files to modify**
- [backend/app/routers/documents.py](../backend/app/routers/documents.py) — in the upload path (~line 233, where bytes are already buffered for validation) extract text with the **already-installed** PyMuPDF for PDFs and decode `.txt`/`.md` directly; store it on insert (~line 297). Extend the search query (~line 437) to match `content_tsv` and rank title above content. Mirror into the resubmit path (~line 679).
- [backend/app/file_types.py](../backend/app/file_types.py) — add an `extract_text(kind, data)` helper next to the existing per-type structural checks, with a character cap.
- **New** `supabase/migrations/20260822000000_document_content_search.sql`.
- [frontend/src/app/lib/database.types.ts](../frontend/src/app/lib/database.types.ts) — **must be hand-edited.** This file is hand-maintained and already stale (it still declares dropped `student_history` / `documents_title_backup` and omits `document_daily_stats` / `admin_audit_log`). New columns will not compile without it.
- **New** `backend/scripts/backfill_document_text.py` — re-download approved files from R2 and populate content for existing rows.

**DB changes**
```sql
alter table public.documents add column content_text text;
alter table public.documents add column content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content_text, ''))) stored;
create index documents_content_tsv_idx on public.documents using gin (content_tsv);
```
Keep the existing `fts` column and `documents_fts_idx` untouched; query both and weight `fts` higher.

**New API endpoints:** none — extends `GET /api/v1/documents/search`. Consider adding `match_context` to the response so the UI can show a snippet.

**Effort:** ~2–3 days (1 for extraction + query, 1 for the backfill against real R2 data, 0.5 for snippet UI).

**Risks:** Office files need no text extraction in v1 — scope to PDF/txt/md and say so. Scanned image-only PDFs yield no text; that is the OCR case and is explicitly out of scope. Cap stored text (e.g. 500 KB) so a huge PDF cannot bloat the row.

---

### 3. Duplicate-upload detection via SHA-256 — Combined 16

**User story:** As a contributor, when I upload a PYQ that already exists I am told immediately and shown the existing document, instead of waiting three days for a rejection. As a moderator, possible duplicates are labelled in my inbox.

**Files to modify**
- [backend/app/routers/documents.py](../backend/app/routers/documents.py) — compute `hashlib.sha256` over the bytes already read in bounded chunks during validation (~line 233); before insert, look up the hash; return `409` with the existing document id on an exact match. Same in the resubmit path (~line 679).
- [frontend/src/components/layout/modals/UploadModal.tsx](../frontend/src/components/layout/modals/UploadModal.tsx) — handle `409` with a "this already exists — view it" affordance rather than a generic error.
- [frontend/src/app/subject/admin/inbox/page.tsx](../frontend/src/app/subject/admin/inbox/page.tsx) — badge pending rows whose hash matches an approved document.
- [frontend/src/app/lib/database.types.ts](../frontend/src/app/lib/database.types.ts) — add the column (hand-edited, as above).
- **New** `supabase/migrations/20260822000001_document_content_hash.sql`.

**DB changes**
```sql
alter table public.documents add column file_sha256 text;
create index documents_file_sha256_idx on public.documents (file_sha256);
```
Use a plain index, **not** a unique constraint: the same file legitimately appears under different subjects, and existing rows have `null`. Enforce the policy in the API where it can be explained to the user.

**New API endpoints:** none required. Optional `GET /api/v1/documents/check-duplicate?sha256=` to let the client warn *before* uploading 50 MB — worth it, and cheap.

**Effort:** ~1 day, plus a short backfill script if you want existing rows covered.

---

### 4. Bookmark collections / folders — Combined 16

**User story:** As a student in exam week, I group saved documents into "DSA Unit 3" and "OS PYQs" and open one collection instead of scrolling a flat list of 40 saves.

**Files to modify**
- **New** `supabase/migrations/20260822000002_bookmark_collections.sql`
- [frontend/src/app/lib/api/bookmarks.ts](../frontend/src/app/lib/api/bookmarks.ts) — add collection CRUD and assign/unassign beside the existing `getStudentBookmarks` / add / remove.
- [frontend/src/app/hooks/useBookmarks.ts](../frontend/src/app/hooks/useBookmarks.ts) — extend the existing optimistic-update + localStorage-mirror pattern; **do not** start a second cache.
- [frontend/src/app/bookmarks/page.tsx](../frontend/src/app/bookmarks/page.tsx) — collection sidebar/tabs, with an "Unsorted" bucket so today's flat saves stay reachable.
- [frontend/src/components/ui/DocumentCard.tsx](../frontend/src/components/ui/DocumentCard.tsx) — "add to collection" in the existing bookmark control.
- [frontend/src/app/lib/database.types.ts](../frontend/src/app/lib/database.types.ts) — new tables (hand-edited).

**DB changes**
```sql
create table public.bookmark_collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);
create table public.bookmark_collection_items (
  collection_id uuid not null references public.bookmark_collections(id) on delete cascade,
  bookmark_id integer not null references public.student_bookmarks(id) on delete cascade,
  primary key (collection_id, bookmark_id)
);
alter table public.bookmark_collections enable row level security;
alter table public.bookmark_collection_items enable row level security;
```
RLS: `all using (auth.uid() = user_id)` on collections; on items, gate through an `exists` against the parent collection. Follow the single-`ALL`-policy style, not the redundant per-verb duplication that `20260717000005_consolidate_rls_policies.sql` was written to clean up.

**New API endpoints:** none — client-direct Supabase under RLS, matching how bookmarks already work.

**Effort:** ~2 days. Keep it strictly additive: a user who never makes a collection must see no change.

---

### 5. Contributor leaderboard — Combined 16

**User story:** As a contributor I can see myself ranked by how much my uploads are actually used this week, and as a browsing student I can see who is worth following.

**Why it is the cheapest of the five:** every input already exists — `documents.uploaded_by` (now a real `uuid` FK), `document_analytics` (views/downloads/upvotes), `document_daily_stats` (time-scoped), and `profiles.full_name`. The existing `weekly_trending_documents` view is a working template for the 7-day window.

**Files to modify**
- **New** `supabase/migrations/20260822000003_contributor_leaderboard.sql` — a `get_contributor_leaderboard(p_window text)` RPC returning user id, display name, approved-upload count, total views, total downloads, upvotes, rank.
- **New** `frontend/src/app/leaderboard/page.tsx` + `layout.tsx` for the title, following the existing per-route pattern.
- **New** `frontend/src/app/lib/api/leaderboard.ts`
- [frontend/src/components/layout/Sidebar.tsx](../frontend/src/components/layout/Sidebar.tsx) — nav entry.
- [frontend/src/app/profile/page.tsx](../frontend/src/app/profile/page.tsx) — show the viewer's own rank, reusing the existing stat-card components.

**DB changes:** one RPC, no new tables. Make it `STABLE` and **not** `SECURITY DEFINER` — it reads only approved documents and public profile names, so plain RLS suffices. Given finding #3, do not add another unguarded definer function.

**New API endpoints:** none — client-direct RPC, like `get_subject_counts` and `get_admin_analytics_stats` today.

**Effort:** ~1–1.5 days.

**Privacy note:** rank contributors by *approved* uploads only, and use `profiles.full_name` — never email. Link rows to the existing `/contributor/[userId]` page instead of building a new profile surface.

---

### Prerequisite patch (table row #6): lock down `get_admin_analytics_stats`

Not a feature, but it ranks with the top group and takes about 30 minutes. Do it before shipping anything else, since #5 adds another public RPC.

- **New** `supabase/migrations/20260822000004_secure_admin_analytics.sql`:
  - `create or replace` the function with an `if not exists (select 1 from public.admins where user_id = auth.uid()) then raise exception 'not authorized'; end if;` guard, plus `set search_path = public`.
  - `revoke all on function public.get_admin_analytics_stats() from public, anon;` then grant to `authenticated`, `service_role` — the same hardening `20260807000001_add_toggle_upvote_rpc.sql` already applies to `toggle_upvote`.
  - Consider `alter default privileges … revoke all on routines from anon;` so future functions are not exposed by default.
- No frontend change: [frontend/src/app/portal-admin/analytics/page.tsx](../frontend/src/app/portal-admin/analytics/page.tsx) is already reached only behind the `proxy.ts` admin + AAL2 gate.

---

## Suggested build order

Sequenced so each step unblocks the next rather than by raw score:

1. **#6 security patch** (~30 min) — before adding more public RPCs.
2. **#1 in-viewer search** (~1 day) — frontend-only, zero schema risk, immediately visible.
3. **#3 duplicate detection** (~1 day) — small, protects library quality early.
4. **#2 content FTS** (~2–3 days) — the biggest single win; also unlocks #11, #15, #23.
5. **#5 leaderboard** (~1–1.5 days) and **#4 collections** (~2 days) — independent, parallelizable.
6. **#14 Radix animations** (~half day) — pick up whenever the polish gap is annoying.

---

## Verification

**Environment caveat — read first:** local migration verification is unavailable in this environment; the linked remote Supabase project is the real database. So **never apply a new migration by running it straight against the remote.** Review the SQL, apply to a throwaway Supabase project or branch, and only then promote. This is the highest-risk part of items #2, #3, #4, and #5.

**Per item**
- **#1 (frontend-only):** `cd frontend && npm run dev`. Open a multi-page PDF at `/subject/[subjectSlug]/[moduleSlug]/[pdfId]`, `Ctrl+F` a word known to be on a late page, confirm the hit highlights and the virtualizer scrolls to it, and confirm `Escape` closes without breaking existing arrow-key page nav. Re-check on a `.png` and a `.md` document, where search must hide rather than error.
- **#2:** upload a PDF whose body contains a distinctive nonsense token absent from its title; after approval, that token must return the document from `GET /api/v1/documents/search?query=…`. Confirm a title-only match still outranks a content-only match. Run the backfill against a copy first and check row-size growth.
- **#3:** upload a file, then upload the identical bytes again under a different title — expect `409` and a link to the original. Then upload a one-byte-different file and expect success.
- **#4:** create two collections, assign the same bookmark to both, delete one collection, and confirm the bookmark itself survives and still appears under "Unsorted". Sign in as a second user and confirm collections are not visible cross-user (RLS).
- **#5:** compare RPC output against a hand-written aggregate query for one contributor. Confirm the RPC is callable by `authenticated` and **rejected or empty for `anon`** as designed, and that pending/rejected uploads do not count.
- **#6:** call `get_admin_analytics_stats` with an anon key — must fail. Call as an admin — must succeed. Confirm `/portal-admin/analytics` still renders.

**Whole-project regression gate** (matches `docs/ROADMAP.md`):
```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
cd ../backend && python -m pytest tests -q && python -m compileall app
```
Notes on these:
- Backend tests need the env file loaded before `pytest` — a bare `pytest` crashes at import because `app.main` raises without its settings. The **known-good baseline is 12 passed with 2 pre-existing auth failures**; do not treat those two as regressions caused by this work.
- Lint currently passes. The whitelist that keeps it passing is a **rule option, not a config setting** — never run a blanket `eslint --fix`.
- CI (`.github/workflows/ci.yml`) triggers on `main`, but this repo's branch is `master`, so **CI likely never runs**. Do not rely on it as a gate; run the commands locally. Fixing the trigger is a worthwhile side errand.
- Playwright's `webServer` block is commented out — start `npm run dev`, the API, and Supabase before `test:e2e`.

**Also worth knowing:** any frontend work must follow `frontend/AGENTS.md` — this Next.js version has breaking changes, and the relevant guide under `frontend/node_modules/next/dist/docs/` should be read before writing code (e.g. middleware is `src/proxy.ts`, not `middleware.ts`). No new test files are proposed above; adding a Playwright spec for #1 and a pytest case for #3 would be the cheapest coverage wins.
