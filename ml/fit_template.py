"""Fit a template model for a therapist-defined exercise from demo pose keypoints.

Offline only: run by ml/worker.py, never in the API request path. Mirrors fitTemplate in
frontend/src/features/physio/template.ts (used by the browser demo). ml/fixtures/demo_curl.json
and its expected output keep the two in step.

This is a template fit, not a neural network: one demo video is too little data to train one.
numpy runs on the CPU here because nothing in this fit benefits from a GPU.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Literal

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.physio import VISIBLE, PoseFrame  # noqa: E402
from app.template import (  # noqa: E402
    ANGLES, POINTS, TEMPLATE_VERSION, Segmenter, Spec, TemplateModel, angle_of, classify_template,
    clearer_side, measure_spec, percentile, resample, trim_spec_lead_in, visibility_of,
)


class FitError(ValueError):
    """The demo cannot produce a usable model. The message is shown to the therapist."""


def fit_template(frames: list[PoseFrame], view: Literal["front", "side"]) -> TemplateModel:
    if len(frames) < 20:
        raise FitError("The demo is too short. Record at least two full repetitions.")
    raw = np.array([[angle_of(f, k) for f in frames] for k in range(len(ANGLES))])
    series = raw.copy()
    # 3-frame median, endpoints unchanged.
    series[:, 1:-1] = np.median(np.stack([raw[:, :-2], raw[:, 1:-1], raw[:, 2:]]), axis=0)
    vis = np.array([[visibility_of(f, k) for f in frames] for k in range(len(ANGLES))])
    def range_of(ys: np.ndarray, vs: np.ndarray) -> float:
        good = ys[vs >= VISIBLE].tolist()
        return 0.0 if len(good) < 0.6 * len(frames) else percentile(good, 0.95) - percentile(good, 0.05)

    ranges = [range_of(series[k], vis[k]) for k in range(len(ANGLES))]
    # Side-on, MediaPipe still guesses the hidden far limb, often with a noisy, exaggerated range.
    # Score each left/right pair by following the clearer side frame by frame.
    pair_ranges, pair_visibility = [], []
    for q in range(4):
        pick = np.where(vis[2 * q] >= vis[2 * q + 1], 2 * q, 2 * q + 1)
        cols = np.arange(len(frames))
        pair_ranges.append(range_of(series[pick, cols], vis[pick, cols]))
        pair_visibility.append(float(np.maximum(vis[2 * q], vis[2 * q + 1]).mean()))
    side = view == "side"

    def score(q: int) -> float:
        return pair_ranges[q] if side else max(ranges[2 * q], ranges[2 * q + 1])

    pair = 0
    for q in range(1, 4):
        if score(q) > score(pair):
            pair = q
    rl, rr = ranges[2 * pair], ranges[2 * pair + 1]
    if score(pair) < 25:
        raise FitError("Not enough movement was found. Keep the whole movement in view.")
    if side:
        combine = "visible"
    elif min(rl, rr) >= 0.6 * max(rl, rr):
        combine = "mean"
    else:
        combine = "left" if rl >= rr else "right"

    def spec_with(**values: float) -> Spec:
        base = {"joints": (ANGLES[2 * pair], ANGLES[2 * pair + 1]), "combine": combine, "direction": 1,
                "rest": 0, "move": 0, "bandStart": 0, "bandEnd": 0, "gauge": {"from": 0, "to": 180}}
        return Spec.model_validate(base | values)

    base = spec_with()
    primary = [measure_spec(base, f) for f in frames]
    good_primary = [a for a, q in primary if q >= VISIBLE]
    # Rest is the end of the range the demo starts and ends at. Use both ends of the clip, so a
    # trim that starts mid-rep still finds it, then take the median of frames dwelling near it.
    low, high = percentile(good_primary, 0.05), percentile(good_primary, 0.95)
    edges = percentile(good_primary[:10] + good_primary[-10:], 0.5)
    rest_end = low if abs(edges - low) <= abs(edges - high) else high
    far = high if rest_end == low else low
    rest = percentile([a for a in good_primary if abs(a - rest_end) <= 0.15 * (high - low)], 0.5)
    direction = 1 if far >= rest else -1
    excursion = abs(far - rest)
    if excursion < 25:
        raise FitError("Start and end the demo in the resting position, with clear movement between.")

    def clamp(a: float) -> float:
        return max(0.0, min(180.0, a))

    seg_spec = spec_with(direction=direction, rest=rest + direction * 0.2 * excursion,
                         move=rest + direction * 0.35 * excursion)
    segmenter = Segmenter(seg_spec)
    reps = [trim_spec_lead_in(seg_spec, r) for f in frames if (r := segmenter.push(f)) is not None]
    if len(reps) < 2:
        plural = "" if len(reps) == 1 else "s"
        raise FitError(f"Found {len(reps)} repetition{plural}. Record at least two (three or more is better), "
                       "returning to rest between them.")
    peaks = [max(direction * (measure_spec(seg_spec, f)[0] - rest) for f in r) for r in reps]
    mean_peak = float(np.mean(peaks))
    band_start = rest + direction * max(0.75 * mean_peak, 0.4 * excursion)
    band_end = clamp(rest + direction * 1.35 * mean_peak)
    spec = spec_with(direction=direction, rest=seg_spec.rest, move=seg_spec.move, bandStart=band_start,
                     bandEnd=band_end, gauge={"from": clamp(rest - direction * 0.15 * excursion),
                                              "to": clamp(band_end + direction * 0.15 * excursion)})

    # Side-on, active angles are pairs (stored as the left index), measured on each rep's clearer side.
    if side:
        candidates = [(pair_ranges[q], 2 * q) for q in range(4) if pair_ranges[q] >= 15 and pair_visibility[q] >= 0.6]
    else:
        candidates = [(ranges[k], k) for k in range(len(ANGLES)) if ranges[k] >= 15 and vis[k].mean() >= 0.6]
    active = sorted(k for _, k in sorted(candidates, key=lambda c: (-c[0], c[1]))[:4])
    if not active:
        active = [2 * pair if side or rl >= rr else 2 * pair + 1]
    curves = []
    for r in reps:
        ts = [f.t for f in r]
        rows = []
        for active_k in active:
            k = clearer_side(r, active_k) if side else active_k
            ys = [angle_of(f, k) for f in r]
            rows.append(resample(ts, [y - ys[0] for y in ys]))
        curves.append(np.array(rows))
    template = np.mean(np.stack(curves), axis=0)
    spread = [float(np.mean(np.abs(c - template))) for c in curves]
    durations = [r[-1].t - r[0].t for r in reps]
    model = TemplateModel(
        kind="template", version=TEMPLATE_VERSION, spec=spec, active=active,
        template=[[round(float(d), 1) for d in row] for row in template],
        tolerance=max(15.0, 2 * float(np.mean(spread)) + 6),
        minTempoMs=max(600.0, 0.5 * float(np.mean(durations))), demoReps=len(reps), sideAgnostic=side,
    )
    assert template.shape == (len(active), POINTS)
    passed = sum(classify_template(model, r, 0.6).label == "correct" for r in reps)
    if passed * 2 <= len(reps):
        raise FitError("The demo repetitions were too different from each other. Record slower, consistent repetitions.")
    return model
