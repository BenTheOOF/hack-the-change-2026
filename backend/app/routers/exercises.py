"""Therapist-defined exercises. The API stores the demo and queues it; ml/worker.py trains it.

No training happens here. Demo pose keypoints are extracted in the therapist's browser.
"""

from typing import Literal
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from app.config import settings
from app.routers.physio import Context
from app.template import DemoFrame

router = APIRouter(prefix="/physio", tags=["physio"])
# demo_frames is large and only the worker needs it, so lists leave it out.
FIELDS = ("id,therapist_id,name,description,steps,view,status,status_detail,model,model_version,demo_video_path,"
          "demo_start_ms,demo_end_ms,created_at,trained_at")
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}
MAX_VIDEO = 50 * 1024 * 1024


class ExerciseInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    steps: list[str] = Field(default_factory=list, max_length=10)
    view: Literal["front", "side"]
    demo_frames: list[DemoFrame] = Field(min_length=20, max_length=600)
    # The trimmed part of the uploaded video, in ms. Frames start at 0 at demo_start_ms.
    demo_start_ms: int = Field(default=0, ge=0, le=600_000)
    demo_end_ms: int | None = Field(default=None, gt=0, le=600_000)

    @model_validator(mode="after")
    def trim_fits(self) -> "ExerciseInput":
        if self.demo_end_ms is not None:
            span = self.demo_end_ms - self.demo_start_ms
            if span <= 0 or span > 60_100:
                raise ValueError("Choose a part of the video between 2 and 60 seconds long.")
            if self.demo_frames[-1].t > span + 100:
                raise ValueError("The demo keypoints run past the chosen part of the video.")
        return self

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name the exercise.")
        return value.strip()

    @field_validator("steps")
    @classmethod
    def short_steps(cls, steps: list[str]) -> list[str]:
        cleaned = [s.strip() for s in steps if s.strip()]
        if any(len(s) > 300 for s in cleaned):
            raise ValueError("Keep each step under 300 characters.")
        return cleaned

    @field_validator("demo_frames")
    @classmethod
    def increasing_time(cls, frames: list[DemoFrame]) -> list[DemoFrame]:
        if any(b.t <= a.t for a, b in zip(frames, frames[1:])):
            raise ValueError("Demo frames must be in time order.")
        return frames


@router.post("/exercises", status_code=201)
async def create_exercise(data: ExerciseInput, ctx: Context) -> object:
    await ctx.profile("therapist")
    rows = await ctx.call("POST", f"/rest/v1/custom_exercises?select={FIELDS}", {
        "therapist_id": ctx.user["id"], "name": data.name, "description": data.description,
        "steps": data.steps, "view": data.view, "demo_frames": [f.model_dump() for f in data.demo_frames],
        "demo_start_ms": data.demo_start_ms, "demo_end_ms": data.demo_end_ms,
    })
    return rows[0] if isinstance(rows, list) else rows


@router.get("/exercises")
async def list_exercises(ctx: Context) -> object:
    await ctx.profile()
    return await ctx.call("GET", f"/rest/v1/custom_exercises?select={FIELDS}&order=created_at.desc&limit=100")


@router.put("/exercises/{exercise_id}/video", status_code=201)
async def upload_demo_video(exercise_id: UUID, request: Request, ctx: Context) -> dict:
    await ctx.profile("therapist")
    rows = await ctx.call("GET", f"/rest/v1/custom_exercises?id=eq.{exercise_id}&therapist_id=eq.{ctx.user['id']}&select=id")
    if not rows:
        raise HTTPException(404, "Exercise not found.")
    mime = request.headers.get("content-type", "").split(";")[0]
    if mime not in VIDEO_TYPES:
        raise HTTPException(415, "Upload an MP4, WebM, or MOV video.")
    video = bytearray()
    async for chunk in request.stream():
        video.extend(chunk)
        if len(video) > MAX_VIDEO:
            raise HTTPException(413, "Demo videos must be at most 50 MiB.")
    if not video:
        raise HTTPException(422, "The video is empty.")
    path = f"{ctx.user['id']}/{exercise_id}/{uuid4()}.{VIDEO_TYPES[mime]}"
    headers = {"apikey": settings.supabase_secret_key, "Content-Type": mime}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{settings.supabase_url}/storage/v1/object/exercise-demos/{path}", headers=headers,
                              content=bytes(video))
    if r.is_error:
        raise HTTPException(502, "The demo video could not be uploaded. The exercise is still queued for training.")
    try:
        await ctx.call("POST", "/rest/v1/rpc/attach_exercise_video", {"p_id": str(exercise_id), "p_path": path})
    except HTTPException:
        async with httpx.AsyncClient(timeout=20) as client:
            await client.delete(f"{settings.supabase_url}/storage/v1/object/exercise-demos/{path}", headers=headers)
        raise
    return {"uploaded": True}


@router.get("/exercises/{exercise_id}/video")
async def demo_video_url(exercise_id: UUID, ctx: Context) -> dict:
    await ctx.profile()
    # RLS limits this to the owner and patients with the exercise prescribed.
    rows = await ctx.call("GET", f"/rest/v1/custom_exercises?id=eq.{exercise_id}&select=demo_video_path")
    if not rows or not rows[0]["demo_video_path"]:
        raise HTTPException(404, "No demo video is available.")
    signed = await ctx.call("POST", f"/storage/v1/object/sign/exercise-demos/{rows[0]['demo_video_path']}",
                            {"expiresIn": 600}, service=True)
    return {"url": f"{settings.supabase_url}/storage/v1{signed['signedURL']}"}
