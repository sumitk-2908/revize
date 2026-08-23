"""Admin-only writes for curated AI study content.

The split here is deliberate and mirrors the rest of the portal: **writes go
through FastAPI, reads go client-direct through PostgREST under RLS.** Nothing in
this module serves students. They read `document_ai_content` themselves, and the
two SELECT policies in 20260823000000_document_ai_content.sql restrict that to
`status = 'published'` on an approved document, so a draft cannot reach a client
even by accident.

Writes cannot be client-direct, because the table has no INSERT/UPDATE/DELETE
policy and an explicit REVOKE. That is the point: it is what stops a student
PostgREST-inserting a pending document carrying a self-authored summary, which
the earlier `documents.ai_*` column design could not prevent.

Because every handler here holds the service-role key and therefore bypasses RLS
entirely, `Depends(verify_admin)` — an `admins` row *plus* AAL2 TOTP — **is** the
authorization boundary. There is no defence in depth from Postgres on this path.
"""

import json
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError
from slowapi import Limiter

from app import llm
from app.auth import verify_admin
from app.config import settings
from app.db import supabase

router = APIRouter()


def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host or "unknown"


limiter = Limiter(key_func=get_real_ip)


# ---------------------------------------------------------------------------
# Caps
# ---------------------------------------------------------------------------
# A generated payload is bounded by max_completion_tokens (~6,200 tokens across
# the three kinds, so 20-25 KB of JSON). A *pasted* one is bounded by nothing at
# all, and a published summary lands in the SSR'd HTML of the document page — so
# these caps are page weight as much as storage.
MAX_PAYLOAD_BYTES = 64 * 1024

# The array field each kind carries, and how many entries it may hold. Generous
# against the prompts (3-6 key points, 8-12 cards, 5-8 questions) so a human
# curating a long document is not fighting the limit.
_ARRAY_CAPS: dict[str, tuple[str, int]] = {
    "summary": ("key_points", 25),
    "flashcards": ("cards", 50),
    "quiz": ("questions", 30),
}

# The same predicate scripts/backfill_document_text.py uses. "No usable text" has
# to mean NULL *or* whitespace-only: the text-only extractor that predates OCR
# stored the empty text layer of a scanned PDF verbatim, leaving rows holding a
# couple of stray newlines that `is.null` misses.
_UNPOPULATED_TEXT = "content_text.is.null,content_text.match.^[[:space:]]*$"


class AiKind(str, Enum):
    summary = "summary"
    flashcards = "flashcards"
    quiz = "quiz"


class GenerateAiContentPayload(BaseModel):
    kind: AiKind


class DraftAiContentPayload(BaseModel):
    kind: AiKind
    payload: dict[str, Any]
    # Which external model produced the paste, e.g. "gemini-2.5-pro". Free text
    # because it is provenance for a human, not something we dispatch on.
    model: Optional[str] = None


class PublishAiContentPayload(BaseModel):
    kind: AiKind
    version: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _document_or_404(document_id: int, columns: str) -> dict:
    response = (
        supabase.table("documents")
        .select(columns)
        .eq("id", document_id)
        .limit(1)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found.")
    return rows[0]


def _has_content_text(document_id: int) -> bool:
    """Whether this document has text worth sending to a model.

    Asked as a count rather than by selecting `content_text`, which
    `app.file_types.MAX_EXTRACTED_TEXT_CHARS` caps at 500,000 characters — half a
    megabyte over the wire to answer a boolean the admin panel uses to decide
    whether *Generate* is even offered.
    """
    response = (
        supabase.table("documents")
        .select("id", count="exact")
        .eq("id", document_id)
        .or_(_UNPOPULATED_TEXT)
        .execute()
    )
    return not (response.count or 0)


def _validated_payload(kind: str, payload: Any) -> dict:
    """Re-validate a client-supplied payload with the model the LLM path uses.

    This is the main reuse win of keeping the shapes in `app.llm`: the same
    `@model_validator` that rejects a generated quiz whose `correct_index` points
    past its options rejects a pasted one too. Client-supplied shape is never
    trusted, and `model_dump()` on the way out means keys outside the schema are
    stripped rather than stored.
    """
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large. The maximum is {MAX_PAYLOAD_BYTES // 1024} KB.",
        )

    field, cap = _ARRAY_CAPS[kind]
    items = payload.get(field)
    if isinstance(items, list) and len(items) > cap:
        raise HTTPException(
            status_code=422,
            detail=f"Too many entries: {field} holds {len(items)}, the maximum is {cap}.",
        )

    try:
        return llm.model_for(kind).model_validate(payload).model_dump()
    except ValidationError as error:
        # Spelled out rather than summarised: this is an admin-only endpoint and
        # "questions.0.correct_index: correct_index 9 is outside the 4 options
        # provided" is the difference between fixing the paste and guessing.
        problems = "; ".join(
            f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
            for issue in error.errors()
        )
        raise HTTPException(status_code=422, detail=f"Invalid {kind} payload — {problems}")


def _is_unique_violation(error: Exception) -> bool:
    return getattr(error, "code", None) == "23505" or "23505" in str(error)


def _next_version(document_id: int, kind: str) -> int:
    response = (
        supabase.table("document_ai_content")
        .select("version")
        .eq("document_id", document_id)
        .eq("kind", kind)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    return rows[0]["version"] + 1 if rows else 1


def _insert_draft(
    document_id: int,
    kind: str,
    payload: dict,
    *,
    source: str,
    model: Optional[str],
    admin_id: Optional[str],
) -> dict:
    """Insert a new draft at the next free version.

    Editing a draft goes through here too: a save creates a new version rather
    than mutating the old one, so the history an admin reviewed stays intact and
    a rollback has something to roll back to.

    Two admins drafting the same artifact in the same moment would compute the
    same next version, which `document_ai_content_version_key` rejects. One retry
    settles it, because the loser now reads the winner's row.
    """
    last_error: Optional[Exception] = None

    for attempt in range(2):
        row = {
            "document_id": document_id,
            "kind": kind,
            "version": _next_version(document_id, kind),
            "payload": payload,
            "status": "draft",
            "source": source,
            "model": model,
            "created_by": admin_id,
        }
        try:
            response = supabase.table("document_ai_content").insert(row).execute()
        except Exception as error:
            if attempt == 0 and _is_unique_violation(error):
                last_error = error
                continue
            raise

        rows = response.data if isinstance(response.data, list) else []
        if not rows:
            raise HTTPException(status_code=500, detail="Draft insert returned no row.")
        return rows[0]

    raise HTTPException(
        status_code=409,
        detail="Another admin just created a draft for this artifact. Reload and try again.",
    ) from last_error


def _internal_error(action: str, error: Exception) -> HTTPException:
    import traceback

    traceback.print_exc()
    detail = f"Failed to {action}: {error}" if settings.DEBUG else "An internal error occurred."
    return HTTPException(status_code=500, detail=detail)


# ---------------------------------------------------------------------------
# Read (admin panel)
# ---------------------------------------------------------------------------


@router.get("/{document_id}/ai-content")
@limiter.limit("30/minute")
async def list_ai_content(
    request: Request,
    document_id: int,
    admin_user: dict = Depends(verify_admin),
):
    """Every version of every kind for one document, drafts included.

    Drafts are readable here and nowhere else — the RLS policies exclude them, so
    this service-role read is the only way to see one.
    """
    try:
        document = _document_or_404(document_id, "id, title, status")
        title = document.get("title")

        response = (
            supabase.table("document_ai_content")
            .select(
                "id, kind, version, status, source, model, payload, "
                "created_at, published_at, created_by, reviewed_by"
            )
            .eq("document_id", document_id)
            .order("kind")
            .order("version", desc=True)
            .execute()
        )

        return {
            "document": {
                "id": document_id,
                "title": title,
                "status": document.get("status"),
                "has_content_text": _has_content_text(document_id),
            },
            "llm_configured": llm.is_configured(),
            "versions": response.data or [],
            # What the manual path needs, per kind: the prompt to paste into
            # ChatGPT or Gemini next to the file itself, and the schema the reply
            # has to satisfy. Both come from app.llm so the two paths cannot
            # drift apart.
            "kinds": {
                kind: {
                    "prompt": llm.manual_prompt(kind, title=title),
                    "schema": llm.schema_for(kind),
                }
                for kind in llm.KINDS
            },
        }
    except HTTPException:
        raise
    except Exception as error:
        raise _internal_error("load AI content", error)


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------


@router.post("/{document_id}/ai-content/generate")
@limiter.limit("10/minute")
async def generate_ai_content(
    request: Request,
    document_id: int,
    payload: GenerateAiContentPayload,
    admin_user: dict = Depends(verify_admin),
):
    """Draft one artifact with Groq. Lands as `status='draft'`, never published."""
    try:
        if not llm.is_configured():
            raise HTTPException(
                status_code=503,
                detail="No LLM provider is configured. Paste content generated elsewhere instead.",
            )

        document = _document_or_404(document_id, "id, title, content_text")
        content_text = document.get("content_text") or ""
        if not content_text.strip():
            raise HTTPException(
                status_code=422,
                detail=(
                    "No searchable text was extracted from this document, so there is "
                    "nothing to send a model. Paste content generated from the file itself."
                ),
            )

        kind = payload.kind.value
        result = await llm.generate(kind, content_text, title=document.get("title"))
        if result is None:
            # Daily quota gone, provider trouble, or output that failed the same
            # validator a paste has to pass. All three are the manual path's cue,
            # which is why this is a plain failure and not a retry loop.
            raise HTTPException(
                status_code=502,
                detail=(
                    "The model returned no usable output — it may be out of quota for "
                    "today. Try again later, or paste content generated elsewhere."
                ),
            )

        row = _insert_draft(
            document_id,
            kind,
            result.data.model_dump(),
            source="generated",
            model=result.model,
            admin_id=admin_user.get("id"),
        )
        return {"message": f"Generated {kind} draft v{row['version']}.", "version": row}
    except HTTPException:
        raise
    except Exception as error:
        raise _internal_error("generate AI content", error)


@router.put("/{document_id}/ai-content")
@limiter.limit("20/minute")
async def create_ai_content_draft(
    request: Request,
    document_id: int,
    payload: DraftAiContentPayload,
    admin_user: dict = Depends(verify_admin),
):
    """Create a draft from pasted JSON, or save an edit to an existing draft."""
    try:
        _document_or_404(document_id, "id")
        kind = payload.kind.value
        row = _insert_draft(
            document_id,
            kind,
            _validated_payload(kind, payload.payload),
            source="manual",
            model=payload.model,
            admin_id=admin_user.get("id"),
        )
        return {"message": f"Saved {kind} draft v{row['version']}.", "version": row}
    except HTTPException:
        raise
    except Exception as error:
        raise _internal_error("save AI content draft", error)


# ---------------------------------------------------------------------------
# Publish and delete
# ---------------------------------------------------------------------------


@router.post("/{document_id}/ai-content/publish")
@limiter.limit("20/minute")
async def publish_ai_content(
    request: Request,
    document_id: int,
    payload: PublishAiContentPayload,
    admin_user: dict = Depends(verify_admin),
):
    """Promote one version to live, archiving whatever was live, in one transaction.

    Rollback is the same call with an earlier version — the RPC accepts archived
    rows as well as drafts, and `document_ai_content_one_published_idx` guarantees
    only one survives either way.
    """
    try:
        _document_or_404(document_id, "id")
        kind = payload.kind.value

        # Checked here so a typo gets a clean 404 instead of a 500 carrying the
        # RPC's RAISE. The RPC repeats the check and stays the authority.
        existing = (
            supabase.table("document_ai_content")
            .select("id")
            .eq("document_id", document_id)
            .eq("kind", kind)
            .eq("version", payload.version)
            .limit(1)
            .execute()
        )
        if not (existing.data if isinstance(existing.data, list) else []):
            raise HTTPException(
                status_code=404,
                detail=f"No {kind} version {payload.version} exists for this document.",
            )

        admin_id = admin_user.get("id")
        rpc_response = supabase.rpc(
            "publish_ai_content",
            {
                "p_document_id": document_id,
                "p_kind": kind,
                "p_version": payload.version,
                "p_admin_id": admin_id,
            },
        ).execute()

        row = rpc_response.data
        if isinstance(row, list):
            row = row[0] if row else None
        if not row:
            raise HTTPException(status_code=500, detail="Publish returned no row.")

        supabase.table("admin_audit_log").insert(
            {
                "admin_id": admin_id,
                "action": "ai_publish",
                "target_id": document_id,
                "metadata": {"kind": kind, "version": payload.version},
            }
        ).execute()

        return {"message": f"Published {kind} v{payload.version}.", "version": row}
    except HTTPException:
        raise
    except Exception as error:
        raise _internal_error("publish AI content", error)


@router.delete("/{document_id}/ai-content/{version}")
@limiter.limit("20/minute")
async def delete_ai_content_draft(
    request: Request,
    document_id: int,
    version: int,
    kind: AiKind,
    admin_user: dict = Depends(verify_admin),
):
    """Delete one draft. `kind` is a required query parameter, because a version
    number alone does not identify a row — the key is (document, kind, version).

    Drafts only. A published row is archived by the next publish and kept as
    history; document deletion is handled by `ON DELETE CASCADE`.
    """
    try:
        _document_or_404(document_id, "id")

        response = (
            supabase.table("document_ai_content")
            .delete()
            .eq("document_id", document_id)
            .eq("kind", kind.value)
            .eq("version", version)
            .eq("status", "draft")
            .execute()
        )

        if not (response.data if isinstance(response.data, list) else []):
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No {kind.value} draft at version {version}. Published and archived "
                    "versions are kept as history and cannot be deleted."
                ),
            )

        return {
            "message": f"Deleted {kind.value} draft v{version}.",
            "document_id": document_id,
            "kind": kind.value,
            "version": version,
        }
    except HTTPException:
        raise
    except Exception as error:
        raise _internal_error("delete AI content draft", error)
