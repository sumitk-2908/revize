"""
Single source of truth for which file types may be uploaded to the portal.

Every gate that used to be a hard-coded ``.pdf`` literal consults this module:
the extension allow-list, the per-type size cap, the magic-byte signature, and
the Content-Type handed to R2.

Mirrored on the client by ``frontend/src/app/lib/file-types.ts`` — when you add
a type here, add it there too or the browser will reject what the API accepts.
"""

import io
import os
import zipfile
from dataclasses import dataclass
from typing import Optional

import fitz

MB = 1024 * 1024
MAX_EXTRACTED_TEXT_CHARS = 500_000


@dataclass(frozen=True)
class FileSpec:
    ext: str
    kind: str  # "pdf" | "image" | "text" | "office"
    content_type: str
    max_bytes: int
    # Accepted leading-byte signatures. Empty means the format has no
    # signature (plain text) and is validated by `verify_payload` instead.
    magic: tuple[bytes, ...] = ()


_OOXML_MAGIC = (b"PK\x03\x04",)  # every OOXML package is a zip
_JPEG_MAGIC = (b"\xff\xd8\xff",)
_PNG_MAGIC = (b"\x89PNG\r\n\x1a\n",)
_GIF_MAGIC = (b"GIF87a", b"GIF89a")

_OOXML_BASE = "application/vnd.openxmlformats-officedocument"

# Size caps are per-type on purpose. The backend reads the whole payload into
# memory before handing it to boto3, so these double as a RAM guard: text and
# images stay small, PDFs keep their historical 50MB, and only Office packages
# (which skip the PyMuPDF render step entirely) get the larger ceiling.
ALLOWED_FILE_TYPES: dict[str, FileSpec] = {
    "pdf": FileSpec("pdf", "pdf", "application/pdf", 50 * MB, (b"%PDF",)),

    "docx": FileSpec("docx", "office", f"{_OOXML_BASE}.wordprocessingml.document", 75 * MB, _OOXML_MAGIC),
    "pptx": FileSpec("pptx", "office", f"{_OOXML_BASE}.presentationml.presentation", 75 * MB, _OOXML_MAGIC),
    "xlsx": FileSpec("xlsx", "office", f"{_OOXML_BASE}.spreadsheetml.sheet", 75 * MB, _OOXML_MAGIC),

    "png": FileSpec("png", "image", "image/png", 10 * MB, _PNG_MAGIC),
    "jpg": FileSpec("jpg", "image", "image/jpeg", 10 * MB, _JPEG_MAGIC),
    "jpeg": FileSpec("jpeg", "image", "image/jpeg", 10 * MB, _JPEG_MAGIC),
    "webp": FileSpec("webp", "image", "image/webp", 10 * MB),  # RIFF container, checked specially
    "gif": FileSpec("gif", "image", "image/gif", 10 * MB, _GIF_MAGIC),

    # Deliberately served as text/plain and never text/html: an uploaded .md
    # full of <script> must not be able to execute on the storage origin.
    "txt": FileSpec("txt", "text", "text/plain; charset=utf-8", 2 * MB),
    "md": FileSpec("md", "text", "text/plain; charset=utf-8", 2 * MB),
}

# SVG is deliberately absent. It is a scriptable format, and the viewer's
# "FullScreen" link opens the stored file directly on the R2 origin.

# Ceiling for a streaming read before the claimed extension has been resolved.
MAX_ANY_FILE_BYTES = max(spec.max_bytes for spec in ALLOWED_FILE_TYPES.values())

ALLOWED_EXTENSIONS = tuple(sorted(ALLOWED_FILE_TYPES))

# `[Content_Types].xml` is mandatory in every OOXML package, and each format
# keeps its parts under a distinct top-level directory.
_OOXML_REQUIRED_DIR = {"docx": "word/", "pptx": "ppt/", "xlsx": "xl/"}

# Zip-bomb guard. Real Office files rarely exceed ~20x expansion; anything
# claiming to inflate 200x (or past 400MB outright) is refused unread.
_MAX_OOXML_EXPANSION = 200
_MAX_OOXML_UNCOMPRESSED = 400 * MB


def extension_of(filename: Optional[str]) -> str:
    """Lower-cased extension without the dot, or '' when there isn't one."""
    if not filename:
        return ""
    return os.path.splitext(filename)[1].lstrip(".").lower()


def spec_for_filename(filename: Optional[str]) -> Optional[FileSpec]:
    """Returns the FileSpec for a filename, or None if the type isn't allowed."""
    return ALLOWED_FILE_TYPES.get(extension_of(filename))


def allowed_extensions_label() -> str:
    """Human-readable list for error messages, e.g. 'DOCX, GIF, JPG, ...'."""
    return ", ".join(ext.upper() for ext in ALLOWED_EXTENSIONS)


def thumbnail_key_for(key: str) -> str:
    """Derives the thumbnail object key from a stored file's key.

    Uses splitext rather than a string replace so that a name like
    `a.pdf.notes.pdf` swaps only the real trailing extension.
    """
    return f"thumb_{os.path.splitext(key)[0]}.jpg"


def verify_magic_bytes(spec: FileSpec, head: bytes) -> bool:
    """Cheap signature check against the first bytes of the payload."""
    if spec.ext == "webp":
        # RIFF container: "RIFF" <4-byte little-endian size> "WEBP"
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if not spec.magic:
        return True  # plain text has no signature; verify_payload handles it
    return any(head.startswith(signature) for signature in spec.magic)


def verify_payload(spec: FileSpec, data: bytes) -> None:
    """Format-specific validation beyond the leading signature.

    Raises ValueError with a user-safe message when the payload isn't actually
    the format its extension claims. PDFs are validated separately by PyMuPDF
    in the caller, which also produces the thumbnail.
    """
    if spec.kind == "office":
        _verify_ooxml(spec, data)
    elif spec.kind == "text":
        _verify_text(data)


def _verify_ooxml(spec: FileSpec, data: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            names = bundle.namelist()
            uncompressed = sum(item.file_size for item in bundle.infolist())
    except (zipfile.BadZipFile, OSError):
        raise ValueError(f"Invalid or corrupted .{spec.ext} file.")

    if uncompressed > _MAX_OOXML_UNCOMPRESSED or uncompressed > len(data) * _MAX_OOXML_EXPANSION:
        raise ValueError(f"This .{spec.ext} file expands to an unreasonable size and was rejected.")

    if "[Content_Types].xml" not in names:
        raise ValueError(f"Invalid .{spec.ext} file: not an Office document.")

    required_dir = _OOXML_REQUIRED_DIR[spec.ext]
    if not any(name.startswith(required_dir) for name in names):
        raise ValueError(f"This file is a zip archive but not a valid .{spec.ext} document.")


def _verify_text(data: bytes) -> None:
    if b"\x00" in data:
        raise ValueError("Text files must not contain binary data.")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("Text files must be UTF-8 encoded.")


def extract_text(spec: FileSpec, data: bytes, max_chars: int = MAX_EXTRACTED_TEXT_CHARS) -> str | None:
    """Extract searchable text for formats with reliable plain-text support.

    Office documents and images are intentionally skipped in v1. PDF extraction
    returns an empty string for image-only/scanned files, while the character
    cap keeps unusually large documents from bloating a database row.
    """
    if spec.kind == "text":
        text = data.decode("utf-8")
    elif spec.kind == "pdf":
        with fitz.open(stream=data, filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
    else:
        return None

    return text[:max_chars]
