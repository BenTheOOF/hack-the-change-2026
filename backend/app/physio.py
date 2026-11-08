"""Deterministic checks for pose sequences. No model training or video processing."""

from math import acos, degrees, hypot
from statistics import mean
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Exercise = Literal["squat", "shoulder_abduction"]
MODEL_VERSION = "rules-1.1.0"
# Rule thresholds. Keep in sync with RULES in frontend/src/features/physio/engine.ts.
SQUAT_REST, SQUAT_MOVE, SQUAT_DEPTH = 155, 145, (50, 130)
SHOULDER_REST, SHOULDER_MOVE, SHOULDER_PEAK, SHOULDER_ASYMMETRY = 35, 40, (70, 130), 35
MIN_TEMPO_MS, MAX_GAP_MS = 1000, 700


def tracking_confidence(visibility: float) -> float:
    """Map mean joint visibility to confidence: 0.7+ is trusted, 0.62 meets 0.8, 0.5 stays uncertain."""
    return max(0.0, min(1.0, (visibility - 0.3) / 0.4))


class Point(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    x: float = Field(ge=-2, le=3)
    y: float = Field(ge=-2, le=3)
    z: float = Field(default=0, ge=-10, le=10)
    visibility: float = Field(default=0, ge=0, le=1)


class PoseFrame(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    t: float = Field(ge=0, le=20000)
    aspect_ratio: float = Field(default=1, ge=0.25, le=4)
    points: list[Point] = Field(min_length=33, max_length=33)


class Evaluation(BaseModel):
    label: Literal["correct", "incorrect", "inconclusive"]
    error_type: str | None
    confidence: float
    feedback: str
    model_version: str = MODEL_VERSION


def angle(a: Point, b: Point, c: Point, aspect: float = 1) -> float:
    u, v = ((a.x - b.x) * aspect, a.y - b.y), ((c.x - b.x) * aspect, c.y - b.y)
    length = hypot(*u) * hypot(*v)
    if length < 1e-8:
        return 0.0
    return degrees(acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / length))))


def measurements(exercise: Exercise, points: list[Point], aspect: float = 1) -> tuple[float, float, float]:
    joints = ((23, 25, 27), (24, 26, 28)) if exercise == "squat" else ((23, 11, 13), (24, 12, 14))
    values = [angle(*(points[i] for i in joint), aspect=aspect) for joint in joints]
    # A side view can occlude one leg. Use the more visible side for squat.
    quality = [min(points[i].visibility for i in joint) for joint in joints]
    if exercise == "squat":
        side = 0 if quality[0] >= quality[1] else 1
        return values[side], quality[side], 0.0
    return mean(values), min(quality), abs(values[0] - values[1])


def classify(exercise: Exercise, frames: list[PoseFrame], threshold: float = 0.8) -> Evaluation:
    def result(label: str, error: str | None, confidence: float, feedback: str) -> Evaluation:
        return Evaluation(label=label, error_type=error, confidence=round(confidence, 3), feedback=feedback)

    if len(frames) < 6 or any(b.t <= a.t for a, b in zip(frames, frames[1:])):
        return result("inconclusive", "tracking", 0.0, "We need a complete, clearly tracked repetition.")
    duration = frames[-1].t - frames[0].t
    values = [measurements(exercise, f.points, f.aspect_ratio) for f in frames]
    quality = tracking_confidence(mean(v[1] for v in values))
    if duration < 600 or duration > 15000 or min(v[1] for v in values) < 0.2 or any(b.t - a.t > MAX_GAP_MS for a, b in zip(frames, frames[1:])):
        quality = min(quality, 0.5)
    if quality < threshold:
        return result("inconclusive", "tracking", quality, "Keep your whole body visible. Your therapist can review this rep.")
    movement = [v[0] for v in values]
    if exercise == "squat":
        complete = movement[0] >= SQUAT_REST and movement[-1] >= SQUAT_REST and min(movement) < SQUAT_MOVE
        excursion = min(movement)
        error = None if SQUAT_DEPTH[0] <= excursion <= SQUAT_DEPTH[1] else "range_of_motion"
        feedback = "Try the comfortable squat depth prescribed by your therapist."
    else:
        complete = movement[0] <= SHOULDER_REST and movement[-1] <= SHOULDER_REST and max(movement) > SHOULDER_MOVE
        excursion = max(movement)
        error = None if SHOULDER_PEAK[0] <= excursion <= SHOULDER_PEAK[1] else "range_of_motion"
        feedback = "Raise your arms to the height prescribed by your therapist, then lower slowly."
        if max(v[2] for v in values) > SHOULDER_ASYMMETRY:
            error, feedback = "uneven_movement", "Move both arms together within your prescribed range."
    if not complete:
        return result("inconclusive", "incomplete", min(quality, 0.6), "Return to the starting position to finish a full rep.")
    if duration < MIN_TEMPO_MS:
        error, feedback = "tempo", "Slow down and move smoothly through the repetition."
    if error:
        return result("incorrect", error, quality, feedback)
    return result("correct", None, quality, "Good control. That repetition counts.")
