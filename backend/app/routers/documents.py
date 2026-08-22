import os
import re
import asyncio
import fitz
import json
import base64
import hashlib
from enum import Enum
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, Request, Depends
from app.auth import verify_admin, verify_token, assert_aal2
from app.storage import upload_to_r2, delete_from_r2, key_from_public_url, document_storage_key
from app.config import settings
from app.file_types import (
    FileSpec,
    MAX_ANY_FILE_BYTES,
    allowed_extensions_label,
    extract_text,
    spec_for_filename,
    thumbnail_key_for,
    verify_magic_bytes,
    verify_payload,
)
from supabase import create_client, Client
from slowapi import Limiter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host or "unknown"

limiter = Limiter(key_func=get_real_ip)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Size caps are per-type and live in app.file_types.  They double as a memory
# guard on the (tiny) Render free-tier instance, since the whole payload is
# buffered before boto3 ships it — see `read_capped` below, which aborts an
# oversized upload mid-stream rather than materializing all of it first.
#
# Longest edge, in pixels, of a generated thumbnail.
THUMBNAIL_MAX_EDGE = 600

# Chunk size for the capped streaming read.
UPLOAD_CHUNK_BYTES = 1024 * 1024

from app.db import supabase


class DocCategory(str, Enum):
    notes = "notes"
    pyq = "pyq"
    syllabus = "syllabus"
    tutorial_sheet = "tutorial_sheet"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_pdf_metadata(file_bytes: bytes):
    """
    Synchronous, CPU-bound task isolated here so it can be run in a
    background thread without blocking FastAPI's event loop.
    Returns (page_count, thumbnail_jpeg_bytes).
    """
    pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
    page_count = len(pdf_document)
    first_page = pdf_document.load_page(0)
    pix = first_page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
    thumbnail_bytes = pix.tobytes("jpeg")
    return page_count, thumbnail_bytes


def render_image_thumbnail(file_bytes: bytes, ext: str) -> bytes:
    """
    Downscales an uploaded image to a card-sized JPEG thumbnail.
    Synchronous and CPU-bound, so callers run it via asyncio.to_thread.
    """
    image_doc = fitz.open(stream=file_bytes, filetype=ext)
    page = image_doc.load_page(0)
    longest_edge = max(page.rect.width, page.rect.height, 1)
    scale = min(1.0, THUMBNAIL_MAX_EDGE / longest_edge)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    if pix.alpha:
        # JPEG has no alpha channel; drop it or tobytes("jpeg") fails.
        pix = fitz.Pixmap(pix, 0)
    return pix.tobytes("jpeg")


async def read_capped(file: UploadFile, max_bytes: int, limit_label: str) -> bytes:
    """
    Reads an UploadFile in chunks, aborting as soon as `max_bytes` is exceeded.

    Starlette's UploadFile wraps a SpooledTemporaryFile, so reading in chunks
    keeps peak memory bounded by the cap rather than by the payload — a 2GB
    upload is rejected after the first chunk over the line instead of being
    fully materialized and then thrown away.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size for {limit_label} is {max_bytes // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def build_preview(spec: FileSpec, file_bytes: bytes) -> tuple[Optional[int], Optional[bytes]]:
    """
    Returns (page_count, thumbnail_jpeg_bytes) for an already-validated payload.

    Only PDFs yield a page count. PDFs and images yield a thumbnail; Office and
    text files get none, and the UI falls back to a category icon.

    A thumbnail failure is fatal for PDFs — a parse failure there means the file
    is spoofed — but non-fatal for images. WebP in particular has no thumbnail:
    MuPDF cannot decode it (measured against PyMuPDF 1.27), so a .webp upload
    succeeds and simply shows the category icon on its card like any other
    thumbnail-less row. Decoding it would mean adding Pillow as a dependency.
    """
    if spec.kind == "pdf":
        try:
            return await asyncio.to_thread(extract_pdf_metadata, file_bytes)
        except Exception as e:
            print(f"Security/Validation Error: Invalid PDF uploaded. {e}")
            raise HTTPException(status_code=400, detail="Invalid, corrupted, or spoofed PDF file.")

    if spec.kind == "image":
        try:
            return None, await asyncio.to_thread(render_image_thumbnail, file_bytes, spec.ext)
        except Exception as e:
            print(f"Warning: thumbnail generation failed for .{spec.ext}: {e}")
            return None, None

    return None, None


class StoredUpload:
    """Result of validating one uploaded file and pushing it to R2."""

    def __init__(self, file_url, thumbnail_url, file_size_mb, page_count, content_text, file_sha256, r2_keys):
        self.file_url = file_url
        self.thumbnail_url = thumbnail_url
        self.file_size_mb = file_size_mb
        self.page_count = page_count
        self.content_text = content_text
        self.file_sha256 = file_sha256
        self.r2_keys = r2_keys


async def validate_and_store_upload(
    file: UploadFile,
    title: str,
    subject: str,
    module_id: Optional[int],
    exclude_document_id: Optional[int] = None,
) -> StoredUpload:
    """
    The single upload code path, shared by POST /upload/ and POST /{id}/resubmit.

    Validates in cheapest-first order — extension, then size (streaming), then
    magic bytes, then a format-specific structural check — before spending any
    CPU on thumbnails or any bandwidth on R2.
    """
    spec = spec_for_filename(file.filename)
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {allowed_extensions_label()}.",
        )

    file_bytes = await read_capped(file, min(spec.max_bytes, MAX_ANY_FILE_BYTES), f".{spec.ext} files")

    if not verify_magic_bytes(spec, file_bytes[:16]):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. The contents don't match a .{spec.ext} file.",
        )

    try:
        verify_payload(spec, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    file_sha256 = hashlib.sha256(file_bytes).hexdigest()
    duplicate_query = (
        supabase.table("documents")
        .select("id, title, subject, module_id, category, slug, status")
        .eq("file_sha256", file_sha256)
    )
    if exclude_document_id is not None:
        duplicate_query = duplicate_query.neq("id", exclude_document_id)
    duplicate_response = duplicate_query.limit(1).execute()
    duplicate_rows = duplicate_response.data if isinstance(duplicate_response.data, list) else []
    if duplicate_rows:
        duplicate = duplicate_rows[0]
        raise HTTPException(
            status_code=409,
            detail={
                "code": "duplicate_upload",
                "message": "This file already exists in the portal.",
                "existing_document": duplicate,
            },
        )

    file_size_mb = round(len(file_bytes) / (1024 * 1024), 2)
    try:
        content_text = await asyncio.to_thread(extract_text, spec, file_bytes)
    except Exception as e:
        print(f"Warning: searchable text extraction failed for .{spec.ext}: {e}")
        content_text = None

    page_count, thumbnail_bytes = await build_preview(spec, file_bytes)

    safe_filename = document_storage_key(title, subject, module_id, file.filename)
    safe_thumb_key = thumbnail_key_for(safe_filename)

    public_url = await upload_to_r2(safe_filename, file_bytes, spec.content_type)
    r2_keys = [safe_filename]

    thumbnail_url = None
    if thumbnail_bytes:
        try:
            thumbnail_url = await upload_to_r2(safe_thumb_key, thumbnail_bytes, "image/jpeg")
            r2_keys.append(safe_thumb_key)
        except RuntimeError as e:
            # Thumbnail failure is non-fatal — continue without it.
            print(f"Warning: Thumbnail upload failed: {e}")

    return StoredUpload(public_url, thumbnail_url, file_size_mb, page_count, content_text, file_sha256, r2_keys)


def _r2_keys_for_doc(doc: dict) -> list[str]:
    """
    Extract R2 object keys from a document row's file_url and thumbnail_url.
    Returns an empty list for any URL that isn't an R2 URL (e.g. old Supabase
    URLs still in the DB from before the migration).
    """
    keys = []
    for field in ("file_url", "thumbnail_url"):
        key = key_from_public_url(doc.get(field))
        if key:
            keys.append(key)
    return keys


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload/")
@limiter.limit("5/minute")
async def upload_document(
    request: Request,
    title: str = Form(...),
    category: DocCategory = Form(...),
    module_id: str = Form("null"),
    subject: str = Form("General"),
    status: str = Form("pending"),
    uploader_name: str = Form(None),
    file: UploadFile = File(...),
    user: dict = Depends(verify_token),
):
    """Upload a document to R2 and insert the metadata row into Supabase."""

    # Reject an unsupported type before doing any DB work or reading the body.
    if spec_for_filename(file.filename) is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {allowed_extensions_label()}.",
        )

    user_id = user.get("id")

    # --- Role check ---
    is_admin = False
    try:
        admin_check = supabase.table("admins").select("id").eq("user_id", user_id).execute()
        is_admin = bool(admin_check.data)
    except Exception as e:
        print(f"Role verification warning: {e}")

    if is_admin:
        if status != "pending":
            assert_aal2(user)
        secure_status = status
    else:
        # Students can never self-approve.
        secure_status = "pending"

    secure_uploaded_by = user_id

    try:
        safe_module_id = None if module_id == "null" else int(module_id)

        stored = await validate_and_store_upload(file, title, subject, safe_module_id)

        # --- Insert metadata into Supabase DB ---
        category_val = category.value if hasattr(category, "value") else category
        new_doc_payload = {
            "title": title,
            "category": category_val,
            "module_id": safe_module_id,
            "subject": subject,
            "uploaded_by": secure_uploaded_by,
            "uploader_name": uploader_name.strip() if uploader_name else "Anonymous",
            "file_url": stored.file_url,
            "file_size": stored.file_size_mb,
            "page_count": stored.page_count,
            "thumbnail_url": stored.thumbnail_url,
            "status": secure_status,
            "content_text": stored.content_text,
            "file_sha256": stored.file_sha256,
        }

        try:
            db_response = supabase.table("documents").insert(new_doc_payload).execute()
            if not db_response.data:
                raise Exception("Supabase DB insert returned empty data.")
            return db_response.data[0]

        except Exception as db_err:
            # ROLLBACK: remove the files we just uploaded so R2 doesn't accumulate orphans.
            print(f"DB insert failed — rolling back R2 uploads: {db_err}")
            await delete_from_r2(stored.r2_keys)
            raise HTTPException(status_code=500, detail="Database insert failed. Upload rolled back.")

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Backend Crash: {str(e)}" if settings.DEBUG else "An internal error occurred"
        raise HTTPException(status_code=500, detail=detail)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{document_id}")
@limiter.limit("15/minute")
async def delete_document(
    request: Request,
    document_id: int,
    admin_user: dict = Depends(verify_admin),
):
    """Delete a document's DB row and its R2 assets atomically."""
    try:
        doc_response = (
            supabase.table("documents")
            .select("file_url, thumbnail_url")
            .eq("id", document_id)
            .execute()
        )
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")

        doc = doc_response.data[0]

        # Extract R2 keys (returns empty list for old Supabase URLs).
        r2_keys = _r2_keys_for_doc(doc)

        # Delete DB row first — if this fails we still have the files.
        # If file deletion fails below, we log and accept the orphan rather
        # than leaving a live row pointing at a deleted file.
        supabase.table("documents").delete().eq("id", document_id).execute()
        
        # Log the deletion
        supabase.table("admin_audit_log").insert({
            "admin_id": admin_user.get("id"),
            "action": "delete",
            "target_id": document_id
        }).execute()

        if r2_keys:
            await delete_from_r2(r2_keys)

        return {"message": "Document and associated assets deleted successfully", "deleted_id": document_id}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Failed to delete document: {str(e)}" if settings.DEBUG else "An internal error occurred while deleting document."
        raise HTTPException(status_code=500, detail=detail)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def _prefix_tsquery(query: str) -> str:
    """
    Turn a raw user query into a `to_tsquery` expression with prefix matching,
    e.g. "mcs syll" -> "mcs:* & syll:*".

    Splitting on non-alphanumerics keeps the expression free of tsquery
    operators, so a stray "(" or "," from the search box can never produce a
    syntax error. Returns "" when nothing searchable is left.
    """
    terms = [term for term in re.split(r"[\W_]+", query, flags=re.UNICODE) if term]
    return " & ".join(f"{term}:*" for term in terms)


def _ilike_pattern(query: str) -> str:
    """Build a PostgREST `ilike` pattern that matches `query` anywhere in a column."""
    escaped = (
        query.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
        .replace('"', '\\"')
    )
    return f"*{escaped}*"


def _apply_text_filter(db_query, query: str):
    """
    Match the query against the `fts` column (title/subject/category, prefix
    aware and word ranked) OR as a plain substring of the title/subject, so
    mid-word searches like "xperim" -> "Software Experiments" still hit.
    """
    pattern = _ilike_pattern(query)
    clauses = [f'title.ilike."{pattern}"', f'subject.ilike."{pattern}"']

    tsquery = _prefix_tsquery(query)
    if tsquery:
        clauses.insert(0, f'fts.fts(english)."{tsquery}"')
        clauses.insert(1, f'content_tsv.fts(english)."{tsquery}"')

    return db_query.or_(",".join(clauses))


@router.get("/search")
@limiter.limit("30/minute")
async def search_documents(
    request: Request,
    query: str = "",
    page: int = 1,
    limit: int = 20,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    category: Optional[str] = None,
    subject: Optional[str] = None,
):
    """Search documents via FastAPI instead of client-side Supabase calls"""
    from_index = (page - 1) * limit
    to_index = from_index + limit - 1

    selected_fields = (
        "id, title, category, subject, module_id, thumbnail_url, file_url, "
        "file_size, page_count, created_at, uploaded_by, uploader_name, "
        "document_analytics(upvotes, view_count, download_count)"
    )

    try:
        db_query = supabase.table("documents").select(selected_fields, count="exact").eq("status", "approved")

        if query and query.strip():
            db_query = _apply_text_filter(db_query, query.strip())

        if category:
            db_query = db_query.eq("category", category)
        if subject:
            db_query = db_query.eq("subject", subject)

        # Supabase Python client sorting with foreign table
        if sort_by in ["upvotes", "download_count"]:
            db_query = db_query.order(sort_by, foreign_table="document_analytics", desc=(sort_order == "desc"))
        else:
            db_query = db_query.order(sort_by, desc=(sort_order == "desc"))

        db_response = db_query.range(from_index, to_index).execute()
        count = db_response.count or 0
        return {
            "data": db_response.data or [],
            "totalPages": (count + limit - 1) // limit if count > 0 else 0,
            "totalItems": count
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Search failed due to an internal error.")


# ---------------------------------------------------------------------------
# Update status (approve / reject)
# ---------------------------------------------------------------------------

class StatusUpdatePayload(BaseModel):
    status: str
    reason: Optional[str] = None


@router.patch("/{document_id}/status")
@limiter.limit("20/minute")
async def update_document_status(
    request: Request,
    document_id: int,
    payload: StatusUpdatePayload,
    admin_user: dict = Depends(verify_admin),
):
    """Approve or reject a pending document without touching its authorship."""
    if payload.status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status value.")

    try:
        doc_res = (
            supabase.table("documents")
            .select("uploaded_by, title, uploader_name")
            .eq("id", document_id)
            .execute()
        )
        if not doc_res.data:
            raise HTTPException(status_code=404, detail="Document not found.")

        original_doc = doc_res.data[0]
        uploader_id = original_doc.get("uploaded_by")
        doc_title = original_doc.get("title", "Your document")

        update_payload = {
            "status": payload.status,
            "moderated_by": admin_user.get("id"),
            "rejection_reason": payload.reason if payload.status == "rejected" else None,
            "updated_at": "now()",
        }

        db_response = (
            supabase.table("documents")
            .update(update_payload)
            .eq("id", document_id)
            .execute()
        )
        if not db_response.data:
            raise HTTPException(status_code=404, detail="Document not found.")

        is_valid_uuid = isinstance(uploader_id, str) and len(uploader_id) > 10
        if is_valid_uuid and payload.status in ["approved", "rejected"]:
            message_text = f"Your document '{doc_title}' has been {payload.status}."
            if payload.status == "rejected" and payload.reason:
                message_text += f" Reason: {payload.reason}"
            supabase.table("notifications").insert({
                "user_id": uploader_id,
                "title": f"Upload {payload.status.capitalize()}",
                "message": message_text,
                "type": f"document_{payload.status}",
                "related_entity_id": document_id,
                "is_read": False,
            }).execute()

        # Log the status update
        audit_payload = {
            "admin_id": admin_user.get("id"),
            "action": payload.status,
            "target_id": document_id
        }
        if payload.status == "rejected" and payload.reason:
            audit_payload["metadata"] = {"reason": payload.reason}
            
        supabase.table("admin_audit_log").insert(audit_payload).execute()

        return {
            "message": f"Document successfully marked as {payload.status}",
            "document": db_response.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Failed to update document status: {str(e)}" if settings.DEBUG else "An internal error occurred while updating document status."
        raise HTTPException(status_code=500, detail=detail)

class BulkStatusUpdatePayload(BaseModel):
    document_ids: list[int]
    status: str
    reason: Optional[str] = None

@router.patch("/bulk-status")
@limiter.limit("20/minute")
async def bulk_update_document_status(
    request: Request,
    payload: BulkStatusUpdatePayload,
    admin_user: dict = Depends(verify_admin),
):
    """Approve or reject multiple pending documents in bulk (Max 10)."""
    if payload.status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status value.")
    
    if len(payload.document_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 documents can be processed at once.")
    
    if not payload.document_ids:
        return {"message": "No documents provided.", "count": 0}

    try:
        # Fetch the documents to verify they exist and get uploader info for notifications
        doc_res = (
            supabase.table("documents")
            .select("id, uploaded_by, title")
            .in_("id", payload.document_ids)
            .execute()
        )
        
        if not doc_res.data:
            raise HTTPException(status_code=404, detail="No matching documents found.")
            
        docs = doc_res.data
        
        update_payload = {
            "status": payload.status,
            "moderated_by": admin_user.get("id"),
            "rejection_reason": payload.reason if payload.status == "rejected" else None,
            "updated_at": "now()",
        }
        
        # Batch update
        db_response = (
            supabase.table("documents")
            .update(update_payload)
            .in_("id", payload.document_ids)
            .execute()
        )
        
        notifications = []
        audit_logs = []
        
        for doc in docs:
            doc_id = doc.get("id")
            uploader_id = doc.get("uploaded_by")
            doc_title = doc.get("title", "Your document")
            
            is_valid_uuid = isinstance(uploader_id, str) and len(uploader_id) > 10
            if is_valid_uuid and payload.status in ["approved", "rejected"]:
                message_text = f"Your document '{doc_title}' has been {payload.status}."
                if payload.status == "rejected" and payload.reason:
                    message_text += f" Reason: {payload.reason}"
                
                notifications.append({
                    "user_id": uploader_id,
                    "title": f"Upload {payload.status.capitalize()}",
                    "message": message_text,
                    "type": f"document_{payload.status}",
                    "related_entity_id": doc_id,
                    "is_read": False,
                })
            
            audit_payload = {
                "admin_id": admin_user.get("id"),
                "action": payload.status,
                "target_id": doc_id
            }
            if payload.status == "rejected" and payload.reason:
                audit_payload["metadata"] = {"reason": payload.reason}
            audit_logs.append(audit_payload)
            
        if notifications:
            supabase.table("notifications").insert(notifications).execute()
            
        if audit_logs:
            supabase.table("admin_audit_log").insert(audit_logs).execute()
            
        return {
            "message": f"Successfully marked {len(db_response.data)} documents as {payload.status}",
            "count": len(db_response.data)
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Failed to bulk update document status: {str(e)}" if settings.DEBUG else "An internal error occurred while bulk updating document status."
        raise HTTPException(status_code=500, detail=detail)


# ---------------------------------------------------------------------------
# Resubmit (contributor edits a rejected document)
# ---------------------------------------------------------------------------

@router.post("/{document_id}/resubmit")
@limiter.limit("5/minute")
async def resubmit_document(
    request: Request,
    document_id: int,
    title: str = Form(...),
    category: DocCategory = Form(...),
    module_id: str = Form("null"),
    subject: str = Form("General"),
    uploader_name: str = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(verify_token),
):
    """Let the original uploader fix and resubmit a rejected document."""
    user_id = user.get("id")

    try:
        doc_res = supabase.table("documents").select("*").eq("id", document_id).execute()
        if not doc_res.data:
            raise HTTPException(status_code=404, detail="Document not found.")

        existing_doc = doc_res.data[0]

        if existing_doc.get("uploaded_by") != user_id:
            raise HTTPException(status_code=403, detail="Only the original uploader can resubmit.")
        if existing_doc.get("status") != "rejected":
            raise HTTPException(status_code=400, detail="Only rejected documents can be resubmitted.")

        safe_module_id = None if module_id == "null" else int(module_id)
        category_val = category.value if hasattr(category, "value") else category

        update_payload = {
            "title": title,
            "category": category_val,
            "module_id": safe_module_id,
            "subject": subject,
            "uploader_name": uploader_name.strip() if uploader_name else "Anonymous",
            "status": "pending",
            "updated_at": "now()",
            "resubmission_count": existing_doc.get("resubmission_count", 0) + 1,
            # Intentionally keep rejection_reason so the admin sees the full history.
        }

        old_r2_keys: list[str] = []

        # --- Handle optional file replacement ---
        if file and file.filename:
            stored = await validate_and_store_upload(file, title, subject, safe_module_id, document_id)

            update_payload["file_url"] = stored.file_url
            update_payload["file_size"] = stored.file_size_mb
            update_payload["page_count"] = stored.page_count
            # Always overwrite the thumbnail, including to None, so replacing a
            # PDF with a .docx cannot leave a stale page-1 preview behind.
            update_payload["thumbnail_url"] = stored.thumbnail_url
            update_payload["content_text"] = stored.content_text
            update_payload["file_sha256"] = stored.file_sha256

            # Queue the old R2 objects for deletion after the DB update succeeds.
            old_r2_keys = _r2_keys_for_doc(existing_doc)

        # --- Commit to DB ---
        db_response = (
            supabase.table("documents")
            .update(update_payload)
            .eq("id", document_id)
            .execute()
        )
        if not db_response.data:
            raise Exception("Database update failed.")

        # --- Notify uploader ---
        try:
            supabase.table("notifications").insert({
                "user_id": user_id,
                "title": "Document Resubmitted",
                "message": f"Your document '{title}' has been resubmitted and is pending review.",
                "type": "document_resubmitted",
                "related_entity_id": document_id,
                "is_read": False,
            }).execute()
        except Exception as notif_err:
            print(f"Warning: Failed to log resubmission notification: {notif_err}")

        # --- Clean up old R2 files (best-effort, non-fatal) ---
        if old_r2_keys:
            await delete_from_r2(old_r2_keys)

        return {"message": "Document resubmitted successfully", "document": db_response.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Resubmission Error: {str(e)}" if settings.DEBUG else "An internal error occurred during resubmission."
        raise HTTPException(status_code=500, detail=detail)


@router.post("/{document_id}/dismiss-flags")
@limiter.limit("20/minute")
async def dismiss_flags(
    request: Request,
    document_id: int,
    admin_user: dict = Depends(verify_admin),
):
    """Dismiss all pending flags for a document (False Alarm)."""
    try:
        db_response = (
            supabase.table("document_flags")
            .update({"status": "dismissed"})
            .eq("document_id", document_id)
            .eq("status", "pending")
            .execute()
        )
        
        # Log the dismiss action
        supabase.table("admin_audit_log").insert({
            "admin_id": admin_user.get("id"),
            "action": "dismiss_flags",
            "target_id": document_id
        }).execute()

        return {
            "message": "Flags dismissed successfully", 
            "document_id": document_id
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        detail = f"Failed to dismiss flags: {str(e)}" if settings.DEBUG else "An internal error occurred while dismissing flags."
        raise HTTPException(status_code=500, detail=detail)