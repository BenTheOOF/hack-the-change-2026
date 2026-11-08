import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1"}
    monkeypatch.setattr(settings, "llm_base_url", "https://generativelanguage.googleapis.com/v1beta/openai/")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(settings, "llm_model", "test-model")
    yield TestClient(app)
    app.dependency_overrides.clear()


def fake_post(calls: list, reply: dict, usage: int = 1):
    async def post(self: httpx.AsyncClient, url: str, **kwargs: object) -> httpx.Response:
        calls.append((url, kwargs))
        if url.endswith("/rpc/increment_ai_usage"):
            return httpx.Response(200, json=usage)
        return httpx.Response(200, json=reply)
    return post


def test_chat_uses_openai_compatible_chat_completions(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    reply = {"choices": [{"message": {"role": "assistant", "content": "Hello from Gemini"}}]}
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post(calls, reply))
    response = client.post("/ai/chat", json={"message": "Hi"})
    assert response.status_code == 200
    assert response.json() == {"reply": "Hello from Gemini"}
    url, kwargs = calls[1]
    assert url == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert kwargs["headers"] == {"Authorization": "Bearer test-key"}
    assert kwargs["json"]["model"] == "test-model"
    assert kwargs["json"]["messages"] == [{"role": "user", "content": "Hi"}]
    assert kwargs["json"]["max_tokens"] == settings.llm_max_tokens


def test_chat_accepts_content_parts_and_reports_setup(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    parts = {"choices": [{"message": {"content": [{"type": "text", "text": "Hel"}, {"type": "text", "text": "lo"}]}}]}
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post([], parts))
    assert client.post("/ai/chat", json={"message": "Hi"}).json() == {"reply": "Hello"}
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post([], {}, usage=99))
    assert client.post("/ai/chat", json={"message": "Hi"}).status_code == 429
    monkeypatch.setattr(settings, "llm_base_url", "")
    assert client.post("/ai/chat", json={"message": "Hi"}).status_code == 503
