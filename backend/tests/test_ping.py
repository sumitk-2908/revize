from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_ping_endpoint():
    response = client.get("/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "awake"
    assert "version" in data


def test_api_v1_ping_endpoint():
    response = client.get("/api/v1/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "awake"
