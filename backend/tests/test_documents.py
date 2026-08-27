import io
import zipfile
import hashlib

import fitz
import pytest
from fastapi import HTTPException, UploadFile
from unittest.mock import patch, MagicMock, AsyncMock
from app.main import app
from app.auth import verify_token, verify_admin
from app.file_types import MAX_EXTRACTED_TEXT_CHARS, extract_text, spec_for_filename
from app.storage import document_storage_key
from app.routers.documents import validate_and_store_upload


def _make_ooxml(part_prefix: str) -> bytes:
    """A minimal but structurally valid OOXML container (docx/pptx/xlsx)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(f"{part_prefix}document.xml", "<document/>")
    return buffer.getvalue()


@pytest.fixture
def mock_upload_file():
    return (
        "test_document.pdf",
        b"%PDF-1.4 mock pdf content",
        "application/pdf"
    )

@pytest.fixture
def mock_upload_file_large():
    return (
        "large_document.pdf",
        b"0" * (51 * 1024 * 1024),
        "application/pdf"
    )

@pytest.fixture
def mock_upload_file_unsupported():
    """An extension that is not on the allow-list at all."""
    return (
        "installer.exe",
        b"MZ\x90\x00 mock executable",
        "application/octet-stream"
    )

@pytest.fixture
def mock_upload_file_text():
    return (
        "notes.md",
        "# Module 1\n\nSome revision notes.\n".encode("utf-8"),
        "text/markdown"
    )

@pytest.fixture
def mock_upload_file_text_oversized():
    return (
        "notes.txt",
        b"a" * (3 * 1024 * 1024),  # txt/md are capped at 2MB
        "text/plain"
    )

@pytest.fixture
def mock_upload_file_docx():
    return (
        "assignment.docx",
        _make_ooxml("word/"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

@pytest.fixture
def mock_upload_file_docx_spoofed():
    """Right extension and zip magic, but the payload is an xlsx, not a docx."""
    return (
        "assignment.docx",
        _make_ooxml("xl/"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

def _mock_duplicate_lookup(mock_supabase, rows):
    response = MagicMock()
    response.data = rows
    query = MagicMock()
    query.limit.return_value.execute.return_value = response
    mock_supabase.table.return_value.select.return_value.eq.return_value = query
    return query


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()

def test_pdf_text_extraction_is_bounded_for_database_search_index():
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "searchable " * 30_000)
    pdf_bytes = document.tobytes()
    document.close()

    text = extract_text(spec_for_filename("large-text-layer.pdf"), pdf_bytes)

    assert text is not None
    assert len(text) <= MAX_EXTRACTED_TEXT_CHARS


def test_pdf_text_extraction_strips_null_bytes():
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Logic\x00 Proof ¬ ∧ ∨")
    pdf_bytes = document.tobytes()
    document.close()

    text = extract_text(spec_for_filename("math-notes.pdf"), pdf_bytes)

    assert text is not None
    assert "\x00" not in text
    assert "Logic Proof" in text or "Logic" in text


def test_document_storage_key_uses_title_hierarchy_and_sanitizes_segments():
    key = document_storage_key(
        "  Unit 1 / Exam Notes  ",
        "Data\\ Structures",
        3,
        "original-name.PDF",
    )

    parts = key.split("/")
    assert parts[0:3] == ["subjects", "Data_ Structures", "module-3"]
    assert parts[3] == "Unit 1 _ Exam Notes.pdf"
    assert ".." not in parts


def test_document_storage_key_uses_general_for_non_module_uploads():
    key = document_storage_key("Syllabus", "Operating Systems", None, "source.pdf")

    assert key == "subjects/Operating Systems/general/Syllabus.pdf"


@pytest.mark.asyncio
async def test_upload_unsupported_extension(mock_upload_file_unsupported, test_client):
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_unsupported}
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]

@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
async def test_upload_large_file(mock_supabase, mock_upload_file_large, test_client):
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}
    
    mock_db_response = MagicMock()
    mock_db_response.data = []  # not admin
    mock_supabase.table().select().eq().execute.return_value = mock_db_response
    
    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_large}
    )
    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]

@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
async def test_upload_text_over_per_type_cap(mock_supabase, mock_upload_file_text_oversized, test_client):
    """3MB is fine for a PDF but over the 2MB cap that applies to txt/md."""
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}

    mock_db_response = MagicMock()
    mock_db_response.data = []  # not admin
    mock_supabase.table().select().eq().execute.return_value = mock_db_response

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_text_oversized}
    )
    assert response.status_code == 413
    assert "2 MB" in response.json()["detail"]

@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
async def test_upload_docx_with_mismatched_parts(mock_supabase, mock_upload_file_docx_spoofed, test_client):
    """A zip with the .docx extension but spreadsheet parts must be rejected."""
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}

    mock_db_response = MagicMock()
    mock_db_response.data = []  # not admin
    mock_supabase.table().select().eq().execute.return_value = mock_db_response

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_docx_spoofed}
    )
    assert response.status_code == 400


def _mock_supabase_student_insert(mock_supabase, inserted_row):
    """Wire a supabase mock so `admins` looks empty and `documents.insert` succeeds.

    Returns the `documents` table mock so a test can inspect the inserted payload.
    """
    mock_admin_response = MagicMock()
    mock_admin_response.data = []  # not admin

    mock_insert_response = MagicMock()
    mock_insert_response.data = [inserted_row]

    mock_eq = MagicMock()
    mock_eq.execute.return_value = mock_admin_response
    mock_select = MagicMock()
    mock_select.eq.return_value = mock_eq

    mock_insert = MagicMock()
    mock_insert.execute.return_value = mock_insert_response

    mock_docs_table = MagicMock()
    mock_docs_table.insert.return_value = mock_insert

    def side_effect(table_name):
        if table_name == "admins":
            mock_admins_table = MagicMock()
            mock_admins_table.select.return_value = mock_select
            return mock_admins_table
        if table_name == "documents":
            return mock_docs_table
        return MagicMock()

    mock_supabase.table.side_effect = side_effect
    return mock_docs_table

@pytest.mark.asyncio
@patch("app.routers.documents.upload_to_r2", new_callable=AsyncMock)
@patch("app.routers.documents.supabase")
async def test_duplicate_upload_returns_conflict_before_r2(mock_supabase, mock_upload_r2):
    content = b"# Existing notes\n"
    existing = {
        "id": 42,
        "title": "Existing notes",
        "subject": "CS",
        "module_id": 1,
        "category": "notes",
        "slug": "existing-notes",
        "status": "approved",
    }
    _mock_duplicate_lookup(mock_supabase, [existing])

    with pytest.raises(HTTPException) as raised:
        await validate_and_store_upload(
            UploadFile(io.BytesIO(content), filename="notes.md", size=len(content)),
            "New notes",
            "CS",
            1,
        )

    assert raised.value.status_code == 409
    assert raised.value.detail["code"] == "duplicate_upload"
    assert raised.value.detail["existing_document"] == existing
    mock_upload_r2.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.routers.documents.upload_to_r2", new_callable=AsyncMock)
@patch("app.routers.documents.supabase")
async def test_one_byte_different_upload_is_stored(mock_supabase, mock_upload_r2):
    content = b"# Revision notes\n"
    changed_content = content[:-1] + b"!"
    _mock_duplicate_lookup(mock_supabase, [])
    mock_upload_r2.return_value = "https://r2.dev/notes.md"

    stored = await validate_and_store_upload(
        UploadFile(
            io.BytesIO(changed_content),
            filename="notes.md",
            size=len(changed_content),
        ),
        "Revision notes",
        "CS",
        None,
    )

    assert stored.file_sha256 == hashlib.sha256(changed_content).hexdigest()
    mock_upload_r2.assert_awaited_once()


@pytest.mark.asyncio
async def test_resubmit_duplicate_lookup_excludes_current_document(monkeypatch):
    from app.routers import documents

    content = b"# Same document\n"
    response = MagicMock(data=[])
    query = MagicMock()
    query.limit.return_value.execute.return_value = response
    documents.supabase = MagicMock()
    documents.supabase.table.return_value.select.return_value.eq.return_value = query
    monkeypatch.setattr(
        documents,
        "upload_to_r2",
        AsyncMock(return_value="https://r2.dev/same.md"),
    )

    await documents.validate_and_store_upload(
        UploadFile(io.BytesIO(content), filename="same.md", size=len(content)),
        "Same document",
        "CS",
        None,
        exclude_document_id=17,
    )

    query.neq.assert_called_once_with("id", 17)


# ---------------------------------------------------------------------------
# Resource request linking (feature 9)
# ---------------------------------------------------------------------------

def test_resolve_fulfilled_request_ignores_absent_value():
    """A plain upload, not started from the requests board."""
    from app.routers.documents import resolve_fulfilled_request

    assert resolve_fulfilled_request(None) is None
    assert resolve_fulfilled_request("") is None
    # UploadContext sends the string "null" for module_id, so guard the same form here.
    assert resolve_fulfilled_request("null") is None


def test_resolve_fulfilled_request_rejects_malformed_id():
    """A non-uuid means a broken client, so it fails loudly rather than silently
    dropping the link the contributor thinks they made."""
    from app.routers.documents import resolve_fulfilled_request

    with pytest.raises(HTTPException) as excinfo:
        resolve_fulfilled_request("not-a-uuid")

    assert excinfo.value.status_code == 400


@patch("app.routers.documents.supabase")
def test_resolve_fulfilled_request_accepts_open_request(mock_supabase):
    from app.routers.documents import resolve_fulfilled_request

    request_id = "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e"
    query = mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value
    query.limit.return_value.execute.return_value = MagicMock(data=[{"id": request_id}])

    assert resolve_fulfilled_request(request_id) == request_id


@patch("app.routers.documents.supabase")
def test_resolve_fulfilled_request_drops_link_when_no_longer_open(mock_supabase):
    """Somebody else's upload was approved while this one was in flight. The file
    is still good, so only the link is dropped."""
    from app.routers.documents import resolve_fulfilled_request

    query = mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value
    query.limit.return_value.execute.return_value = MagicMock(data=[])

    assert resolve_fulfilled_request("b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e") is None


@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
@patch("app.routers.documents.upload_to_r2")
async def test_upload_markdown_success(mock_upload_r2, mock_supabase, mock_upload_file_text, test_client):
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}
    mock_upload_r2.return_value = "https://r2.dev/notes.md"
    mock_docs_table = _mock_supabase_student_insert(mock_supabase, {"id": 7, "title": "Test Doc"})

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_text}
    )

    assert response.status_code == 200
    payload = mock_docs_table.insert.call_args[0][0]
    # Text files have no page count and no thumbnail to derive.
    assert payload["page_count"] is None
    assert payload["thumbnail_url"] is None
    # Stored as text/plain so an .md full of markup can never execute on R2.
    assert mock_upload_r2.call_args[0][2] == "text/plain; charset=utf-8"
    assert mock_upload_r2.call_args[0][0] == "subjects/CS/general/Test Doc.md"

@pytest.mark.asyncio
@patch("app.routers.documents.delete_from_r2", new_callable=AsyncMock)
@patch("app.routers.documents.validate_and_store_upload", new_callable=AsyncMock)
@patch("app.routers.documents.supabase")
async def test_upload_retries_with_bounded_text_on_tsvector_overflow(
    mock_supabase,
    mock_validate_upload,
    mock_delete_r2,
    mock_upload_file_text,
    test_client,
):
    from app.routers.documents import CONTENT_SEARCH_FALLBACK_CHARS

    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}
    extracted_text = "searchable " * 50_000
    mock_validate_upload.return_value = MagicMock(
        file_url="https://r2.dev/notes.md",
        file_size_mb=0.5,
        page_count=None,
        thumbnail_url=None,
        content_text=extracted_text,
        file_sha256="a" * 64,
        r2_keys=["notes.md"],
    )

    admin_query = MagicMock()
    admin_query.execute.return_value = MagicMock(data=[])
    admins_table = MagicMock()
    admins_table.select.return_value.eq.return_value = admin_query

    insert_query = MagicMock()
    insert_query.execute.side_effect = [
        Exception("PostgreSQL error: string is too long for tsvector"),
        MagicMock(data=[{"id": 9, "title": "Large notes"}]),
    ]
    documents_table = MagicMock()
    documents_table.insert.return_value = insert_query
    mock_supabase.table.side_effect = lambda name: (
        admins_table if name == "admins" else documents_table
    )

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Large notes", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_text},
    )

    assert response.status_code == 200
    assert documents_table.insert.call_count == 2
    first_payload = documents_table.insert.call_args_list[0].args[0]
    retry_payload = documents_table.insert.call_args_list[1].args[0]
    assert first_payload["content_text"] == extracted_text
    assert retry_payload["content_text"] == extracted_text[:CONTENT_SEARCH_FALLBACK_CHARS]
    mock_delete_r2.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
@patch("app.routers.documents.upload_to_r2")
async def test_upload_docx_success(mock_upload_r2, mock_supabase, mock_upload_file_docx, test_client):
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}
    mock_upload_r2.return_value = "https://r2.dev/assignment.docx"
    mock_docs_table = _mock_supabase_student_insert(mock_supabase, {"id": 8, "title": "Test Doc"})

    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS"},
        files={"file": mock_upload_file_docx}
    )

    assert response.status_code == 200
    payload = mock_docs_table.insert.call_args[0][0]
    assert payload["thumbnail_url"] is None
    # Only the file itself is uploaded — there is no thumbnail for Office types.
    assert mock_upload_r2.call_count == 1

@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
@patch("app.routers.documents.upload_to_r2")
@patch("app.routers.documents.extract_pdf_metadata")
async def test_upload_success_as_student(mock_extract_pdf, mock_upload_r2, mock_supabase, mock_upload_file, test_client):
    app.dependency_overrides[verify_token] = lambda: {"id": "user123"}
    
    mock_extract_pdf.return_value = (5, b"thumb_bytes")
    mock_upload_r2.return_value = "https://r2.dev/file.pdf"
    
    # Mock not admin
    mock_admin_response = MagicMock()
    mock_admin_response.data = []
    
    # Mock insert success
    mock_insert_response = MagicMock()
    mock_insert_response.data = [{"id": 1, "title": "Test Doc", "status": "pending"}]
    
    mock_select = MagicMock()
    mock_eq = MagicMock()
    mock_eq.execute.return_value = mock_admin_response
    mock_select.eq.return_value = mock_eq
    
    mock_insert = MagicMock()
    mock_insert.execute.return_value = mock_insert_response
    
    mock_docs_table = MagicMock()
    mock_docs_table.insert.return_value = mock_insert
    
    def side_effect(table_name):
        if table_name == "admins":
            mock_admins_table = MagicMock()
            mock_admins_table.select.return_value = mock_select
            return mock_admins_table
        elif table_name == "documents":
            return mock_docs_table
        return MagicMock()
        
    mock_supabase.table.side_effect = side_effect
    
    response = test_client.post(
        "/api/v1/documents/upload/",
        data={"title": "Test Doc", "category": "notes", "subject": "CS", "status": "approved"},
        files={"file": mock_upload_file}
    )
    
    assert response.status_code == 200
    assert response.json()["id"] == 1
    # Check that insert was called with status pending
    inserted_payload = mock_docs_table.insert.call_args[0][0]
    assert inserted_payload["status"] == "pending"

@pytest.mark.asyncio
@patch("app.routers.documents.supabase")
@patch("app.routers.documents._r2_keys_for_doc")
@patch("app.routers.documents.delete_from_r2")
async def test_delete_document_success(mock_delete_r2, mock_r2_keys, mock_supabase, test_client):
    app.dependency_overrides[verify_admin] = lambda: {"id": "admin1"}
    
    mock_r2_keys.return_value = ["file.pdf", "thumb.jpg"]
    
    # Mock doc exists
    mock_doc_response = MagicMock()
    mock_doc_response.data = [{"file_url": "url", "thumbnail_url": "url"}]
    
    mock_select = MagicMock()
    mock_eq_select = MagicMock()
    mock_eq_select.execute.return_value = mock_doc_response
    mock_select.eq.return_value = mock_eq_select
    
    # Mock delete
    mock_delete = MagicMock()
    mock_eq_delete = MagicMock()
    mock_eq_delete.execute.return_value = MagicMock()
    mock_delete.eq.return_value = mock_eq_delete
    
    def side_effect(table_name):
        mock_table = MagicMock()
        if table_name == "documents":
            mock_table.select.return_value = mock_select
            mock_table.delete.return_value = mock_delete
        return mock_table
        
    mock_supabase.table.side_effect = side_effect
    
    response = test_client.delete(
        "/api/v1/documents/1"
    )
    
    assert response.status_code == 200
    assert response.json()["deleted_id"] == 1
    mock_delete_r2.assert_called_once_with(["file.pdf", "thumb.jpg"])
