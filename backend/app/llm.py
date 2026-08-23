"""Groq-backed LLM client for cached AI summaries and study sets.

One module owns one external service, mirroring `app.storage` for R2. Nothing
here raises into a request: every entry point returns ``None`` when the feature
is unconfigured or the provider fails, so the AI features ship dark and are
enabled by setting ``GROQ_API_KEY`` alone.

Sizing note, because it is counter-intuitive: the chosen models have a 131K
context window, but Groq's free tier allows only **8K tokens per minute** and
**200K per day**, per organisation rather than per user. A single request must
therefore fit inside the per-minute allowance, which is why
``MAX_LLM_INPUT_CHARS`` is 20,000 (~5K tokens) and not anything near the context
limit. `app.file_types.MAX_EXTRACTED_TEXT_CHARS` is 25x larger, so truncation is
mandatory rather than an optimisation.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

import httpx
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.config import settings

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# ~5K tokens at the usual four-characters-per-token approximation, leaving room
# for the completion inside one 8K-tokens-per-minute window.
MAX_LLM_INPUT_CHARS = 20_000

# The gpt-oss models are reasoning models and their reasoning tokens are billed
# as completion tokens, so they compete with the answer for the same per-minute
# budget. "low" keeps that overhead small; summarising and question-writing are
# not multi-step problem solving. "hidden" keeps the reasoning out of the
# message content so it cannot corrupt the JSON payload.
_REASONING_EFFORT = "low"
_REASONING_FORMAT = "hidden"

# Low but non-zero: deterministic enough to be reproducible, varied enough that
# a retry after unusable output is not guaranteed to repeat it.
_TEMPERATURE = 0.2

_REQUEST_TIMEOUT = httpx.Timeout(60.0, connect=10.0)

# The one retry covers a model that returned schema-shaped but unusable output.
# It is deliberately *not* a retry for rate limits: a 429 means the daily budget
# is gone, and the scheduled backfill is the right place to pick that up.
_MAX_ATTEMPTS = 2

# Strict mode rejects validation keywords it does not implement, and Pydantic
# emits those for Field(min_length=...). They are stripped from the wire schema
# and still enforced when the response is parsed back into the model, which is
# where they actually matter.
_SUPPORTED_SCHEMA_KEYS = frozenset(
    {
        "type",
        "properties",
        "required",
        "additionalProperties",
        "items",
        "enum",
        "anyOf",
        "$defs",
        "$ref",
        "description",
        "title",
    }
)


# --------------------------------------------------------------------------
# Output shapes
#
# These are the second gate. Groq's own docs are explicit that structured
# outputs guarantee "schema compliance but not semantic accuracy", so every
# constraint that actually protects the UI lives here rather than in the schema.
# --------------------------------------------------------------------------


class DocumentSummary(BaseModel):
    summary: str = Field(min_length=1)
    key_points: list[str] = Field(min_length=1)


class Flashcard(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FlashcardSet(BaseModel):
    cards: list[Flashcard] = Field(min_length=1)


class QuizQuestion(BaseModel):
    question: str = Field(min_length=1)
    options: list[str] = Field(min_length=2)
    correct_index: int
    explanation: str = Field(min_length=1)

    @model_validator(mode="after")
    def _correct_index_in_range(self) -> "QuizQuestion":
        """A schema can require an integer; only this can require a *usable* one.

        An out-of-range index renders a quiz with no correct answer, which is
        worse than showing no quiz at all.
        """
        if not 0 <= self.correct_index < len(self.options):
            raise ValueError(
                f"correct_index {self.correct_index} is outside the "
                f"{len(self.options)} options provided"
            )
        return self


class QuizSet(BaseModel):
    questions: list[QuizQuestion] = Field(min_length=1)


T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class LLMResult(Generic[T]):
    """Parsed output plus the provenance a caller needs to store alongside it.

    `model` is the model that actually answered, which is not necessarily the
    one requested — the fallback provider may serve a different one.
    """

    data: T
    model: str
    total_tokens: int | None


@dataclass(frozen=True)
class _Provider:
    label: str
    base_url: str
    api_key: str
    model: str


def _providers(model: str) -> list[_Provider]:
    """Groq first, then the optional OpenAI-compatible fallback.

    An empty list means the feature is switched off, which is a normal state and
    not an error.
    """
    chain: list[_Provider] = []
    if settings.GROQ_API_KEY:
        chain.append(_Provider("groq", _GROQ_BASE_URL, settings.GROQ_API_KEY, model))
    if settings.LLM_FALLBACK_API_KEY and settings.LLM_FALLBACK_BASE_URL:
        chain.append(
            _Provider(
                "fallback",
                settings.LLM_FALLBACK_BASE_URL.rstrip("/"),
                settings.LLM_FALLBACK_API_KEY,
                settings.LLM_FALLBACK_MODEL or model,
            )
        )
    return chain


def is_configured() -> bool:
    """True when at least one provider has a key, so callers can 503 early."""
    return bool(_providers(settings.LLM_MODEL_FAST))


def _strict_schema(model_cls: type[BaseModel]) -> dict[str, Any]:
    """Render a Pydantic model as a Groq strict-mode JSON schema.

    Strict mode demands `additionalProperties: false` on every object and every
    property named in `required`.
    """

    def clean(node: Any) -> Any:
        if isinstance(node, list):
            return [clean(item) for item in node]
        if not isinstance(node, dict):
            return node

        out: dict[str, Any] = {}
        for key, value in node.items():
            if key not in _SUPPORTED_SCHEMA_KEYS:
                continue
            if key in ("properties", "$defs") and isinstance(value, dict):
                # Keys here are author-chosen names, not schema keywords, so
                # they must not be filtered against the keyword allow-list.
                out[key] = {name: clean(sub) for name, sub in value.items()}
            else:
                out[key] = clean(value)

        if out.get("type") == "object":
            out["additionalProperties"] = False
            out["required"] = sorted(out.get("properties", {}))
        return out

    return clean(model_cls.model_json_schema())


def _clip(text: str) -> str:
    stripped = text.strip()
    if len(stripped) <= MAX_LLM_INPUT_CHARS:
        return stripped
    print(
        f"Warning: document text truncated from {len(stripped)} to "
        f"{MAX_LLM_INPUT_CHARS} chars for the LLM — the result describes only "
        "the start of this document."
    )
    return stripped[:MAX_LLM_INPUT_CHARS]


def _build_body(
    provider: _Provider,
    *,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
    max_completion_tokens: int,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": _TEMPERATURE,
        # max_tokens is deprecated on Groq in favour of this.
        "max_completion_tokens": max_completion_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": schema,
            },
        },
    }
    if provider.label == "groq":
        # Groq-specific knobs. The fallback is any OpenAI-compatible endpoint and
        # would 400 on parameters it does not recognise.
        body["reasoning_effort"] = _REASONING_EFFORT
        body["reasoning_format"] = _REASONING_FORMAT
    return body


def _parse(
    response: httpx.Response, model_cls: type[T], label: str
) -> tuple[T, str, int | None] | None:
    try:
        envelope = response.json()
        content = envelope["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        print(f"Warning: {label} LLM returned an unreadable envelope: {exc}")
        return None

    try:
        data = model_cls.model_validate_json(content)
    except ValidationError as exc:
        print(
            f"Warning: {label} LLM output did not satisfy "
            f"{model_cls.__name__} ({exc.error_count()} error(s))"
        )
        return None

    model_used = envelope.get("model") or label
    usage = envelope.get("usage") or {}
    return data, model_used, usage.get("total_tokens")


async def _complete(
    *,
    model_cls: type[T],
    schema_name: str,
    system: str,
    user: str,
    model: str,
    max_completion_tokens: int,
) -> LLMResult[T] | None:
    """Call the provider chain until one returns valid output, else None."""
    chain = _providers(model)
    if not chain:
        return None

    schema = _strict_schema(model_cls)

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        for provider in chain:
            body = _build_body(
                provider,
                system=system,
                user=user,
                schema_name=schema_name,
                schema=schema,
                max_completion_tokens=max_completion_tokens,
            )

            for _attempt in range(_MAX_ATTEMPTS):
                try:
                    response = await client.post(
                        f"{provider.base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {provider.api_key}"},
                        json=body,
                    )
                except httpx.RequestError as exc:
                    print(f"Warning: {provider.label} LLM request could not be sent: {exc}")
                    break

                status = response.status_code

                if status == 429 or status >= 500:
                    # Out of quota or provider trouble. Move on rather than
                    # sleeping: nothing here blocks a user, and the scheduled
                    # backfill retries whatever is left unpopulated.
                    retry_after = response.headers.get("Retry-After")
                    suffix = f" (Retry-After: {retry_after})" if retry_after else ""
                    print(
                        f"Warning: {provider.label} LLM is unavailable "
                        f"({status}){suffix}."
                    )
                    break

                if status >= 400:
                    # A bad key, model id, or schema. It will fail identically
                    # on the next provider, so stop instead of spending a second
                    # key's quota proving it.
                    print(
                        f"Warning: {provider.label} LLM rejected the request "
                        f"({status}): {response.text[:500]}"
                    )
                    return None

                parsed = _parse(response, model_cls, provider.label)
                if parsed is not None:
                    data, model_used, total_tokens = parsed
                    if total_tokens is not None:
                        print(
                            f"{provider.label} LLM {schema_name}: "
                            f"{total_tokens} tokens ({model_used})"
                        )
                    return LLMResult(data=data, model=model_used, total_tokens=total_tokens)
                # Unusable payload: retry once on this provider, then fall through.

    return None


# --------------------------------------------------------------------------
# Tasks
#
# The text reaching these functions may be OCR output, so every prompt tells the
# model to skip garbled fragments rather than guess at them. A confident summary
# of misread text is worse than no summary, because the student reads it as fact.
# --------------------------------------------------------------------------

_GROUNDING = (
    "Work only from the text provided. Never add facts that are not in it. "
    "The text may come from OCR of a scan or photo and can contain garbled "
    "fragments and broken words — ignore those rather than guessing what they "
    "meant. It may also be only the beginning of a longer document, so do not "
    "claim to cover material you were not given."
)

_SUMMARY_SYSTEM = (
    "You summarise academic study material for university students. "
    + _GROUNDING
    + " If the text is too fragmentary to summarise, say exactly that "
    "in the summary field instead of inventing content."
)

_FLASHCARDS_SYSTEM = (
    "You write revision flashcards for university students. "
    + _GROUNDING
    + " Each card tests one specific idea. Prefer definitions, "
    "mechanisms, and worked distinctions over trivia."
)

_QUIZ_SYSTEM = (
    "You write multiple-choice quiz questions for university students. "
    + _GROUNDING
    + " Exactly one option is correct and the wrong options are "
    "plausible enough to be worth ruling out. correct_index is the "
    "zero-based position of the correct option."
)


def _summary_instruction(heading: str) -> str:
    return (
        f"Summarise this study document{heading} in two or three sentences, "
        "then give three to six key points a student should take away."
    )


def _flashcards_instruction(heading: str) -> str:
    return (
        f"Write eight to twelve revision flashcards for this document{heading}. "
        "Keep each question answerable in one or two sentences."
    )


def _quiz_instruction(heading: str) -> str:
    return (
        f"Write five to eight multiple-choice questions for this document"
        f"{heading}, each with four options and a one-sentence explanation "
        "of the answer."
    )


def _heading(title: str | None) -> str:
    return f" titled {title!r}" if title else ""


async def summarise_document(
    content_text: str, *, title: str | None = None
) -> LLMResult[DocumentSummary] | None:
    """A short summary plus key points for a document page, or None."""
    if not content_text or not content_text.strip():
        return None

    return await _complete(
        model_cls=DocumentSummary,
        schema_name="document_summary",
        system=_SUMMARY_SYSTEM,
        user=f"{_summary_instruction(_heading(title))}\n\n---\n{_clip(content_text)}",
        model=settings.LLM_MODEL_FAST,
        max_completion_tokens=1_200,
    )


async def generate_flashcards(
    content_text: str, *, title: str | None = None
) -> LLMResult[FlashcardSet] | None:
    """Question-and-answer flashcards for a document, or None."""
    if not content_text or not content_text.strip():
        return None

    return await _complete(
        model_cls=FlashcardSet,
        schema_name="flashcard_set",
        system=_FLASHCARDS_SYSTEM,
        user=f"{_flashcards_instruction(_heading(title))}\n\n---\n{_clip(content_text)}",
        model=settings.LLM_MODEL_STRONG,
        max_completion_tokens=2_500,
    )


async def generate_quiz(
    content_text: str, *, title: str | None = None
) -> LLMResult[QuizSet] | None:
    """Multiple-choice quiz questions for a document, or None."""
    if not content_text or not content_text.strip():
        return None

    return await _complete(
        model_cls=QuizSet,
        schema_name="quiz_set",
        system=_QUIZ_SYSTEM,
        user=f"{_quiz_instruction(_heading(title))}\n\n---\n{_clip(content_text)}",
        model=settings.LLM_MODEL_STRONG,
        max_completion_tokens=2_500,
    )


# --------------------------------------------------------------------------
# Kind registry
#
# The manual path — an admin pasting output from ChatGPT or Gemini — is not a
# second-class citizen here, it is the primary one. It exists because three
# limits apply to Groq and to nothing else: the 200K tokens/day free tier shared
# by the whole organisation, MAX_LLM_INPUT_CHARS above (so the model sees at most
# the first 4% of a long document), and OCR quality on handwritten scans.
#
# Both paths therefore have to produce the same shape, which is what this
# registry is for: one entry per artifact kind, holding the validator, the
# generator, and the prompt text a human pastes elsewhere. Adding a kind means
# adding one entry rather than touching the router.
# --------------------------------------------------------------------------

KINDS = ("summary", "flashcards", "quiz")


@dataclass(frozen=True)
class _Task:
    model_cls: type[BaseModel]
    system: str
    instruction: Callable[[str], str]
    generate: Callable[..., Any]


_TASKS: dict[str, _Task] = {
    "summary": _Task(DocumentSummary, _SUMMARY_SYSTEM, _summary_instruction, summarise_document),
    "flashcards": _Task(
        FlashcardSet, _FLASHCARDS_SYSTEM, _flashcards_instruction, generate_flashcards
    ),
    "quiz": _Task(QuizSet, _QUIZ_SYSTEM, _quiz_instruction, generate_quiz),
}


def model_for(kind: str) -> type[BaseModel]:
    """The Pydantic model a payload of this kind must satisfy.

    The same gate as the generated path: an admin pasting a quiz whose
    `correct_index` points past its options is rejected exactly as the model
    would be.
    """
    return _TASKS[kind].model_cls


def schema_for(kind: str) -> dict[str, Any]:
    """The JSON schema for this kind, for the admin UI to show alongside paste."""
    return _strict_schema(_TASKS[kind].model_cls)


async def generate(kind: str, content_text: str, *, title: str | None = None):
    """Dispatch to the generator for `kind`. Returns an LLMResult or None."""
    return await _TASKS[kind].generate(content_text, title=title)


def manual_prompt(kind: str, *, title: str | None = None) -> str:
    """The prompt to paste into ChatGPT or Gemini alongside the document itself.

    Deliberately built from the same system text and instruction the Groq call
    uses, so a pasted result and a generated one are shaped and grounded alike.
    The document text is *not* included: the whole point of the manual path is
    that the admin attaches the original PDF or scan, which is both complete and
    unmangled by OCR.
    """
    task = _TASKS[kind]
    return (
        f"{task.system}\n\n"
        f"{task.instruction(_heading(title))}\n\n"
        "Reply with JSON only — no prose, no markdown fence — matching this "
        f"schema exactly:\n\n{json.dumps(_strict_schema(task.model_cls), indent=2)}"
    )
