import pytest
from httpx import AsyncClient, ASGITransport
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def test_client():
    return TestClient(app)

@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Clear the in-memory rate-limit counters between tests.

    Limits are keyed by client IP and TestClient always presents as the same
    one, so counters accumulate across tests in a module. Without this, the
    sixth request to a 5/minute endpoint gets a 429 instead of the status the
    test is asserting — a failure that depends on test ordering.
    """
    from app.main import limiter as app_limiter
    from app.routers.ai_content import limiter as ai_content_limiter
    from app.routers.documents import limiter as documents_limiter

    for limiter in (app_limiter, documents_limiter, ai_content_limiter):
        reset = getattr(limiter._storage, "reset", None)
        if callable(reset):
            reset()
    yield

@pytest.fixture
async def async_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest.fixture
def mock_supabase_user():
    def _mock_user(email="user@test.com", user_id="123", email_confirmed=True):
        return {
            "email": email,
            "id": user_id,
            "email_confirmed_at": "2023-01-01T00:00:00Z" if email_confirmed else None
        }
    return _mock_user

@pytest.fixture
def mock_auth_header_generator():
    import base64
    import json
    
    def _gen_token(aal="aal1"):
        payload = {"aal": aal}
        payload_bytes = json.dumps(payload).encode("utf-8")
        payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")
        return f"header.{payload_b64}.signature"
        
    return _gen_token
