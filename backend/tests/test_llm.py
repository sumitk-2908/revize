"""Tests for app.llm.

Every test stubs `httpx.AsyncClient`, so the suite needs no API key and makes no
network call. That matters beyond CI hygiene: the failure modes worth testing
here are rate limits and malformed model output, neither of which you can
provoke on demand against the real provider.
"""

import json

import httpx
import pytest

from app import llm


# --------------------------------------------------------------------------
# Harness
# --------------------------------------------------------------------------


class _FakeClient:
    """Stands in for httpx.AsyncClient, replaying a scripted response list."""

    def __init__(self, script, recorder):
        self._script = script
        self._recorder = recorder

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, url, headers=None, json=None):
        self._recorder.append({"url": url, "headers": headers or {}, "body": json})
        if not self._script:
            raise AssertionError("app.llm made more requests than the test scripted")
        nxt = self._script.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


def _install(monkeypatch, *script, groq="groq-key", fallback=None):
    """Point app.llm at a scripted transport and return the request recorder."""
    recorder = []
    remaining = list(script)

    monkeypatch.setattr(
        llm.httpx, "AsyncClient", lambda **_kwargs: _FakeClient(remaining, recorder)
    )
    monkeypatch.setattr(llm.settings, "GROQ_API_KEY", groq)

    if fallback:
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_API_KEY", "fallback-key")
        # Trailing slash on purpose: the module must normalise it.
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_BASE_URL", "https://fallback.test/v1/")
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_MODEL", "fallback-model")
    else:
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_API_KEY", None)
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_BASE_URL", None)
        monkeypatch.setattr(llm.settings, "LLM_FALLBACK_MODEL", None)

    return recorder


def _ok(payload, *, model="openai/gpt-oss-20b", total_tokens=1234):
    return httpx.Response(
        200,
        json={
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": json.dumps(payload)},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"total_tokens": total_tokens},
        },
    )


def _raw(content):
    """A 200 whose message content is not valid JSON for the target model."""
    return httpx.Response(
        200,
        json={
            "model": "openai/gpt-oss-20b",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
            "usage": {"total_tokens": 10},
        },
    )


_SUMMARY = {"summary": "A short summary.", "key_points": ["First", "Second"]}
_QUIZ_ONE = {
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
# Ships dark
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_none_and_makes_no_call_when_unconfigured(monkeypatch):
    recorder = _install(monkeypatch, groq=None)

    assert llm.is_configured() is False
    assert await llm.summarise_document("Plenty of text here.") is None
    assert recorder == []


@pytest.mark.asyncio
async def test_is_configured_true_with_only_a_fallback(monkeypatch):
    _install(monkeypatch, groq=None, fallback=True)
    assert llm.is_configured() is True


@pytest.mark.asyncio
async def test_blank_text_short_circuits_before_any_request(monkeypatch):
    recorder = _install(monkeypatch)

    assert await llm.summarise_document("   \n\t ") is None
    assert await llm.generate_flashcards("") is None
    assert await llm.generate_quiz("\n") is None
    assert recorder == []


# --------------------------------------------------------------------------
# Success path and request shape
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_summary_success_returns_parsed_result_with_provenance(monkeypatch):
    recorder = _install(monkeypatch, _ok(_SUMMARY, total_tokens=987))

    result = await llm.summarise_document("Karnaugh maps simplify boolean algebra.")

    assert result is not None
    assert result.data.summary == "A short summary."
    assert result.data.key_points == ["First", "Second"]
    assert result.model == "openai/gpt-oss-20b"
    assert result.total_tokens == 987
    assert len(recorder) == 1


@pytest.mark.asyncio
async def test_request_targets_groq_with_strict_schema_and_reasoning_knobs(monkeypatch):
    recorder = _install(monkeypatch, _ok(_SUMMARY))

    await llm.summarise_document("Some content.", title="DSD Module 1")

    sent = recorder[0]
    assert sent["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert sent["headers"]["Authorization"] == "Bearer groq-key"

    body = sent["body"]
    assert body["model"] == llm.settings.LLM_MODEL_FAST
    assert body["max_completion_tokens"] == 1_200
    assert "max_tokens" not in body, "max_tokens is deprecated on Groq"
    assert body["reasoning_effort"] == "low"
    assert body["reasoning_format"] == "hidden"

    schema_block = body["response_format"]["json_schema"]
    assert body["response_format"]["type"] == "json_schema"
    assert schema_block["strict"] is True
    assert schema_block["name"] == "document_summary"

    # The title should reach the prompt, since it steers the summary.
    assert "DSD Module 1" in body["messages"][1]["content"]


@pytest.mark.asyncio
async def test_flashcards_and_quiz_use_the_strong_model(monkeypatch):
    recorder = _install(monkeypatch, _ok({"cards": [{"question": "q", "answer": "a"}]}))
    await llm.generate_flashcards("Content.")
    assert recorder[0]["body"]["model"] == llm.settings.LLM_MODEL_STRONG

    recorder = _install(monkeypatch, _ok(_QUIZ_ONE))
    await llm.generate_quiz("Content.")
    assert recorder[0]["body"]["model"] == llm.settings.LLM_MODEL_STRONG


# --------------------------------------------------------------------------
# Truncation — the cost control
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_input_is_clipped_to_the_per_minute_budget(monkeypatch):
    recorder = _install(monkeypatch, _ok(_SUMMARY))

    body_text = "A" * (llm.MAX_LLM_INPUT_CHARS + 5_000) + "TAIL-MARKER"
    await llm.summarise_document(body_text)

    prompt = recorder[0]["body"]["messages"][1]["content"]
    assert "TAIL-MARKER" not in prompt
    assert prompt.count("A") == llm.MAX_LLM_INPUT_CHARS


@pytest.mark.asyncio
async def test_text_within_the_cap_is_sent_whole(monkeypatch):
    recorder = _install(monkeypatch, _ok(_SUMMARY))

    await llm.summarise_document("Short body. TAIL-MARKER")

    assert "TAIL-MARKER" in recorder[0]["body"]["messages"][1]["content"]


# --------------------------------------------------------------------------
# Failover
# --------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 500, 502, 503])
async def test_rate_limit_and_server_errors_fall_through_to_the_fallback(monkeypatch, status):
    recorder = _install(
        monkeypatch,
        httpx.Response(status, json={"error": "nope"}, headers={"Retry-After": "60"}),
        _ok(_SUMMARY, model="fallback-model"),
        fallback=True,
    )

    result = await llm.summarise_document("Content.")

    assert result is not None
    assert result.model == "fallback-model"
    assert len(recorder) == 2
    assert recorder[1]["url"] == "https://fallback.test/v1/chat/completions"
    assert recorder[1]["headers"]["Authorization"] == "Bearer fallback-key"


@pytest.mark.asyncio
async def test_fallback_request_omits_groq_only_parameters(monkeypatch):
    recorder = _install(
        monkeypatch,
        httpx.Response(429, json={}),
        _ok(_SUMMARY, model="fallback-model"),
        fallback=True,
    )

    await llm.summarise_document("Content.")

    fallback_body = recorder[1]["body"]
    assert "reasoning_effort" not in fallback_body
    assert "reasoning_format" not in fallback_body
    assert fallback_body["model"] == "fallback-model"


@pytest.mark.asyncio
async def test_transport_error_moves_to_the_fallback(monkeypatch):
    recorder = _install(
        monkeypatch,
        httpx.ConnectError("dns is having a day"),
        _ok(_SUMMARY, model="fallback-model"),
        fallback=True,
    )

    result = await llm.summarise_document("Content.")

    assert result is not None
    assert len(recorder) == 2


@pytest.mark.asyncio
async def test_rate_limit_with_no_fallback_configured_returns_none(monkeypatch):
    recorder = _install(monkeypatch, httpx.Response(429, json={}))

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 1, "a 429 must not be retried against the same provider"


@pytest.mark.asyncio
async def test_client_error_does_not_burn_the_fallback_quota(monkeypatch):
    """A 400 is our bug — bad schema, model id, or key — so it fails everywhere."""
    recorder = _install(
        monkeypatch,
        httpx.Response(400, json={"error": {"message": "unknown model"}}),
        fallback=True,
    )

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 1


@pytest.mark.asyncio
async def test_401_is_not_retried(monkeypatch):
    recorder = _install(monkeypatch, httpx.Response(401, json={}), fallback=True)

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 1


# --------------------------------------------------------------------------
# Bad model output
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unparseable_output_is_retried_once_then_handed_to_the_fallback(monkeypatch):
    recorder = _install(
        monkeypatch,
        _raw("I'm afraid I can't do that."),
        _raw("Still not JSON."),
        _ok(_SUMMARY, model="fallback-model"),
        fallback=True,
    )

    result = await llm.summarise_document("Content.")

    assert result is not None
    assert result.model == "fallback-model"
    assert len(recorder) == 3, "two attempts on Groq, then one on the fallback"


@pytest.mark.asyncio
async def test_all_providers_returning_junk_yields_none(monkeypatch):
    recorder = _install(
        monkeypatch,
        _raw("junk"),
        _raw("junk"),
        _raw("junk"),
        _raw("junk"),
        fallback=True,
    )

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 4


@pytest.mark.asyncio
async def test_schema_shaped_but_empty_output_is_rejected(monkeypatch):
    """Valid JSON, right keys, useless values — the Pydantic gate must catch it."""
    recorder = _install(monkeypatch, _ok({"summary": "", "key_points": []}), _raw("x"))

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 2


@pytest.mark.asyncio
async def test_malformed_envelope_is_rejected(monkeypatch):
    recorder = _install(monkeypatch, httpx.Response(200, json={"choices": []}), _raw("x"))

    assert await llm.summarise_document("Content.") is None
    assert len(recorder) == 2


@pytest.mark.asyncio
async def test_out_of_range_correct_index_is_rejected(monkeypatch):
    """A quiz whose correct answer points past the options has no right answer."""
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
    _install(monkeypatch, _ok(broken), _ok(broken))

    assert await llm.generate_quiz("Content.") is None


@pytest.mark.asyncio
async def test_valid_quiz_is_accepted(monkeypatch):
    _install(monkeypatch, _ok(_QUIZ_ONE))

    result = await llm.generate_quiz("Content.")

    assert result is not None
    assert result.data.questions[0].correct_index == 2


# --------------------------------------------------------------------------
# Schema rendering
# --------------------------------------------------------------------------


def _walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


@pytest.mark.parametrize(
    "model_cls", [llm.DocumentSummary, llm.FlashcardSet, llm.QuizSet, llm.QuizQuestion]
)
def test_strict_schema_satisfies_groq_strict_mode_rules(model_cls):
    schema = llm._strict_schema(model_cls)

    for node in _walk(schema):
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            # Strict mode requires *every* property to be listed as required.
            assert sorted(node.get("properties", {})) == node["required"]


@pytest.mark.parametrize("model_cls", [llm.DocumentSummary, llm.FlashcardSet, llm.QuizSet])
def test_strict_schema_omits_keywords_groq_does_not_implement(model_cls):
    schema = llm._strict_schema(model_cls)

    banned = {"minLength", "minItems", "maxItems", "maximum", "minimum", "pattern", "format"}
    for node in _walk(schema):
        assert not banned & set(node), f"unsupported keyword leaked into the schema: {node}"


def test_strict_schema_keeps_nested_models_reachable():
    """Property names must survive the keyword filter, and $defs must remain."""
    schema = llm._strict_schema(llm.QuizSet)

    assert "questions" in schema["properties"]
    assert schema["$defs"], "nested QuizQuestion should be emitted under $defs"

    question = schema["$defs"]["QuizQuestion"]
    assert set(question["properties"]) == {
        "question",
        "options",
        "correct_index",
        "explanation",
    }
