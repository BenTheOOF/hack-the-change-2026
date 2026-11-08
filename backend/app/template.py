"""Template models for therapist-defined exercises. Pure Python: the API never imports numpy.

Mirrors frontend/src/features/physio/template.ts. The fitter lives in ml/fit_template.py and
uses the segmenter and evaluator here, so the worker, the API, and the browser agree.
"""

from math import floor
from statistics import mean
from typing import Literal

from pydantic import BaseModel, Field

from app.physio import MAX_GAP_MS, VISIBLE, Evaluation, PoseFrame, angle, tracking_confidence

TEMPLATE_VERSION = "template-1.0.0"
POINTS = 32
LEAD_IN_MS = 3000

# Candidate joint angles, as left/right pairs at indices 2k and 2k+1.
ANGLES: list[tuple[int, int, int]] = [
    (11, 13, 15), (12, 14, 16),  # elbows
    (23, 11, 13), (24, 12, 14),  # shoulders
    (11, 23, 25), (12, 24, 26),  # hips
    (23, 25, 27), (24, 26, 28),  # knees
]


class Gauge(BaseModel):
    from_: float = Field(alias="from")
    to: float
    model_config = {"populate_by_name": True}


class Spec(BaseModel):
    joints: tuple[tuple[int, int, int], tuple[int, int, int]]
    combine: Literal["visible", "mean", "left", "right"]
    direction: Literal[1, -1]
    rest: float = Field(ge=0, le=180)
    move: float = Field(ge=0, le=180)
    bandStart: float = Field(ge=0, le=180)
    bandEnd: float = Field(ge=0, le=180)
    gauge: Gauge


class TemplateModel(BaseModel):
    kind: Literal["template"]
    version: str = Field(max_length=40)
    spec: Spec
    active: list[int] = Field(min_length=1, max_length=4)
    template: list[list[float]]
    tolerance: float = Field(gt=0, le=90)
    minTempoMs: float = Field(ge=0, le=15000)
    demoReps: int = Field(ge=1)


def measure_spec(spec: Spec, frame: PoseFrame) -> tuple[float, float]:
    """Return (angle, quality) of the spec's primary angle in one frame."""
    pts = frame.points
    values = [angle(pts[a], pts[b], pts[c], frame.aspect_ratio) for a, b, c in spec.joints]
    quality = [min(pts[i].visibility for i in joint) for joint in spec.joints]
    if spec.combine == "mean":
        return (values[0] + values[1]) / 2, min(quality)
    if spec.combine == "left":
        side = 0
    elif spec.combine == "right":
        side = 1
    else:
        side = 0 if quality[0] >= quality[1] else 1
    return values[side], quality[side]


def is_resting(spec: Spec, value: float) -> bool:
    return (value - spec.rest) * spec.direction <= 0


def is_moving(spec: Spec, value: float) -> bool:
    return (value - spec.move) * spec.direction > 0


def trim_spec_lead_in(spec: Spec, frames: list[PoseFrame]) -> list[PoseFrame]:
    for i, frame in enumerate(frames):
        value, quality = measure_spec(spec, frame)
        if quality >= VISIBLE and is_moving(spec, value):
            return frames[i - 2:] if i > 2 else frames
    return frames


class Segmenter:
    """Port of RepSegmenter in engine.ts, driven by a spec."""

    def __init__(self, spec: Spec) -> None:
        self.spec = spec
        self.frames: list[PoseFrame] = []
        self.ready: list[PoseFrame] = []
        self.resting = 0
        self.move_start = 0.0

    def push(self, frame: PoseFrame) -> list[PoseFrame] | None:
        value, quality = measure_spec(self.spec, frame)
        resting, moving = is_resting(self.spec, value), is_moving(self.spec, value)
        if not self.frames:
            if quality >= VISIBLE and resting:
                self.ready = [f for f in self.ready if frame.t - f.t <= LEAD_IN_MS][-29:] + [frame]
            elif quality >= VISIBLE and moving and len(self.ready) >= 2:
                self.frames, self.ready, self.move_start = [*self.ready, frame], [], frame.t
            elif quality < VISIBLE:
                self.ready = []
            return None
        self.frames.append(frame)
        self.resting = self.resting + 1 if resting and quality >= VISIBLE else 0
        if len(self.frames) > 180 or frame.t - self.move_start > 15000:
            self.frames, self.ready, self.resting = [], [], 0
            return None
        if self.resting >= 2:
            start = self.frames[0].t
            done = [f.model_copy(update={"t": f.t - start}) for f in self.frames]
            self.frames, self.resting, self.ready = [], 0, [frame]
            return done if len(done) >= 6 else None
        return None


def angle_of(frame: PoseFrame, k: int) -> float:
    a, b, c = ANGLES[k]
    return angle(frame.points[a], frame.points[b], frame.points[c], frame.aspect_ratio)


def visibility_of(frame: PoseFrame, k: int) -> float:
    return min(frame.points[i].visibility for i in ANGLES[k])


def resample(ts: list[float], ys: list[float], n: int = POINTS) -> list[float]:
    """Linear resampling over normalized time, the same as template.ts."""
    t0, span = ts[0], (ts[-1] - ts[0]) or 1
    xs = [(t - t0) / span for t in ts]
    out, j = [], 0
    for i in range(n):
        x = i / (n - 1)
        while j < len(xs) - 2 and xs[j + 1] < x:
            j += 1
        w = 0 if xs[j + 1] == xs[j] else (x - xs[j]) / (xs[j + 1] - xs[j])
        out.append(ys[j] + (ys[j + 1] - ys[j]) * max(0.0, min(1.0, w)))
    return out


def percentile(values: list[float], p: float) -> float:
    s = sorted(values)
    i = p * (len(s) - 1)
    lo = floor(i)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def template_distance(model: TemplateModel, frames: list[PoseFrame]) -> float | None:
    ts = [f.t for f in frames]
    parts = []
    for row, k in enumerate(model.active):
        if mean(visibility_of(f, k) for f in frames) < VISIBLE:
            continue
        ys = [angle_of(f, k) for f in frames]
        dev = resample(ts, [y - ys[0] for y in ys])
        parts.append(mean(abs(d - model.template[row][i]) for i, d in enumerate(dev)))
    return mean(parts) if parts else None


def classify_template(model: TemplateModel, frames: list[PoseFrame], threshold: float = 0.8) -> Evaluation:
    spec = model.spec

    def result(label: str, error: str | None, confidence: float, feedback: str) -> Evaluation:
        return Evaluation(label=label, error_type=error, confidence=round(confidence, 3), feedback=feedback,
                          model_version=model.version)

    frames = trim_spec_lead_in(spec, frames)
    if len(frames) < 6 or any(b.t <= a.t for a, b in zip(frames, frames[1:])):
        return result("inconclusive", "tracking", 0.0, "We need a complete, clearly tracked repetition.")
    duration = frames[-1].t - frames[0].t
    values = [measure_spec(spec, f) for f in frames]
    quality = tracking_confidence(mean(v[1] for v in values))
    if duration < 600 or duration > 15000 or min(v[1] for v in values) < 0.2 or any(
            b.t - a.t > MAX_GAP_MS for a, b in zip(frames, frames[1:])):
        quality = min(quality, 0.5)
    if quality < threshold:
        return result("inconclusive", "tracking", quality, "Keep your whole body visible. Your therapist can review this rep.")
    angles = [v[0] for v in values]
    if not (is_resting(spec, angles[0]) and is_resting(spec, angles[-1]) and any(is_moving(spec, a) for a in angles)):
        return result("inconclusive", "incomplete", min(quality, 0.6), "Return to the starting position to finish a full rep.")
    peak = max(angles) if spec.direction > 0 else min(angles)
    if not min(spec.bandStart, spec.bandEnd) <= peak <= max(spec.bandStart, spec.bandEnd):
        return result("incorrect", "range_of_motion", quality, "Move through the range shown in your therapist's demo.")
    distance = template_distance(model, frames)
    if distance is not None and distance > model.tolerance:
        return result("incorrect", "movement_pattern", quality, "Follow the movement in your therapist's demo more closely.")
    if duration < model.minTempoMs:
        return result("incorrect", "tempo", quality, "Slow down and move smoothly through the repetition.")
    return result("correct", None, quality, "Good control. That repetition counts.")
