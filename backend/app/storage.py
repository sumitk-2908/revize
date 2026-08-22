"""
Cloudflare R2 storage helper.

Centralizes all R2 access so the upload/delete/resubmit routes don't each
re-implement their own S3 client + URL-parsing logic. R2 is S3-compatible,
so this uses boto3's standard S3 client pointed at R2's endpoint.

Required environment variables:
    R2_ACCOUNT_ID         - Your Cloudflare account ID (visible in the R2 dashboard URL)
    R2_ACCESS_KEY_ID      - From an R2 API token (Object Read & Write, scoped to your bucket)
    R2_SECRET_ACCESS_KEY  - From the same R2 API token
    R2_BUCKET_NAME        - The bucket you created for this project
    R2_PUBLIC_URL         - The base public URL for the bucket, no trailing slash.
                            Either the bucket's r2.dev URL (e.g. https://pub-xxxx.r2.dev)
                            or a custom domain you've connected (e.g. https://files.yourdomain.com)

boto3 is synchronous, so every call here is offloaded to a thread via
asyncio.to_thread — same pattern the rest of this codebase already uses
for the synchronous PyMuPDF work in documents.py.
"""

import asyncio
import os
import re
from typing import Optional

import boto3
from botocore.config import Config

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL]):
    print("WARNING: Missing one or more R2_* environment variables. Storage calls will fail.")

_r2_client = None


def _safe_path_segment(value: Optional[str], fallback: str) -> str:
    """Sanitize a user-provided storage path segment without losing readability."""
    segment = re.sub(r"[\x00-\x1f\x7f]", "", (value or "")).strip()
    segment = re.sub(r"[\\/]+", "_", segment)
    segment = re.sub(r"\s+", " ", segment).strip(" .")
    return segment or fallback


def document_storage_key(
    title: str,
    subject: str,
    module_id: Optional[int],
    filename: Optional[str],
) -> str:
    """Build a readable key using the contributor-provided document title."""
    extension = os.path.splitext(filename or "")[1].lower()
    subject_segment = _safe_path_segment(subject, "General")
    module_segment = _safe_path_segment(
        f"module-{module_id}" if module_id is not None else "general",
        "general",
    )
    title_segment = _safe_path_segment(title, "document")
    return f"subjects/{subject_segment}/{module_segment}/{title_segment}{extension}"


def get_r2_client():
    """Lazily creates a single boto3 S3 client pointed at the R2 endpoint."""
    global _r2_client
    if _r2_client is None:
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _r2_client


def _put_object_sync(key: str, data: bytes, content_type: str) -> None:
    get_r2_client().put_object(
        Bucket=R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def _delete_objects_sync(keys: list[str]) -> None:
    if not keys:
        return
    # delete_objects supports up to 1000 keys per call, which is far more
    # than a single document's file + thumbnail will ever need.
    get_r2_client().delete_objects(
        Bucket=R2_BUCKET_NAME,
        Delete={"Objects": [{"Key": k} for k in keys]},
    )


def public_url_for(key: str) -> str:
    return f"{R2_PUBLIC_URL}/{key}"


def key_from_public_url(url: Optional[str]) -> Optional[str]:
    """Extracts the object key from one of our own R2 public URLs.
    Returns None if `url` is empty or doesn't belong to our bucket
    (e.g. it's a leftover Supabase Storage URL that hasn't been migrated yet)."""
    if not url:
        return None
    prefix = f"{R2_PUBLIC_URL}/"
    if url.startswith(prefix):
        return url[len(prefix):]
    return None


async def upload_to_r2(key: str, data: bytes, content_type: str) -> str:
    """Uploads bytes to R2 under `key` and returns the resulting public URL."""
    await asyncio.to_thread(_put_object_sync, key, data, content_type)
    return public_url_for(key)


async def delete_from_r2(keys: list[str]) -> None:
    """Deletes one or more objects from R2 by key. Safe to call with an empty/None-filled list."""
    clean_keys = [k for k in keys if k]
    if not clean_keys:
        return
    await asyncio.to_thread(_delete_objects_sync, clean_keys)
