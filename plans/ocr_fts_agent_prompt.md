# Agent Prompt: Extend FTS to Cover Image-Only / Scanned Files via OCR

## Your role and context

You are working on an academic document portal. The backend is **FastAPI** (Python), the database is **Supabase** (PostgreSQL), and files are stored in **Cloudflare R2**. The frontend is **Next.js**.

The project root is at `c:\Users\raydi\Downloads\academic-portal`.

---

## What has already been built (do NOT rebuild or duplicate)

### Database — already applied to production
Migration `supabase/migrations/20260822000003_document_content_search.sql` has already been applied. It added:
```sql
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_text text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(content_text, ''))) STORED;
CREATE INDEX IF NOT EXISTS documents_content_tsv_idx ON public.documents USING gin (content_tsv);
```
**Do not create a new migration for these columns — they already exist in production.**

### Backend text extraction — already works for text-based files
`backend/app/file_types.py` already has an `extract_text(spec, data)` function (line 160–175).  
- For `spec.kind == "text"` (.txt, .md): decodes bytes as UTF-8.  
- For `spec.kind == "pdf"`: uses PyMuPDF (`fitz`) — `page.get_text("text")` across all pages.  
- Returns `None` for `kind == "image"` and `kind == "office"`.  
- Caps output at `MAX_EXTRACTED_TEXT_CHARS = 500_000` characters.

### Upload pipeline — already calls extract_text
`backend/app/routers/documents.py` in `validate_and_store_upload()` (line 168):
- Line 225: `content_text = await asyncio.to_thread(extract_text, spec, file_bytes)` — already called.
- The result is stored in `content_text` on the DB row at insert time.

### Search — already queries content_tsv
`_apply_text_filter()` in `documents.py` (line 479) already ORs `content_tsv.fts(english)` alongside the `fts` (title/subject) column. Content FTS is live for files that have text.

### Backfill script — already exists
`backend/scripts/backfill_document_text.py` downloads R2 files and calls `extract_text` to populate `content_text` for existing rows. It skips `spec.kind not in {"pdf", "text"}`.

### Installed dependencies
`backend/requirements.txt` includes `PyMuPDF>=1.23.0`. **No OCR library is currently installed.**

---

## The gap you must close

**Problem:** For image-only PDFs (scanned lecture slides) and image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`), `extract_text` currently returns `""` (for PDFs with no text layer) or `None` (for images). These files get `content_text = NULL` and are invisible to FTS.

**Solution:** Add an OCR fallback using **`pytesseract`** (wraps Tesseract) + **`Pillow`** for image handling, triggered when direct extraction yields no meaningful text.

---

## Exact changes required

> **IMPORTANT constraints — read before writing a single line:**
> - Do NOT touch the migration files. No new SQL columns are needed.
> - Do NOT change the search endpoint or `_apply_text_filter` — they already handle `content_tsv`.
> - Do NOT change the upload endpoint call site — it already calls `extract_text` and stores the result.
> - Do NOT break the existing `extract_text` contract for text-based PDFs and plain-text files.
> - All OCR must happen inside `asyncio.to_thread(...)` — never block the event loop.
> - The existing character cap (`MAX_EXTRACTED_TEXT_CHARS = 500_000`) must still apply to OCR output.
> - Keep OCR failures non-fatal: if Tesseract is not installed or errors, fall back to `None` and log a warning — same pattern as the existing extraction warning at line 226–228 of `documents.py`.

---

### 1. `backend/requirements.txt`

Add two new dependencies after the PyMuPDF line:
```
pytesseract>=0.3.10
Pillow>=10.0.0
```
**Note:** `pytesseract` requires the **Tesseract binary** to be installed on the server OS. Document this as a prerequisite in a comment above the line. The agent deploying the server must run `apt-get install tesseract-ocr` (Linux) or the equivalent. You do NOT need to install or configure Tesseract itself — only add the pip dependency and a comment.

---

### 2. `backend/app/file_types.py`

Modify **only the `extract_text` function** (lines 160–175). The rest of the file must remain untouched.

**Current behaviour:**
- `kind == "text"` → decode UTF-8
- `kind == "pdf"` → PyMuPDF extract, no OCR fallback
- anything else → return `None`

**New behaviour:**
- `kind == "text"` → unchanged
- `kind == "pdf"` → PyMuPDF extract first; if result is sparse (see threshold below), run OCR page-by-page as fallback
- `kind == "image"` → run OCR directly on the image bytes
- `kind == "office"` → still return `None` (unchanged)

**Sparseness threshold for PDF pages:** if the total extracted text across all pages has fewer than **50 meaningful characters** (strip whitespace before counting), treat it as image-only and fall back to OCR.

**OCR implementation detail for PDFs:** render each page to a pixmap via `page.get_pixmap(dpi=150)` then convert to a PIL `Image` via `Image.frombytes("RGB", [pix.width, pix.height], pix.samples)`, then run `pytesseract.image_to_string(img, lang="eng")`. Join all pages with `"\n"`.

**OCR implementation detail for images:** open the bytes directly with `PIL.Image.open(io.BytesIO(data))`, then run `pytesseract.image_to_string(img, lang="eng")`.

**Import guard:** wrap `import pytesseract` and `from PIL import Image` inside the function body (lazy import), so that the rest of the module still loads even if Pillow/pytesseract are not installed (the OCR branch will then raise `ImportError`, which is caught by the caller).

**Return:** always `text[:max_chars]` — the cap must apply to OCR output too.

---

### 3. `backend/scripts/backfill_document_text.py`

The backfill script currently skips rows where `spec.kind not in {"pdf", "text"}` (line 37). This means image files already approved in the DB will never get their text backfilled.

Change the skip condition so that image files (`spec.kind == "image"`) are also processed. The `extract_text` function will now handle them via OCR, so no other change to the script is needed — the call at line 44 is already correct.

Specifically, change:
```python
if not key or spec is None or spec.kind not in {"pdf", "text"}:
```
to:
```python
if not key or spec is None or spec.kind not in {"pdf", "text", "image"}:
```

---

## What you must NOT change

- `supabase/migrations/` — no new migration file needed.
- `backend/app/routers/documents.py` — already complete for this feature.
- `frontend/` — search UI already renders content matches.
- Any other file not mentioned above.

---

## Verification steps

After making the changes, verify the following (do not skip any):

1. **Import safety:** `python -c "from app.file_types import extract_text, spec_for_filename"` from `backend/` must succeed even if `pytesseract` is not installed — the ImportError must not propagate at module import time.

2. **Text-based PDF regression:** call `extract_text` on a real text PDF (any digitally-created PDF). It must still return readable text without going through OCR.

3. **OCR path for image PDF:** create a test with a one-page PDF that has no text layer (a `%PDF` wrapping a JPEG image). `extract_text` must return a non-empty string if Tesseract is installed, or `""` / `None` with a logged warning if it is not.

4. **OCR path for image file:** call `extract_text` with `spec_for_filename("test.png")` and a real PNG of printed text. Should return OCR'd text.

5. **Backfill script dry run:** `python -m scripts.backfill_document_text --limit 0` from `backend/` must import without error.

6. **Whole-project regression gate** (from `plans/feature-implementation-plan.md`):
   ```bash
   cd backend && python -m pytest tests -q
   # Expected baseline: 12 passed, 2 pre-existing auth failures — do NOT treat those 2 as regressions.
   cd ../frontend && npm run lint && npm run build
   ```

---

## Key codebase pointers

| File | Lines of interest |
|---|---|
| [`backend/app/file_types.py`](../backend/app/file_types.py) | 160–175 `extract_text`, 24–63 `FileSpec` / `ALLOWED_FILE_TYPES` |
| [`backend/app/routers/documents.py`](../backend/app/routers/documents.py) | 224–228 extraction call, 479–493 `_apply_text_filter` |
| [`backend/scripts/backfill_document_text.py`](../backend/scripts/backfill_document_text.py) | 37 skip condition, 44 extraction call |
| [`backend/requirements.txt`](../backend/requirements.txt) | 24 PyMuPDF line (add below it) |
| [`supabase/migrations/20260822000003_document_content_search.sql`](../supabase/migrations/20260822000003_document_content_search.sql) | Already applied — read only, do not modify |
