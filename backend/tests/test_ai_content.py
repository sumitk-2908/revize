"""Tests for app.routers.ai_content.

Offline like tests/test_llm.py: the Supabase client is a scripted fake and the LLM
is stubbed, so the suite needs no database, no admin account, and no API key. The
failure modes worth testing here — a pasted quiz with no correct answer, a 1 MB
blob, an AAL1 token, a draft leaking to a student — are all things you cannot
provoke against the real stack on demand.
"""

from typing import Any, Optional
from unittest.mock import patch

import pytest
from jose import jwt

from app import llm
from app.auth import verify_admin, verify_token
from app.main import app
from app.routers import ai_content


# --------------------------------------------------------------------------
# Harness
# --------------------------------------------------------------------------


class _Response:
    def __init__(self, data: Any = None, count: Optional[int] = None):
        self.data = data if data is not None else []
        self.count = count


class _Query:
    """A chainable PostgREST query stub that records what was asked for."""

    def __init__(self, table: str, store: "_FakeSupabase"):
        self.table_name = table
        self.store = store
        self.verb: Optional[str] = None
        self.columns: Optional[str] = None
        self.count_mode: Optional[str] = None
        self.payload: Any = None
        self.filters: dict[str, Any] = {}
        self.orders: list[tuple[str, bool]] = []

    def select(self, columns: str = "*", count: Optional[str] = None) -> "_Query":
        self.verb = "select"
        self.columns = columns
        self.count_mode = count
        return self

    def insert(self, payload: Any) -> "_Query":
        self.verb = "insert"
        self.payload = payload
        return self

    def update(self, payload: Any) -> "_Query":
        self.verb = "update"
        self.payload = payload
        return self

    def delete(self) -> "_Query":
        self.verb = "delete"
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self.filters[column] = value
        return self

    def or_(self, expression: str) -> "_Query":
        self.filters["or"] = expression
        return self

    def limit(self, count: int) -> "_Query":
        return self

    def order(self, column: str, desc: bool = False) -> "_Query":
        self.orders.append((column, desc))
        return self

    def execute(self) -> _Response:
        self.store.calls.append(self)
        return self.store.respond(self)


class _FakeSupabase:
    """Stands in for the service-role Supabase client.

    Handlers are keyed by (table, verb). A handler may be a _Response, an
    Exception to raise, a callable taking the query, or a list of those consumed
    one per call — which is how a flow that hits one table twice is scripted.
    """

    def __init__(self):
        self.calls: list[_Query] = []
        self.rpc_calls: list[tuple[str, dict]] = []
        self.rpc_result: Any = None
        self._handlers: dict[tuple[str, str], Any] = {}

    def on(self, table: str, verb: str, result: Any) -> "_FakeSupabase":
        self._handlers[(table, verb)] = result
        return self

    def table(self, name: str) -> _Query:
        return _Query(name, self)

    def rpc(self, function_name: str, params: dict) -> _Query:
        self.rpc_calls.append((function_name, params))
        query = _Query(f"rpc:{function_name}", self)
        query.verb = "rpc"
        query.payload = params
        return query

    def respond(self, query: _Query) -> _Response:
        if query.verb == "rpc":
            return _Response(self.rpc_result)

        result = self._handlers.get((query.table_name, query.verb), _Response([]))
        if isinstance(result, list):
            result = result.pop(0) if result else _Response([])
        if isinstance(result, Exception):
            raise result
        if callable(result):
            result = result(query)
        return result

    def calls_to(self, table: str, verb: str) -> list[_Query]:
        return [c for c in self.calls if c.table_name == table and c.verb == verb]


ADMIN_ID = "11111111-2222-3333-4444-555555555555"
DOCUMENT = {"id": 12, "title": "DSD Module 1", "status": "approved"}


def _echo_insert(query: _Query) -> _Response:
    """Hand the inserted row back with an id, the way PostgREST does."""
    row = dict(query.payload)
    row.setdefault("id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    return _Response([row])


def _wire(store: _FakeSupabase, *, document: Optional[dict] = None, highest_version: Optional[int] = None):
    """Default wiring: the document exists, and the draft insert echoes back."""
    store.on("documents", "select", lambda _q: _Response([document or DOCUMENT], count=0))
    store.on(
        "document_ai_content",
        "select",
        lambda _q: _Response([{"version": highest_version}] if highest_version else []),
    )
    store.on("document_ai_content", "insert", _echo_insert)
    store.on("admin_audit_log", "insert", _echo_insert)
    return store


@pytest.fixture
def store(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(ai_content, "supabase", fake)
    return fake


@pytest.fixture
def as_admin():
    """An AAL2 admin, with verify_admin itself bypassed.

    The gate is exercised for real in test_aal1_admin_is_refused_on_every_write.
    """
    app.dependency_overrides[verify_admin] = lambda: {"id": ADMIN_ID}
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


_SUMMARY = {"summary": "Karnaugh maps simplify boolean algebra.", "key_points": ["First", "Second"]}
_QUIZ = {
    "questions": [
        {
            "question": "Which is correct?",
            "options": ["a", "b", "c", "d"],
            "correct_index": 2,
            "explanation": "Because c.",
        }
    ]
}


# --------------------------------------------------------------------------
# Routing
#
# ai_content mounts at the same /api/v1/documents prefix as documents.py, and
# FastAPI matches in declaration order — so both of these are regression tests
# for the mount, not for the handlers.
# --------------------------------------------------------------------------


def test_bulk_status_still_resolves_after_the_ai_content_mount(test_client):
    """/bulk-status only works because its shape differs from /{id}/status."""
    response = test_client.patch(
        "/api/v1/documents/bulk-status", json={"document_ids": [1], "status": "approved"}
    )

    # 401 means it reached bulk_update_document_status and stopped at auth.
    # 404/405 would mean the mount stole the route.
    assert response.status_code == 401


def test_document_delete_still_resolves(test_client):
    assert test_client.delete("/api/v1/documents/12").status_code == 401


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/documents/12/ai-content"),
        ("post", "/api/v1/documents/12/ai-content/generate"),
        ("put", "/api/v1/documents/12/ai-content"),
        ("post", "/api/v1/documents/12/ai-content/publish"),
        ("delete", "/api/v1/documents/12/ai-content/1?kind=summary"),
    ],
)
def test_every_ai_content_route_is_mounted(test_client, method, path):
    response = test_client.request(method.upper(), path, json={})
    assert response.status_code == 401, response.text


# --------------------------------------------------------------------------
# Authorization
#
# Handlers here hold the service-role key and bypass RLS, so verify_admin is the
# whole authorization boundary. There is no Postgres backstop to fall through to.
# --------------------------------------------------------------------------


def _aal_token(aal: str) -> str:
    # assert_aal2 reads claims without verifying the signature because Supabase has
    # already authenticated the token. Use a structurally valid JWT so this test
    # remains compatible with python-jose's stricter claim decoder.
    return jwt.encode({"aal": aal}, "test-secret", algorithm="HS256")


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/v1/documents/12/ai-content", None),
        ("post", "/api/v1/documents/12/ai-content/generate", {"kind": "summary"}),
        ("put", "/api/v1/documents/12/ai-content", {"kind": "summary", "payload": _SUMMARY}),
        ("post", "/api/v1/documents/12/ai-content/publish", {"kind": "summary", "version": 1}),
        ("delete", "/api/v1/documents/12/ai-content/1?kind=summary", None),
    ],
)
@patch("app.auth.supabase")
def test_aal1_admin_is_refused_on_every_endpoint(mock_auth_supabase, test_client, method, path, body):
    """A real admin without TOTP verification gets nothing, read included."""
    mock_auth_supabase.table().select().eq().execute.return_value = _Response([{"id": 1}])
    app.dependency_overrides[verify_token] = lambda: {
        "id": ADMIN_ID,
        "raw_jwt": _aal_token("aal1"),
    }

    response = getattr(test_client, method)(path, json=body) if body else getattr(test_client, method)(path)

    assert response.status_code == 403
    assert "AAL2" in response.json()["detail"]


# --------------------------------------------------------------------------
# Pasted payloads — the same gate the generated path goes through
# --------------------------------------------------------------------------


def test_pasted_summary_lands_as_a_manual_draft(store, as_admin, test_client):
    _wire(store, highest_version=3)

    response = test_client.put(
        "/api/v1/documents/12/ai-content",
        json={"kind": "summary", "payload": _SUMMARY, "model": "gemini-2.5-pro"},
    )

    assert response.status_code == 200
    row = store.calls_to("document_ai_content", "insert")[0].payload
    assert row["status"] == "draft", "a paste must never publish itself"
    assert row["source"] == "manual"
    assert row["model"] == "gemini-2.5-pro"
    assert row["created_by"] == ADMIN_ID
    assert row["version"] == 4, "one past the highest existing version"
    assert row["payload"] == _SUMMARY


def test_a_pasted_quiz_with_no_correct_answer_is_rejected(store, as_admin, test_client):
    """The QuizQuestion validator that guards generated output guards paste too."""
    _wire(store)
    broken = {
        "questions": [
            {
                "question": "Which?",
                "options": ["a", "b", "c", "d"],
                "correct_index": 9,
                "explanation": "e",
            }
        ]
    }

    response = test_client.put(
        "/api/v1/documents/12/ai-content", json={"kind": "quiz", "payload": broken}
    )

    assert response.status_code == 422
    assert "correct_index 9 is outside the 4 options" in response.json()["detail"]
    assert store.calls_to("document_ai_content", "insert") == []


def test_schema_shaped_but_empty_paste_is_rejected(store, as_admin, test_client):
    _wire(store)

    response = test_client.put(
        "/api/v1/documents/12/ai-content",
        json={"kind": "summary", "payload": {"summary": "", "key_points": []}},
    )

    assert response.status_code == 422
    assert store.calls_to("document_ai_content", "insert") == []


def test_oversized_payload_is_rejected(store, as_admin, test_client):
    """Nothing else bounds a pasted blob, and a summary lands in the SSR'd HTML."""
    _wire(store)
    huge = {"summary": "A" * (ai_content.MAX_PAYLOAD_BYTES + 1), "key_points": ["x"]}

    response = test_client.put(
        "/api/v1/documents/12/ai-content", json={"kind": "summary", "payload": huge}
    )

    assert response.status_code == 413
    assert "64 KB" in response.json()["detail"]
    assert store.calls_to("document_ai_content", "insert") == []


@pytest.mark.parametrize(
    "kind,field,over",
    [
        ("summary", "key_points", 26),
        ("flashcards", "cards", 51),
        ("quiz", "questions", 31),
    ],
)
def test_array_length_caps_are_enforced(store, as_admin, test_client, kind, field, over):
    _wire(store)
    unit = {
        "summary": "point",
        "flashcards": {"question": "q", "answer": "a"},
        "quiz": {"question": "q", "options": ["a", "b"], "correct_index": 0, "explanation": "e"},
    }[kind]
    payload = {field: [unit] * over}
    if kind == "summary":
        payload["summary"] = "Body."

    response = test_client.put(
        "/api/v1/documents/12/ai-content", json={"kind": kind, "payload": payload}
    )

    assert response.status_code == 422
    assert f"{field} holds {over}" in response.json()["detail"]


def test_keys_outside_the_schema_are_stripped_before_insert(store, as_admin, test_client):
    """model_dump() on the way out, so a paste cannot smuggle extra fields in."""
    _wire(store)

    test_client.put(
        "/api/v1/documents/12/ai-content",
        json={"kind": "summary", "payload": {**_SUMMARY, "status": "published", "evil": True}},
    )

    stored = store.calls_to("document_ai_content", "insert")[0].payload["payload"]
    assert set(stored) == {"summary", "key_points"}


def test_unknown_kind_is_rejected_before_any_db_work(store, as_admin, test_client):
    _wire(store)

    response = test_client.put(
        "/api/v1/documents/12/ai-content", json={"kind": "mnemonics", "payload": {}}
    )

    assert response.status_code == 422
    assert store.calls == []


def test_unknown_document_is_404(store, as_admin, test_client):
    store.on("documents", "select", _Response([]))

    response = test_client.put(
        "/api/v1/documents/999/ai-content", json={"kind": "summary", "payload": _SUMMARY}
    )

    assert response.status_code == 404
    assert store.calls_to("document_ai_content", "insert") == []


def test_a_version_collision_is_retried_once(store, as_admin, test_client):
    """Two admins drafting at the same moment both compute the same next version."""

    class _UniqueViolation(Exception):
        code = "23505"

    _wire(store, highest_version=1)
    store.on(
        "document_ai_content",
        "insert",
        [_UniqueViolation("duplicate key value violates unique constraint"), _echo_insert],
    )
    # The retry re-reads, and now sees the winner's row.
    store.on(
        "document_ai_content",
        "select",
        [_Response([{"version": 1}]), _Response([{"version": 2}])],
    )

    response = test_client.put(
        "/api/v1/documents/12/ai-content", json={"kind": "summary", "payload": _SUMMARY}
    )

    assert response.status_code == 200
    assert response.json()["version"]["version"] == 3


# --------------------------------------------------------------------------
# Generate
# --------------------------------------------------------------------------


def test_generate_is_503_with_no_provider_configured(store, as_admin, test_client, monkeypatch):
    _wire(store)
    monkeypatch.setattr(llm, "is_configured", lambda: False)

    response = test_client.post(
        "/api/v1/documents/12/ai-content/generate", json={"kind": "summary"}
    )

    assert response.status_code == 503
    assert "Paste content generated elsewhere" in response.json()["detail"]


def test_generate_is_422_when_the_document_has_no_extracted_text(store, as_admin, test_client, monkeypatch):
    """Half the corpus is handwritten scans Tesseract cannot read."""
    monkeypatch.setattr(llm, "is_configured", lambda: True)
    store.on("documents", "select", _Response([{**DOCUMENT, "content_text": "  \n\t "}]))

    response = test_client.post(
        "/api/v1/documents/12/ai-content/generate", json={"kind": "summary"}
    )

    assert response.status_code == 422
    assert "Paste content generated from the file itself" in response.json()["detail"]


def test_generate_is_502_when_the_model_returns_nothing_usable(store, as_admin, test_client, monkeypatch):
    _wire(store)
    store.on("documents", "select", _Response([{**DOCUMENT, "content_text": "Real content."}]))
    monkeypatch.setattr(llm, "is_configured", lambda: True)

    async def _nothing(kind, content_text, *, title=None):
        return None

    monkeypatch.setattr(llm, "generate", _nothing)

    response = test_client.post(
        "/api/v1/documents/12/ai-content/generate", json={"kind": "summary"}
    )

    assert response.status_code == 502
    assert store.calls_to("document_ai_content", "insert") == []


def test_generate_stores_a_draft_with_the_model_that_answered(store, as_admin, test_client, monkeypatch):
    _wire(store, highest_version=2)
    store.on(
        "documents",
        "select",
        _Response([{**DOCUMENT, "content_text": "Karnaugh maps simplify boolean algebra."}]),
    )
    monkeypatch.setattr(llm, "is_configured", lambda: True)

    seen: dict = {}

    async def _fake_generate(kind, content_text, *, title=None):
        seen.update(kind=kind, content_text=content_text, title=title)
        return llm.LLMResult(
            data=llm.DocumentSummary(**_SUMMARY),
            model="openai/gpt-oss-20b",
            total_tokens=987,
        )

    monkeypatch.setattr(llm, "generate", _fake_generate)

    response = test_client.post(
        "/api/v1/documents/12/ai-content/generate", json={"kind": "summary"}
    )

    assert response.status_code == 200
    assert seen["title"] == "DSD Module 1", "the title steers the summary"
    row = store.calls_to("document_ai_content", "insert")[0].payload
    assert row["status"] == "draft", "generated output is never auto-published"
    assert row["source"] == "generated"
    assert row["model"] == "openai/gpt-oss-20b"
    assert row["version"] == 3


# --------------------------------------------------------------------------
# Publish, rollback, delete
# --------------------------------------------------------------------------


def test_publish_calls_the_rpc_and_writes_an_ai_publish_audit_row(store, as_admin, test_client):
    _wire(store)
    store.on("document_ai_content", "select", _Response([{"id": "row-1"}]))
    store.rpc_result = {"id": "row-1", "kind": "summary", "version": 2, "status": "published"}

    response = test_client.post(
        "/api/v1/documents/12/ai-content/publish", json={"kind": "summary", "version": 2}
    )

    assert response.status_code == 200
    assert store.rpc_calls == [
        (
            "publish_ai_content",
            {
                "p_document_id": 12,
                "p_kind": "summary",
                "p_version": 2,
                "p_admin_id": ADMIN_ID,
            },
        )
    ]
    audit = store.calls_to("admin_audit_log", "insert")[0].payload
    # 20260823000000_document_ai_content.sql extends the action CHECK to allow this.
    assert audit["action"] == "ai_publish"
    assert audit["target_id"] == 12
    assert audit["metadata"] == {"kind": "summary", "version": 2}


def test_publishing_an_unknown_version_is_404_and_never_reaches_the_rpc(store, as_admin, test_client):
    _wire(store)
    store.on("document_ai_content", "select", _Response([]))

    response = test_client.post(
        "/api/v1/documents/12/ai-content/publish", json={"kind": "quiz", "version": 9}
    )

    assert response.status_code == 404
    assert store.rpc_calls == []


def test_rollback_is_the_same_publish_call_with_an_earlier_version(store, as_admin, test_client):
    """The RPC accepts archived rows, so rollback needs no separate endpoint."""
    _wire(store)
    store.on("document_ai_content", "select", _Response([{"id": "row-1"}]))
    store.rpc_result = {"id": "row-1", "kind": "summary", "version": 1, "status": "published"}

    response = test_client.post(
        "/api/v1/documents/12/ai-content/publish", json={"kind": "summary", "version": 1}
    )

    assert response.status_code == 200
    assert store.rpc_calls[0][1]["p_version"] == 1


def test_delete_filters_to_drafts_only(store, as_admin, test_client):
    _wire(store)
    store.on("document_ai_content", "delete", _Response([{"id": "row-1"}]))

    response = test_client.delete("/api/v1/documents/12/ai-content/2?kind=flashcards")

    assert response.status_code == 200
    filters = store.calls_to("document_ai_content", "delete")[0].filters
    assert filters == {
        "document_id": 12,
        "kind": "flashcards",
        "version": 2,
        "status": "draft",
    }


def test_deleting_a_published_version_is_404(store, as_admin, test_client):
    """Nothing matches the status='draft' filter, so nothing is deleted."""
    _wire(store)
    store.on("document_ai_content", "delete", _Response([]))

    response = test_client.delete("/api/v1/documents/12/ai-content/1?kind=summary")

    assert response.status_code == 404
    assert "kept as history" in response.json()["detail"]


def test_delete_requires_the_kind_query_parameter(store, as_admin, test_client):
    """A version number alone does not identify a row: the key is (doc, kind, version)."""
    _wire(store)

    assert test_client.delete("/api/v1/documents/12/ai-content/1").status_code == 422


# --------------------------------------------------------------------------
# Admin listing
# --------------------------------------------------------------------------


def test_listing_returns_drafts_with_prompts_and_schemas(store, as_admin, test_client):
    versions = [
        {"id": "row-2", "kind": "summary", "version": 2, "status": "draft"},
        {"id": "row-1", "kind": "summary", "version": 1, "status": "published"},
    ]
    store.on(
        "documents",
        "select",
        [_Response([DOCUMENT]), _Response([], count=0)],
    )
    store.on("document_ai_content", "select", _Response(versions))

    response = test_client.get("/api/v1/documents/12/ai-content")

    assert response.status_code == 200
    body = response.json()
    assert body["versions"] == versions, "drafts are visible here and nowhere else"
    assert body["document"]["has_content_text"] is True

    # Both come from app.llm, so the manual and generated paths cannot drift.
    assert set(body["kinds"]) == set(llm.KINDS)
    assert "DSD Module 1" in body["kinds"]["summary"]["prompt"]
    assert body["kinds"]["quiz"]["schema"]["properties"]["questions"]
    assert body["kinds"]["quiz"]["schema"]["additionalProperties"] is False


def test_listing_reports_no_content_text_without_downloading_it(store, as_admin, test_client):
    """content_text is capped at 500,000 chars — too much to ship for a boolean."""
    store.on(
        "documents",
        "select",
        [_Response([DOCUMENT]), _Response([{"id": 12}], count=1)],
    )

    response = test_client.get("/api/v1/documents/12/ai-content")

    assert response.json()["document"]["has_content_text"] is False
    count_query = store.calls_to("documents", "select")[1]
    assert count_query.count_mode == "exact"
    assert "content_text" not in (count_query.columns or "")
    # NULL is not enough: the pre-OCR extractor stored whitespace-only text layers.
    assert "[[:space:]]" in count_query.filters["or"]
