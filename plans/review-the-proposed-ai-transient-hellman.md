# AI study content: architecture review + implementation plan

## Context

The portal has a complete, tested Groq client at [backend/app/llm.py](backend/app/llm.py) (444 lines, 26 offline tests) and two untracked migrations that add AI columns and a `document_study_sets` table — but **nothing calls any of it**. No endpoint, no UI, no types. The feature is at "library and schema written, not integrated."

The proposal under review would generate summary/flashcards/quiz manually via ChatGPT/Gemini, store the JSON in Cloudflare R2, and keep only pointer metadata in Postgres.

**Review verdict: adopt the workflow half, reject the storage half.** Manual/curated generation is genuinely better than the current auto-generate-on-approval design. Putting the JSON in R2 is not justified and costs real security. Decisions confirmed with the user: Postgres `jsonb`, hybrid generation (Groq drafts + manual paste), summary shipped first.

---

## 1. Review

### What the proposal gets right — adopt these

| Proposal element | Why it's better than what's currently written |
| --- | --- |
| **Human review before students see it** | The highest-stakes failure here is a hallucinated fact read as truth. The uncommitted design publishes model output straight to students with no gate. |
| **Manual generation via ChatGPT/Gemini** | Bypasses three hard limits at once — see below. |
| **`version`, `model`, `status`, timestamps** | Strictly better bookkeeping than the single `ai_generated_at` marker. Enables edit, rollback, and "what's unpublished". |
| **PDFs stay in R2** | Already true. 50 MB files with egress are exactly R2's job. No change needed. |

The manual path clears three limits that no amount of tuning fixes:

1. **Token ceiling.** Groq's free tier is 200K tokens/day *per organisation*. [config.py:27-31](backend/app/config.py#L27-L31) and the study-sets migration both note the full package is ~18K tokens → the whole portal is capped at ~11 documents/day.
2. **Input truncation.** `MAX_LLM_INPUT_CHARS = 20_000` ([llm.py:29](backend/app/llm.py#L29)) — ~5K tokens, forced by the 8K/minute limit, not the 131K context. `MAX_EXTRACTED_TEXT_CHARS` is 500,000, so the model sees at most the first 4% of a long document. Pasting a PDF into Gemini covers all of it.
3. **OCR quality.** [plans/ocr_managed_api_plan.md](plans/ocr_managed_api_plan.md) records measured Tesseract confidence of **37.9 on handwritten notes** vs 90.2 on printed text — roughly half the corpus yields unusable `content_text`. A multimodal model reads the scan directly.

### What to change — R2 for the JSON

**The stated rationale ("minimize Supabase Storage usage") doesn't survive the numbers.** Completions are hard-capped at 1,200 + 2,500 + 2,500 = ~6,200 tokens ≈ **20–25 KB of JSON per document**; 5,000 documents is ~100 MB. Meanwhile `documents.content_text` already stores **up to 500 KB per document** in Postgres, plus a generated `content_tsv`. Moving the 20 KB to R2 while leaving the 500 KB behind optimises the wrong 4%.

What R2 would additionally cost:

- **Quiz answers become world-readable.** `R2_PUBLIC_URL` is an unsigned public origin and [storage.py](backend/app/storage.py) has no presign function — repo-wide grep for `generate_presigned` returns nothing. `correct_index` and `explanation` would be fetchable by anyone, and the corpus scrapable. The existing `document_study_sets` RLS (authenticated only, `anon` revoked) is strictly stronger. Matching it in R2 needs per-request presigning — a server round-trip that erases R2's only advantage.
- **Guessable, colliding keys.** `document_storage_key()` ([storage.py:50](backend/app/storage.py#L50)) is deterministic from title+subject+module with no hash or UUID, so same-title documents already overwrite each other. An AI key derived the same way inherits that.
- **No `ON DELETE CASCADE`.** Postgres cleans up for free; R2 objects need explicit deletion on document delete, version replace, and rollback — and `key_from_public_url` returns `None` for anything outside `R2_PUBLIC_URL`, so deletion is already best-effort.
- **Loses `jsonb`.** "Which approved documents lack published AI content?" becomes a `LEFT JOIN` plus an R2 existence check instead of one query.
- **No offline advantage.** Both an R2 object and a PostgREST read are cross-origin GETs to the service worker. Neither is privileged.

**One JSON package per document is also wrong regardless of store.** It couples the three artifacts: regenerating the quiz forces rewriting and re-reviewing the summary, and a student loading the summary downloads the answer key. One row per `(document, kind, version)` decouples them.

### Open hole this plan must close

[20260823000000_document_ai_summary.sql:33-43](supabase/migrations/20260823000000_document_ai_summary.sql#L33-L43) documents that the guard against a student writing their own `ai_summary` is *"the approval path OVERWRITES these columns unconditionally"* — **that code does not exist.** Today RLS `"Student Insert Pending"` lets a student PostgREST-insert a pending document carrying a self-authored `ai_summary` and a non-null `ai_generated_at`; on approval it sticks and the backfill skips it. Moving published content into an admin-write-only table closes this by construction.

### Also blocking, found during review

`admin_audit_log.action` has `CHECK (action IN ('approve','reject','delete','dismiss_flags'))` ([20260718000000_admin_audit_log.sql:4](supabase/migrations/20260718000000_admin_audit_log.sql#L4)). Logging an AI publish needs that CHECK extended or the insert throws at runtime.

---

## 2. Schema

Both AI migrations are **untracked and unapplied**, so rewrite them in place rather than layering corrections. Consolidate into one file, `supabase/migrations/20260823000000_document_ai_content.sql`, and delete `20260823000100_document_study_sets.sql`. Do **not** add the four `documents.ai_*` columns.

```sql
CREATE TABLE public.document_ai_content (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id integer NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('summary','flashcards','quiz')),
    version     integer NOT NULL DEFAULT 1,
    payload     jsonb NOT NULL,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    source      text NOT NULL CHECK (source IN ('manual','generated')),
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
```

**Read policies restrict to `status = 'published'`, so drafts are invisible to every client and the embed below needs no filter.** Two policies, because the artifacts differ in sensitivity:

```sql
-- Summary is derived from an already-public approved PDF, and being anon-readable
-- is what lets it ride the existing server-component SELECT (and helps SEO).
CREATE POLICY "Anyone can read published summaries for approved documents"
ON public.document_ai_content FOR SELECT TO anon, authenticated
USING (
  status = 'published' AND kind = 'summary'
  AND EXISTS (SELECT 1 FROM public.documents d
              WHERE d.id = document_id AND d.status = 'approved')
);

-- Flashcards and quizzes carry answer keys: signed-in only, mirroring the rule
-- the superseded document_study_sets migration chose.
CREATE POLICY "Signed-in users can read published study sets"
ON public.document_ai_content FOR SELECT TO authenticated
USING (
  status = 'published' AND kind IN ('flashcards','quiz')
  AND EXISTS (SELECT 1 FROM public.documents d
              WHERE d.id = document_id AND d.status = 'approved')
);

GRANT SELECT ON public.document_ai_content TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.document_ai_content TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.document_ai_content FROM anon, authenticated;
```

No client write policy and no admin read policy: admins read drafts through the backend's service-role client, matching how every other privileged path in this repo works.

**Atomic publish RPC.** The partial unique index means archive-then-publish must be one transaction. Authorization stays in `verify_admin` — the backend already bypasses RLS with the service-role key everywhere, so an internal `auth.uid()` check would be `NULL` and fail:

```sql
CREATE OR REPLACE FUNCTION public.publish_ai_content(
    p_document_id integer, p_kind text, p_version integer, p_admin_id uuid
) RETURNS public.document_ai_content
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.document_ai_content;
BEGIN
  UPDATE public.document_ai_content SET status = 'archived'
   WHERE document_id = p_document_id AND kind = p_kind AND status = 'published';

  UPDATE public.document_ai_content
     SET status = 'published',
         published_at = timezone('utc', now()),
         reviewed_by = p_admin_id
   WHERE document_id = p_document_id AND kind = p_kind AND version = p_version
     AND status = 'draft'
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'No draft version % of % for document %', p_version, p_kind, p_document_id;
  END IF;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ai_content(integer, text, integer, uuid) TO service_role;
```

Plus the audit CHECK, in the same migration:

```sql
ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN ('approve','reject','delete','dismiss_flags','ai_publish'));
```

### R2 structure

**Unchanged — no new R2 keys.** PDFs, Office files, images, and thumbnails keep their existing layout (`subjects/{subject}/{module-N|general}/{title}.ext`, thumbnails under `thumb_subjects/...`). Worth noting as a separate pre-existing issue, out of scope here: `document_storage_key()` has no uniqueness component, so two documents with the same title under one subject/module silently overwrite in R2.

---

## 3. Admin workflow

All writes go through FastAPI with `Depends(verify_admin)` — `admins` row **plus** AAL2 TOTP.

1. **Draft.** Either the admin presses *Generate* (Groq via the existing `llm.py` functions, `source='generated'`) or pastes JSON from ChatGPT/Gemini (`source='manual'`). Both land as `status='draft'` at `version = max(version) + 1`.
2. **Review and edit.** Admin sees the rendered draft, edits the JSON in a textarea, saves — a save creates a new draft version rather than mutating the old one, so history is intact.
3. **Publish.** `publish_ai_content` archives the current live row and promotes the chosen draft in one transaction, then writes an `ai_publish` audit entry.
4. **Rollback.** Publish an earlier version; the partial unique index guarantees only one stays live. Note the RPC as written matches `status = 'draft'`, so rollback to an *archived* version raises and rolls back — widen to `IN ('draft','archived')` if rollback is wanted in step 4, and short-circuit when the requested version is already published so the error message stays honest.
5. **Delete.** Drafts only. Published rows are archived, never deleted; `ON DELETE CASCADE` handles document deletion.

The same prompts `llm.py` already uses are the ones to paste into ChatGPT/Gemini — reuse `_GROUNDING` plus the per-task instruction text ([llm.py:356-444](backend/app/llm.py#L356-L444)) so manual and generated output are shaped alike. Surface the expected JSON schema in the admin UI via `_strict_schema()` output so a paste can't drift.

---

## 4. Student retrieval flow

**Summary — zero new fetches.** `resolveDocument` in [frontend/src/app/subject/[subjectSlug]/document-view.tsx:23](frontend/src/app/subject/[subjectSlug]/document-view.tsx#L23) already selects `"*, document_analytics(...)"`. Extend that one constant:

```ts
const DOCUMENT_SELECT =
  "*, document_analytics(upvotes, view_count, download_count), document_ai_content(kind, payload, version)";
```

RLS returns only published rows, and the summary policy includes `anon` — which matters because that server component runs the **session-less browser client** from `lib/api/core.ts`. The summary arrives in the SSR'd HTML, so it is covered by the existing `pages` service-worker cache with no worker changes and is indexable.

**Flashcards/quiz — client-side, lazy.** `authenticated`-only, so they cannot come from the server component. Fetch with TanStack Query from a new `useDocumentStudySets(documentId, enabled)` hook, gated on panel-open using the pattern at [ProfileTabs.tsx:67-70](frontend/src/components/profile/ProfileTabs.tsx#L67-L70). Signed-out visitors get an empty state via the existing `requestAuthPrompt()` in `lib/auth-prompts.ts`.

**Offline caveat (follow-up, not increment 1).** `worker/index.ts` matches on file extension, so a PostgREST JSON read is invisible to it and falls into workbox's `cross-origin` bucket — NetworkFirst, **32 entries, 1-hour expiry**, LRU-thrashed. Reliable offline study sets need either a `CACHE_STUDY_SET` message in `worker/index.ts` or an IndexedDB mirror following the `portal_study_history` precedent. Note that `public/sw.js` and `worker-*.js` are committed build artifacts — changing the worker requires a rebuild and committing the regenerated bundle.

---

## 5. API routes

**There are no Next.js route handlers in this repo** — `frontend/src/**/route.ts` returns zero files, and `middleware.ts` is `src/proxy.ts` under Next 16.2.7. The API is the FastAPI service, which already holds the R2 credentials, the service-role Supabase key, `verify_admin` with AAL2, SlowAPI limits, and audit logging. Adding Next.js routes would mean copying the service-role key into Vercel and reimplementing the AAL2 gate. **New endpoints go in FastAPI.**

New file `backend/app/routers/ai_content.py`, mounted in `main.py` at prefix `/api/v1/documents` (keeps [documents.py](backend/app/routers/documents.py) from growing past 900 lines). All admin-only, all `Request`-first for SlowAPI, house error style from `update_document_status`:

| Method | Path | Limit | Purpose |
| --- | --- | --- | --- |
| `GET` | `/{document_id}/ai-content` | 30/min | All versions incl. drafts, for the admin panel |
| `POST` | `/{document_id}/ai-content/generate` | 10/min | Groq draft via `llm.summarise_document` etc. |
| `PUT` | `/{document_id}/ai-content` | 20/min | Create a draft from pasted JSON |
| `POST` | `/{document_id}/ai-content/publish` | 20/min | `publish_ai_content` RPC + audit entry |
| `DELETE` | `/{document_id}/ai-content/{version}` | 20/min | Drafts only |

Declaration order: keep these after the existing `/{document_id}/status` and `/bulk-status` handlers and verify `/bulk-status` still resolves — FastAPI matches in declaration order, and that route only works today because the path shapes differ.

Student reads use no endpoint at all — client-direct PostgREST under RLS, matching the documented split-access model.

### Security considerations

1. **Re-validate every pasted payload server-side with the existing Pydantic models** — `DocumentSummary`, `FlashcardSet`, `QuizSet` from `llm.py`. This is the main reuse win: the same `@model_validator` that range-checks `correct_index` against `len(options)` ([llm.py:100-112](backend/app/llm.py#L100-L112)) then guards human paste too. Never trust client-supplied shape.
2. **Cap payload size before insert** — reject bodies over ~64 KB, and cap array lengths (e.g. ≤50 flashcards, ≤30 questions). Nothing else bounds a pasted blob, and it lands in the SSR'd HTML.
3. **No client write path exists** — no INSERT/UPDATE policy plus an explicit `REVOKE`. This is what closes the student-authored-summary hole, and it's why the four `documents.ai_*` columns should not be created.
4. **AAL2 on every write** via `Depends(verify_admin)`. Backend handlers bypass RLS entirely (service-role key), so this dependency *is* the authorization boundary — there is no defence in depth from Postgres.
5. **Drafts never reach a client** — enforced in the RLS `USING` clause, not in application filters.
6. **Render as text, never `dangerouslySetInnerHTML`.** React escapes by default; the risk is someone reaching for a markdown renderer for the summary later. Sanitize if that happens.
7. **Quiz answers are readable by any signed-in student** through PostgREST. Acceptable for self-study and consistent with the existing design. If graded quizzes ever matter, split answers into their own row or grade through a `SECURITY DEFINER` RPC — not now.
8. **Extend the `admin_audit_log` CHECK** before logging `ai_publish`.

---

## 6. Ordered implementation plan

Each step is independently shippable. Nothing consumes AI content today, so steps 1–4 are invisible to students.

**Step 0 — Confirm the untracked migrations are unapplied.** `supabase migration list` against the linked remote. If `20260823000000`/`20260823000100` are already applied, do not rewrite them — add a corrective migration instead. There is no local stack, so syntax-check offline with `pglast` before pushing.

**Step 1 — Migration.** Write `supabase/migrations/20260823000000_document_ai_content.sql` with the table, partial unique index, two read policies, grants, `publish_ai_content`, and the `admin_audit_log` CHECK extension. Delete `20260823000100_document_study_sets.sql`. Push.

**Step 2 — Backend router.** New `backend/app/routers/ai_content.py` with the five endpoints; mount in `main.py`. Reuse `verify_admin` from `app/auth.py`, `supabase` from `app/db.py`, and the three `llm.py` Pydantic models for validation. Add `backend/tests/test_ai_content.py` following the offline-stub style of `test_llm.py`.

**Step 3 — Types.** Hand-add `document_ai_content` (Row/Insert/Update) to `frontend/src/app/lib/database.types.ts` — it is hand-maintained, and frontend writes won't compile otherwise. Add a `DocumentAiContent` alias and extend `DocumentWithAnalytics` in `frontend/src/app/lib/document-types.ts`, following the `last_page?` precedent.

**Step 4 — Admin UI.** New `frontend/src/app/lib/api/ai-content.ts` following `moderation.ts` exactly (axios `api` from `core.ts`, same catch/rethrow block). Add an AI panel to the moderation inbox at `frontend/src/app/subject/admin/inbox/page.tsx` — a Radix `Dialog` per the existing reject/flag modals, raw `useState` forms (this repo has zod and react-hook-form installed but entirely unused; don't introduce them here). Generate / paste / preview / publish, with `queryClient.setQueryData` after mutations since `QueryProvider` sets `refetchOnMount: false`.

**Step 5 — Student summary.** Extend `DOCUMENT_SELECT` in `document-view.tsx` and render a summary card as a **sibling** of `CommentSection` in the `flex flex-col gap-6` block at `document-view.tsx:157-168`. Do not touch the 833-line `PDFViewerClient.tsx`.

**Step 6 — Flashcards and quiz (next increment).** Same table, same endpoints, no migration. Add `useDocumentStudySets`, a lazy-loaded panel, and the hand-rolled tab strip pattern from `ProfileTabs.tsx`. Then decide on the service-worker/IndexedDB question above.

---

## 7. Verification

- **Migration:** `pglast` parse offline, then `supabase db push`. Confirm in SQL: inserting two `status='published'` rows for one `(document_id, kind)` violates `document_ai_content_one_published_idx`; a draft row is invisible to an `anon` and an `authenticated` select; `INSERT` as `authenticated` is denied.
- **Backend:** `cd backend && python -m pytest tests -q` with `.env` loaded (bare `pytest` crashes at import). **Baseline is 2 pre-existing `test_auth` AAL2 failures** — anything beyond that is new. Note CI only runs `compileall`, so tests must be run locally.
- **Frontend:** `npm run lint` (never blanket `eslint --fix`) and `npm run build`.
- **End-to-end, with the app running** (`uvicorn app.main:app --reload --port 8000` + `npm run dev`): as an AAL2 admin at `/subject/admin/inbox`, generate a summary draft on an approved document, edit it, publish it, then confirm rollback restores the earlier version and only one row is `published`. Verify an `ai_publish` row appears in `admin_audit_log`.
- **Student view:** load the document page **signed out** and confirm the summary is present in view-source (proving it came through SSR and the anon policy). Confirm a draft-only document shows no summary. Confirm an unauthenticated PostgREST read of `document_ai_content?kind=eq.quiz` returns zero rows.
- **Negative checks:** paste a quiz with `correct_index` out of range → 422 from the existing validator; paste a 1 MB payload → rejected by the size cap; call any write endpoint with an AAL1 admin token → 403.
