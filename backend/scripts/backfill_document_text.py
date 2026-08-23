"""Populate searchable content for existing approved documents.

Run from the backend directory with the production Supabase and R2 environment
variables loaded. The script only updates approved documents whose content is
currently unpopulated, and skips legacy non-R2 URLs plus unsupported file types.

Rows that stay unpopulated — a scan Tesseract cannot read, or a host without
the binary installed — are picked up again by every later run, which is what
makes the job safe to re-run after installing OCR support. Nothing that already
holds real text is ever selected, so a re-run cannot overwrite good content.
"""

import argparse
import asyncio
import os
from pathlib import Path

from app.file_types import extract_text, spec_for_filename
from app.storage import download_from_r2, key_from_public_url
from app.db import supabase

# "Unpopulated" has to mean NULL *or* whitespace-only. The text-only extractor
# that ran before OCR existed stored the empty text layer of a scanned PDF
# verbatim, leaving rows holding a couple of stray newlines — which `is.null`
# misses, and which `content_text.eq.` (empty string) misses too. The POSIX
# regex is the only one of the three that matches them.
_UNPOPULATED = "content_text.is.null,content_text.match.^[[:space:]]*$"


async def backfill(limit: int | None = None, only_null: bool = False) -> tuple[int, int, int, int]:
    query = (
        supabase.table("documents")
        .select("id, file_url")
        .eq("status", "approved")
    )
    query = query.is_("content_text", "null") if only_null else query.or_(_UNPOPULATED)
    query = query.order("id")
    if limit is not None:
        query = query.limit(limit)

    rows = query.execute().data or []
    updated = empty = skipped = failed = 0

    for row in rows:
        document_id = row["id"]
        file_url = row.get("file_url") or ""
        key = key_from_public_url(file_url)
        spec = spec_for_filename(Path(file_url.split("?", 1)[0]).name)
        if not key or spec is None or spec.kind not in {"pdf", "text", "image"}:
            skipped += 1
            print(f"skip {document_id}: unsupported or non-R2 URL")
            continue

        try:
            data = await download_from_r2(key)
            # max_ocr_pages=None: nothing is waiting on this job, so a long
            # scan gets OCR'd in full here rather than skipped as it is on the
            # upload path.
            content_text = await asyncio.to_thread(extract_text, spec, data, max_ocr_pages=None)
            supabase.table("documents").update({"content_text": content_text}).eq("id", document_id).execute()
            if content_text and content_text.strip():
                updated += 1
                print(f"updated {document_id}: {len(content_text)} chars")
            else:
                # Not a failure: an unreadable scan, or a host with no
                # Tesseract. Stays unpopulated so a later run picks it up.
                empty += 1
                print(f"no text {document_id}: nothing readable, will be retried")
        except Exception as error:
            failed += 1
            print(f"failed {document_id}: {error}")

    return updated, empty, skipped, failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Only process the first N rows")
    parser.add_argument(
        "--only-null",
        action="store_true",
        help="Only revisit rows whose content is NULL, leaving whitespace-only scans alone",
    )
    args = parser.parse_args()
    updated, empty, skipped, failed = asyncio.run(backfill(args.limit, args.only_null))
    print(
        f"Backfill complete: {updated} updated, {empty} without readable text, "
        f"{skipped} skipped, {failed} failed"
    )


if __name__ == "__main__":
    main()
