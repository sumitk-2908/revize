"""Populate searchable content for existing approved documents.

Run from the backend directory with the production Supabase and R2 environment
variables loaded. The script only updates approved documents whose content is
currently null, and skips legacy non-R2 URLs plus unsupported file types.
"""

import argparse
import asyncio
import os
from pathlib import Path

from app.file_types import extract_text, spec_for_filename
from app.storage import download_from_r2, key_from_public_url
from app.db import supabase


async def backfill(limit: int | None = None) -> tuple[int, int, int]:
    query = (
        supabase.table("documents")
        .select("id, file_url")
        .eq("status", "approved")
        .is_("content_text", "null")
        .order("id")
    )
    if limit is not None:
        query = query.limit(limit)

    rows = query.execute().data or []
    updated = skipped = failed = 0

    for row in rows:
        document_id = row["id"]
        file_url = row.get("file_url") or ""
        key = key_from_public_url(file_url)
        spec = spec_for_filename(Path(file_url.split("?", 1)[0]).name)
        if not key or spec is None or spec.kind not in {"pdf", "text"}:
            skipped += 1
            print(f"skip {document_id}: unsupported or non-R2 URL")
            continue

        try:
            data = await download_from_r2(key)
            content_text = await asyncio.to_thread(extract_text, spec, data)
            supabase.table("documents").update({"content_text": content_text}).eq("id", document_id).execute()
            updated += 1
            print(f"updated {document_id}")
        except Exception as error:
            failed += 1
            print(f"failed {document_id}: {error}")

    return updated, skipped, failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Only process the first N rows")
    args = parser.parse_args()
    updated, skipped, failed = asyncio.run(backfill(args.limit))
    print(f"Backfill complete: {updated} updated, {skipped} skipped, {failed} failed")


if __name__ == "__main__":
    main()
