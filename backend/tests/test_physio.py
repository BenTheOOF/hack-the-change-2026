import asyncio
from datetime import datetime, timezone
from math import cos, radians, sin
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.physio import Point, PoseFrame, angle, classify
from app.routers.physio import Care, get_care


def frames(angles: list[float], visibility: float = 0.97) -> list[PoseFrame]:
    result = []
    for i, angle in enumerate(angles):
        points = [Point(x=0.5, y=0.5, visibility=visibility) for _ in range(33)]
        for hip, knee, ankle in ((23, 25, 27), (24, 26, 28)):
            points[knee] = Point(x=0.5, y=0.6, visibility=visibility)
            points[hip] = Point(x=0.5 + 0.2 * sin(radians(angle)), y=0.6 + 0.2 * cos(radians(angle)), visibility=visibility)
            points[ankle] = Point(x=0.5, y=0.8, visibility=visibility)
        result.append(PoseFrame(t=i * 300, points=points))
    return result


def test_rule_routing_and_incomplete_reps() -> None:
    good = frames([175, 165, 130, 95, 120, 165, 175])
    assert classify("squat", good).label == "correct"
    assert angle(Point(x=0.5, y=0), Point(x=0, y=0), Point(x=0.5, y=1), aspect=2) == pytest.approx(45)
    assert classify("squat", frames([175, 165, 145, 135, 145, 165, 175])).label == "incorrect"
    assert classify("squat", frames([175, 165, 130, 95, 120, 165, 175], 0.5)).label == "inconclusive"
    assert classify("squat", good[:4]).label == "inconclusive"
    # Typical lite-model visibility and a moderate rehab depth both count.
    assert classify("squat", frames([175, 165, 145, 125, 120, 140, 165, 175], 0.7)).label == "correct"
    good[-1].t = good[-2].t
    assert classify("squat", good).label == "inconclusive"
    with pytest.raises(ValidationError):
        Point(x=float("nan"), y=0)


def test_protected_routes_and_model_manifest() -> None:
    client = TestClient(app)
    assert client.get("/physio/overview").status_code == 401
    assert client.get("/physio/history", headers={"Authorization": "Basic token"}).status_code == 401
    assert client.get("/physio/model").json()["training_enabled"] is False


def test_role_denial() -> None:
    ctx = Care({"id": str(uuid4())}, "Bearer test")
    async def call(*args: object, **kwargs: object) -> object:
        return [{"role": "patient"}]
    ctx.call = call
    with pytest.raises(HTTPException) as error:
        asyncio.run(ctx.profile("therapist"))
    assert error.value.status_code == 403


def test_retry_returns_existing_rep_even_after_session_finishes() -> None:
    user_id, session_id, client_id = str(uuid4()), str(uuid4()), str(uuid4())
    ctx = Care({"id": user_id}, "Bearer test")
    async def call(method: str, path: str, *args: object, **kwargs: object) -> object:
        if "care_profiles?" in path:
            return [{"role": "patient"}]
        if "exercise_sessions?" in path:
            return [{"ended_at": datetime.now(timezone.utc).isoformat()}]
        if "exercise_reps?" in path:
            return [{"id": "saved-rep", "label": "correct"}]
        pytest.fail("A retry must not write again.")
    ctx.call = call
    app.dependency_overrides[get_care] = lambda: ctx
    try:
        response = TestClient(app).post(f"/physio/sessions/{session_id}/reps", json={
            "client_rep_id": client_id, "frames": [f.model_dump() for f in frames([175, 165, 130, 95, 120, 165, 175])],
        })
        assert response.status_code == 200
        assert response.json()["id"] == "saved-rep"
    finally:
        app.dependency_overrides.clear()


def test_secret_key_stays_out_of_authorization(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = []
    async def request(self: httpx.AsyncClient, method: str, url: str, **kwargs: object) -> httpx.Response:
        captured.append(kwargs["headers"])
        return httpx.Response(200, json={"ok": True})
    monkeypatch.setattr(httpx.AsyncClient, "request", request)
    ctx = Care({"id": str(uuid4())}, "Bearer user-token")
    asyncio.run(ctx.call("POST", "/rest/v1/rpc/record_care_rep", {}, service=True))
    assert "apikey" in captured[0]
    assert "Authorization" not in captured[0]


def test_review_requires_error_and_nonempty_feedback() -> None:
    ctx = Care({"id": str(uuid4())}, "Bearer test")
    async def call(*args: object, **kwargs: object) -> object:
        return [{"role": "therapist"}]
    ctx.call = call
    app.dependency_overrides[get_care] = lambda: ctx
    try:
        client = TestClient(app)
        url = f"/physio/reps/{uuid4()}/review"
        assert client.post(url, json={"label": "incorrect", "feedback": "Try slowly"}).status_code == 422
        assert client.post(url, json={"label": "correct", "feedback": "   "}).status_code == 422
    finally:
        app.dependency_overrides.clear()
