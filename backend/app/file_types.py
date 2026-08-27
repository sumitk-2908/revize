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

# PostgreSQL's tsvector representation is limited to roughly 1MB. A PDF can be
# tiny on disk yet expand to hundreds of thousands of extracted characters, and
# non-ASCII text can take up to four UTF-8 bytes per character. Keep the upload
# path comfortably below that database limit; the generated-column migration
# applies the same bound independently for existing/backfilled rows.
MAX_EXTRACTED_TEXT_CHARS = 200_000

# A PDF that yields less than this after stripping whitespace has no usable
# text layer — a scan, or slides exported as images — and is worth OCR'ing.
# Set above zero because such files often still carry a stray page label.
_MIN_PDF_TEXT_LAYER_CHARS = 50

# Render resolution for OCR. 150 is the low end of what Tesseract reads
# reliably; higher costs render time and memory for little accuracy gain.
_OCR_DPI = 150

# Tesseract's `eng` model cannot read cursive handwriting — it returns
# confident-looking nonsense ("PMS bbb ob b6beoe") rather than nothing, which
# would fill the search index with tokens nobody can ever match and make the
# row look processed. Mean per-word confidence separates the two cleanly:
# measured on this portal's own scans, printed pages score 85-93 and
# handwritten ones 29-44, so anything under this is discarded as noise.
_MIN_OCR_CONFIDENCE = 60.0

# Inline OCR runs while an upload request is open, so it has to stay short.
# Measured in a 0.5-CPU / 512MB container (a Render Starter instance's shape)
# a dense A4 page costs ~5.3s, so four pages is ~21s of worst-case OCR on top
# of the read, thumbnail and R2 upload the request already pays for. The limit
# is deliberately low because that half-CPU is shared: two uploads landing
# together roughly double each other's OCR time, so a cap that looks fine
# alone can stack into a gateway timeout. Four still covers the scans this
# portal actually receives — syllabi, notices and question papers run one to
# three pages.
#
# Longer documents are skipped outright rather than truncated at four pages.
# Truncating would leave content_text populated, and the backfill selects on
# blank content, so pages past the limit would never be indexed by anything.
# Skipping keeps the row on the backfill's work list, where OCR runs with no
# request waiting on it — pass max_ocr_pages=None there to lift the limit.
_MAX_INLINE_OCR_PAGES = 4


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


def _ocr_page(image) -> tuple[str, Optional[float]]:
    """OCRs one rendered page into (text, mean word confidence).

    Uses ``image_to_data`` rather than ``image_to_string`` — it is the same
    single Tesseract pass, but it also reports per-word confidence, which is
    what lets a printed page be told apart from an unreadable handwritten one.
    Confidence is None when the page holds no words at all.

    Imports are deferred so the module still loads on a host without the OCR
    stack; the ImportError then surfaces only on this fallback path.
    """
    import pytesseract

    data = pytesseract.image_to_data(image, lang="eng", output_type=pytesseract.Output.DICT)

    lines: dict[tuple, list[str]] = {}
    confidences: list[float] = []
    for index, word in enumerate(data["text"]):
        if not str(word).strip():
            continue
        confidence = float(data["conf"][index])
        if confidence >= 0:  # Tesseract marks non-word regions with -1
            confidences.append(confidence)
        line = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        lines.setdefault(line, []).append(word)

    text = "\n".join(" ".join(words) for words in lines.values())
    return text, (sum(confidences) / len(confidences) if confidences else None)


def _ocr_pdf(document: fitz.Document, spec: FileSpec, max_chars: int) -> str:
    """Renders and OCRs each page of an open PDF, skipping unreadable ones."""
    from PIL import Image

    pages: list[str] = []
    unreadable = 0
    remaining = max_chars
    for page in document:
        pix = page.get_pixmap(dpi=_OCR_DPI)
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text, confidence = _ocr_page(image)
        if confidence is None:
            continue  # genuinely blank page, not a failed read
        if confidence < _MIN_OCR_CONFIDENCE:
            unreadable += 1
            continue
        pages.append(text)
        remaining -= len(text) + 1  # +1 for the joining newline
        if remaining <= 0:
            break  # the cap would discard the rest anyway — don't pay to OCR it

    if unreadable:
        print(
            f"Warning: discarded {unreadable} unreadable OCR page(s) in .{spec.ext} "
            f"- confidence below {_MIN_OCR_CONFIDENCE:.0f}, likely handwriting"
        )
    return "\n".join(pages)


def _ocr_image(data: bytes, spec: FileSpec) -> Optional[str]:
    """OCRs an uploaded image, or None when the read is too poor to index."""
    from PIL import Image

    with Image.open(io.BytesIO(data)) as opened:
        # Palette GIFs and RGBA PNGs both read better once flattened to RGB.
        text, confidence = _ocr_page(opened.convert("RGB"))

    if confidence is not None and confidence < _MIN_OCR_CONFIDENCE:
        print(
            f"Warning: discarded unreadable OCR output for .{spec.ext} "
            f"- confidence {confidence:.0f} below {_MIN_OCR_CONFIDENCE:.0f}, likely handwriting"
        )
        return None
    return text


def extract_text(
    spec: FileSpec,
    data: bytes,
    max_chars: int = MAX_EXTRACTED_TEXT_CHARS,
    max_ocr_pages: Optional[int] = _MAX_INLINE_OCR_PAGES,
) -> str | None:
    """Extract searchable text, falling back to OCR for scanned pages and images.

    A PDF with a real text layer is read straight out of it; one without (a
    scanned handout) is rendered page-by-page and OCR'd, and images always go
    through OCR. Office documents are still skipped.

    OCR output is only kept when Tesseract read it confidently — handwriting
    yields plausible-looking nonsense that would pollute the search index, so
    low-confidence pages are dropped rather than stored.

    ``max_ocr_pages`` bounds how long a request can be held hostage by OCR: a
    PDF with more pages than that is left for the offline backfill, which calls
    this with None to lift the limit. Images are a single page and ignore it.

    OCR is best-effort: a missing Tesseract binary, an uninstalled Pillow, or a
    render failure logs a warning and degrades to the pre-OCR result — ``""``
    for a scanned PDF, ``None`` for an image, so a later run can retry the
    image once the binary is in place. The character cap keeps unusually large
    documents from bloating a database row.
    """
    if spec.kind == "text":
        text = data.decode("utf-8")
    elif spec.kind == "pdf":
        with fitz.open(stream=data, filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
            if len(text.strip()) < _MIN_PDF_TEXT_LAYER_CHARS:
                if max_ocr_pages is not None and document.page_count > max_ocr_pages:
                    print(
                        f"Note: skipping inline OCR for a {document.page_count}-page .{spec.ext} "
                        f"(limit {max_ocr_pages}); the backfill job will index it"
                    )
                else:
                    try:
                        text = _ocr_pdf(document, spec, max_chars) or text
                    except Exception as error:
                        print(f"Warning: OCR failed for .{spec.ext}: {error}")
    elif spec.kind == "image":
        try:
            text = _ocr_image(data, spec)
        except Exception as error:
            print(f"Warning: OCR failed for .{spec.ext}: {error}")
            return None
        if text is None:
            return None
    else:
        return None

    if text is None:
        return None

    # PostgreSQL text/varchar columns reject NUL bytes (0x00).
    text = text.replace("\x00", "")

    return text[:max_chars]
