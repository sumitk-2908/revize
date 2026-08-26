# Implementation Plan: Functional OCR Search via Managed OCR API (Async)

Supersedes [`ocr_fts_agent_prompt.md`](./ocr_fts_agent_prompt.md), which specified inline Tesseract OCR. That plan was implemented and measured; the measurements are why this one replaces it.

---

## Context

Content search over scanned documents is half-built and, as built, not fit for everyday users:

- **OCR runs inline during upload.** Measured in a 0.5-CPU/512MB container (a Render Starter instance's shape), a dense A4 page costs **5.5s**, so the current 4-page cap means a student waits **~22s** on upload — and two concurrent uploads roughly double each other's time on a shared half-core.
- **That wait buys nothing.** Uploads land as `status: "pending"` ([`documents.py:345`](../backend/app/routers/documents.py#L345)) and search only returns `status = "approved"` ([`documents.py:519`](../backend/app/routers/documents.py#L519)). A human admin sits in between, taking hours or days. The extracted text is not needed until approval.
- **Tesseract cannot read half the corpus.** `DSD MOD-1` (a phone photo of cursive notes) scores **37.9** mean confidence against **90.2** for the printed `DM Syllabus`. Uploads are a genuine mix of handwritten and printed, so self-hosted Tesseract would silently skip roughly half of them.
- **It is also the most expensive option to run.** Tesseract needs a Docker runtime switch (Render's native runtime ships `imagemagick` and `ghostscript` but no OCR engine) plus a second service, because 5.5s/page of pegged CPU starves the web service.

**Intended outcome:** OCR moves off the request path and off our CPU. Google Cloud Vision `DOCUMENT_TEXT_DETECTION` reads handwriting, needs no Docker switch, and adds **no new pip dependency** (`httpx` is already used in [`auth.py:3`](../backend/app/auth.py#L3); PyMuPDF already renders pages). Verified pricing: first **1,000 pages/month free**, then **$1.50/1000**, one unit per PDF page — free at this portal's volume. Uploads stay instant, and a document is searchable by the time an admin approves it.

---

## Step 0 — Spike first, and continue only if it passes (GATE)

The feature rests on one unproven assumption: that Vision reads *these* scans. Prove it before refactoring anything.

Throwaway script outside the repo, API key in a local env var:

1. Fetch documents **id=6** (handwritten, 20pp) and **id=7** (printed, 3pp) using `download_from_r2` + `key_from_public_url` ([`storage.py`](../backend/app/storage.py)).
2. Render pages with the existing PyMuPDF pattern — `page.get_pixmap(dpi=150).tobytes("jpeg")`. **No Pillow required**: PyMuPDF emits JPEG bytes directly, and uploaded images are sent as-is.
3. `POST https://vision.googleapis.com/v1/images:annotate` with `features: [{type: DOCUMENT_TEXT_DETECTION}]`, `imageContext.languageHints: ["en"]`, base64 `image.content`.
4. Record per document: text length, word count, a readable sample, per-page confidence, latency, units consumed.

**Confirm during the spike** (Google's docs were timing out while planning, so these are unverified): max images per batch call (expected ~16), max image size, whether an **API key** is accepted for `images:annotate` or a service account is required, and the exact confidence field path inside `fullTextAnnotation`.

**Gate:** if id=6's handwriting does not come back substantially readable, **stop and revert the OCR work**. This is the "otherwise I do not want this feature added" branch, and it costs half an hour here instead of a full refactor. The spike also sets the confidence threshold empirically — do **not** port Tesseract's `60.0`, since Vision's scale is 0–1 and its handwriting behaviour differs.

---

## Step 1 — `backend/app/ocr.py` (new)

Self-contained Vision client, following [`storage.py`](../backend/app/storage.py)'s "one module owns one external service" shape.

- Add `GOOGLE_VISION_API_KEY: str | None = None` to [`config.py`](../backend/app/config.py) — same optional-third-party-key precedent as `SENTRY_DSN` at line 22.
- `async def ocr_file(spec, data) -> str | None` — renders PDF pages (`_OCR_DPI = 150` moves here), passes image bytes through untouched, batches pages per call, uses `httpx.AsyncClient` as in [`auth.py:21`](../backend/app/auth.py#L21).
- Keep the two guards already validated as necessary: the `MAX_EXTRACTED_TEXT_CHARS` cap, and a **low** confidence floor as noise insurance (threshold from Step 0).
- `MAX_OCR_PAGES = 30`. The binding constraint is now **cost, not latency** — one unit per page — so this is far higher than the old 4-page latency gate. Log when a document is truncated.
- **Return `None` when the key is unset or the call fails.** The feature ships dark and is enabled by setting one env var; every other code path is unaffected. Same graceful-degradation contract as the current OCR code.

## Step 2 — Simplify [`backend/app/file_types.py`](../backend/app/file_types.py)

Delete `_ocr_page`, `_ocr_pdf`, `_ocr_image`, `_MIN_OCR_CONFIDENCE`, `_MAX_INLINE_OCR_PAGES`, `_OCR_DPI`, and `extract_text`'s `max_ocr_pages` parameter. `extract_text` reverts to the fast, synchronous text-layer path it had before.

Keep `_MIN_PDF_TEXT_LAYER_CHARS = 50` and expose `def needs_ocr(spec, text) -> bool` — the sparse-text-layer decision is still needed, just at the trigger site now.

## Step 3 — Trigger OCR when a document becomes approved

Approval is the correct seam: only approved documents are searchable, so rejected uploads never consume a paid unit.

- `async def ocr_document_by_id(document_id)` in `ocr.py`: re-download from R2, call `ocr_file`, write `content_text` and `ocr_attempted_at`. This reuses exactly the path [`backfill_document_text.py`](../backend/scripts/backfill_document_text.py) already uses.
- Fire it via FastAPI `BackgroundTasks` from `update_document_status` ([`documents.py:557`](../backend/app/routers/documents.py#L557)) when the new status is `approved`, and from the upload path when an admin uploads directly at `status: "approved"` ([`documents.py:371`](../backend/app/routers/documents.py#L371)). The HTTP response returns before OCR runs.
- **Deliberately not** from `bulk_update_document_status` ([`documents.py:642`](../backend/app/routers/documents.py#L642)) — approving 50 documents must not spawn 50 concurrent OCR jobs. Bulk approvals are collected by Step 5 instead.
- Guard: skip unless `needs_ocr` is true and `ocr_attempted_at IS NULL`.

## Step 4 — Migration: `supabase/migrations/<timestamp>_document_ocr_state.sql`

```sql
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ocr_attempted_at timestamptz;
```

**This column is a cost control, not bookkeeping.** Without it, a document Vision cannot read stays blank and is retried by every scheduled run — a 20-page scan retried daily is 600 units/month, consuming most of the free tier on its own. Nulling the column is also the manual "retry this one" lever.

Two project-specific requirements:

- Local verification is unavailable (no local stack; the linked remote is the real DB). **Syntax-check offline with `pglast`**, then apply remotely.
- Supabase types are **hand-maintained**: add `ocr_attempted_at` to all three blocks (`Row` / `Insert` / `Update`) in [`frontend/src/app/lib/database.types.ts`](../frontend/src/app/lib/database.types.ts#L280), or frontend writes stop compiling.

## Step 5 — Backfill script becomes the scheduled safety net

[`backfill_document_text.py`](../backend/scripts/backfill_document_text.py) is already correct in shape. Keep the hard-won `_UNPOPULATED` filter (`content_text.is.null,content_text.match.^[[:space:]]*$` — plain `eq.` misses whitespace-only rows, which is exactly what the pre-OCR extractor left behind, and was confirmed against the live PostgREST). Changes:

- Add `AND ocr_attempted_at IS NULL` to the selection.
- Route through `ocr_file`; drop the now-meaningless `max_ocr_pages=None` argument.
- Schedule on Render — **hourly is ample**, since it only catches bulk approvals, instance restarts and transient API failures. Runs as a cron on the native Python runtime; no Docker needed. *Render's cron billing model could not be verified while planning — confirm before scheduling.*

## Step 6 — Remove the superseded Tesseract route

Delete `backend/Dockerfile` and `backend/.dockerignore`; drop `pytesseract` and `Pillow` from [`requirements.txt`](../backend/requirements.txt) along with the Tesseract prerequisite comment. **Render stays on its native Python runtime**, which removes the riskiest deploy step. Net dependency change for this feature: zero.

---

## Verification

1. **Step 0 gate** — id=6 and id=7 both return readable text, with confidence and latency recorded. Everything downstream depends on this.
2. **Unit tests** — add `backend/tests/test_ocr.py` with a **stubbed `httpx`** response (no network, no key, CI-safe): batching, char cap, page cap, confidence rejection, and `None` when the key is unset. Mirrors the 32-check ad-hoc suite already validated for the Tesseract path.
3. **Feature-flag-off regression** — with `GOOGLE_VISION_API_KEY` unset, uploads and search behave exactly as they do today.
4. **End-to-end** — upload a scanned PDF as a student (confirm the response is **fast**, with no OCR wait), approve as admin, then confirm the document is returned by a content-term search through `/search`.
5. **Cost** — after the end-to-end run, check units consumed in the GCP console, and confirm a second scheduled run does **not** re-bill the same document (proves Step 4 works).
6. **Whole-project regression gate** —
   ```bash
   cd backend && python -m pytest tests -q
   # Baseline: 2 pre-existing test_auth AAL2 failures. Needs .env loaded or it crashes at import.
   cd ../frontend && npm run lint && npm run build
   ```

---

## Decisions recorded

| Decision | Why |
|---|---|
| Async over inline | Admin approval already sits between upload and searchability, so inline OCR adds ~22s of latency for zero user-visible gain. |
| Managed API over self-hosted Tesseract | Handwriting is roughly half the corpus and Tesseract fails it (37.9 vs 90.2 confidence). Also removes the Docker switch, the second service, and all CPU contention. |
| Third-party processing accepted | Confirmed with the project owner: page images may be sent to an external OCR provider. |
| Approval-time trigger over upload-time | Rejected uploads never consume paid units. |
| Dockerfile / `.dockerignore` deleted | Superseded. The Tesseract route stays documented here as the fallback if the third-party dependency ever becomes unacceptable. |
