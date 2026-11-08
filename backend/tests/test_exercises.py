import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.physio import Care, get_care

ML = Path(__file__).resolve().parents[2] / "ml"
DEMO = json.loads((ML / "fixtures" / "demo_curl.json").read_text())


def as_role(role: str, calls: list | None = None, rows: object = None) -> None:
    ctx = Care({"id": str(uuid4())}, "Bearer test")

    async def call(method: str, path: str, body: object = None, **kwargs: object) -> object:
        if "care_profiles?" in path:
            return [{"role": role}]
        if calls is not None:
            calls.append((method, path, body))
        return rows if rows is not None else [{"id": "new"}]
    ctx.call = call
    app.dependency_overrides[get_care] = lambda: ctx


def exercise(**overrides: object) -> dict:
    return {"name": "Elbow curl", "view": "front", "steps": ["Stand tall"], "demo_frames": DEMO["frames"]} | overrides


def test_exercise_routes_need_a_signed_in_therapist() -> None:
    client = TestClient(app)
    assert client.get("/physio/exercises").status_code == 401
    try:
        as_role("patient")
        assert client.post("/physio/exercises", json=exercise()).status_code == 403
        assert client.put(f"/physio/exercises/{uuid4()}/video", content=b"x",
                          headers={"Content-Type": "video/mp4"}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_exercise_input_is_validated_and_queued() -> None:
    client = TestClient(app)
    calls: list = []
    try:
        as_role("therapist", calls)
        assert client.post("/physio/exercises", json=exercise(name="   ")).status_code == 422
        assert client.post("/physio/exercises", json=exercise(demo_frames=DEMO["frames"][:10])).status_code == 422
        backwards = list(reversed(DEMO["frames"]))
        assert client.post("/physio/exercises", json=exercise(demo_frames=backwards)).status_code == 422
        assert client.post("/physio/exercises", json=exercise(view="top")).status_code == 422
        assert not calls
        assert client.post("/physio/exercises", json=exercise()).status_code == 201
        method, path, body = calls[0]
        assert method == "POST" and "custom_exercises" in path
        assert "status" not in body and "model" not in body  # the database defaults to queued, untrained
    finally:
        app.dependency_overrides.clear()


def test_demo_video_upload_checks_type(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    try:
        as_role("therapist", rows=[{"id": "ex"}])
        url = f"/physio/exercises/{uuid4()}/video"
        assert client.put(url, content=b"x", headers={"Content-Type": "image/png"}).status_code == 415
        assert client.put(url, content=b"", headers={"Content-Type": "video/mp4"}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_custom_prescription_needs_an_exercise_id() -> None:
    client = TestClient(app)
    try:
        as_role("therapist")
        body = {"patient_id": str(uuid4()), "exercise": "custom", "daily_target": 8,
                "starts_on": "2026-11-08", "ends_on": "2026-11-15"}
        assert client.post("/physio/prescriptions", json=body).status_code == 422
        assert client.post("/physio/prescriptions", json=body | {"custom_exercise_id": str(uuid4())}).status_code == 201
    finally:
        app.dependency_overrides.clear()


def test_worker_trains_a_claimed_exercise(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("numpy")
    sys.path.insert(0, str(ML))
    import worker

    finished = []

    def rpc(client: httpx.Client, name: str, body: dict) -> object:
        if name == "claim_custom_exercise":
            return [{"id": "ex", "name": "Elbow curl", "view": "front", "demo_frames": DEMO["frames"]}]
        finished.append(body)
        return None
    monkeypatch.setattr(worker, "rpc", rpc)
    assert worker.train_one(httpx.Client())
    assert finished[0]["p_model"]["kind"] == "template" and finished[0]["p_error"] is None
    assert finished[0]["p_model"]["spec"]["gauge"]["from"] is not None  # stored with the "from" alias

    def bad_rpc(client: httpx.Client, name: str, body: dict) -> object:
        if name == "claim_custom_exercise":
            return [{"id": "ex", "name": "Still", "view": "front", "demo_frames": DEMO["frames"][:15] * 2}]
        finished.append(body)
        return None
    monkeypatch.setattr(worker, "rpc", bad_rpc)
    worker.train_one(httpx.Client())
    assert finished[-1]["p_model"] is None and finished[-1]["p_error"]


def test_custom_reps_are_rechecked_with_the_stored_model() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from datetime import datetime, timezone

    from test_template import EXPECTED, rep

    saved = []
    ctx = Care({"id": str(uuid4())}, "Bearer test")

    async def call(method: str, path: str, body: object = None, **kwargs: object) -> object:
        if "care_profiles?" in path:
            return [{"role": "patient"}]
        if "exercise_sessions?" in path:
            return [{"ended_at": None, "started_at": datetime.now(timezone.utc).isoformat(),
                     "exercise_prescriptions": {"exercise": "custom", "custom_exercise_id": "ex",
                                                "confidence_threshold": 0.8}}]
        if "exercise_reps?" in path:
            return []
        if "custom_exercises?" in path:
            return [{"model": EXPECTED, "status": "ready"}]
        saved.append(body)
        return [{"id": "rep"}]
    ctx.call = call
    app.dependency_overrides[get_care] = lambda: ctx
    try:
        client = TestClient(app)
        frames = [f.model_dump() for f in rep(115)]  # too shallow for the demo's range
        response = client.post(f"/physio/sessions/{uuid4()}/reps", json={"client_rep_id": str(uuid4()), "frames": frames})
        assert response.status_code == 201
        evaluation = saved[0]["p_evaluation"]
        assert evaluation["error_type"] == "range_of_motion"
        assert evaluation["model_version"] == "template-1.0.0"
        assert saved[0]["p_exercise"] == "custom"
    finally:
        app.dependency_overrides.clear()


def test_demo_trim_must_cover_the_keypoints() -> None:
    client = TestClient(app)
    calls: list = []
    try:
        as_role("therapist", calls)
        span = DEMO["frames"][-1]["t"]
        assert client.post("/physio/exercises", json=exercise(demo_start_ms=5000, demo_end_ms=4000)).status_code == 422
        assert client.post("/physio/exercises", json=exercise(demo_start_ms=0, demo_end_ms=70000)).status_code == 422
        assert client.post("/physio/exercises", json=exercise(demo_start_ms=1000, demo_end_ms=1000 + span // 2)).status_code == 422
        assert not calls
        ok = client.post("/physio/exercises", json=exercise(demo_start_ms=3000, demo_end_ms=3000 + span))
        assert ok.status_code == 201
        assert calls[0][2]["demo_start_ms"] == 3000 and calls[0][2]["demo_end_ms"] == 3000 + span
    finally:
        app.dependency_overrides.clear()
