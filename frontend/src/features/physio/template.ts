// Template model for therapist-defined exercises, fitted from a demo video's
// pose keypoints. The evaluator mirrors backend/app/template.py and the fitter
// mirrors ml/fit_template.py; ml/fixtures/demo_curl.json keeps them in step.
import {
  jointAngle,
  measureSpec,
  isMovingAngle,
  isResting,
  RepSegmenter,
  RULES,
  trackingConfidence,
  trimLeadIn,
  type Evaluation,
  type JointTriple,
  type MovementSpec,
  type PoseFrame,
} from "./engine.ts";

export const TEMPLATE_VERSION = "template-1.0.0";
const POINTS = 32;

// Candidate joint angles, as left/right pairs at indices 2k and 2k+1.
export const ANGLES: readonly JointTriple[] = [
  [11, 13, 15], // left elbow
  [12, 14, 16], // right elbow
  [23, 11, 13], // left shoulder
  [24, 12, 14], // right shoulder
  [11, 23, 25], // left hip
  [12, 24, 26], // right hip
  [23, 25, 27], // left knee
  [24, 26, 28], // right knee
];

export type TemplateModel = {
  kind: "template";
  version: string;
  spec: MovementSpec;
  active: number[]; // indices into ANGLES
  template: number[][]; // [active][POINTS], degrees from the rep's first frame
  tolerance: number; // mean absolute degrees allowed from the template
  minTempoMs: number;
  demoReps: number;
};

const angleOf = (frame: PoseFrame, k: number) => {
  const [a, b, c] = ANGLES[k];
  const p = frame.points;
  return jointAngle(p[a], p[b], p[c], frame.aspect_ratio ?? 1);
};
const visibilityOf = (frame: PoseFrame, k: number) =>
  Math.min(...ANGLES[k].map((i) => frame.points[i].visibility));
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// Linear-interpolated percentile, the same as numpy's default method.
export function percentile(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b);
  const i = p * (s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Resample one series over normalized time to POINTS samples.
export function resample(ts: number[], ys: number[], n = POINTS) {
  const t0 = ts[0];
  const span = ts.at(-1)! - t0 || 1;
  const xs = ts.map((t) => (t - t0) / span);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    while (j < xs.length - 2 && xs[j + 1] < x) j++;
    const w = xs[j + 1] === xs[j] ? 0 : (x - xs[j]) / (xs[j + 1] - xs[j]);
    out.push(ys[j] + (ys[j + 1] - ys[j]) * Math.max(0, Math.min(1, w)));
  }
  return out;
}

// Mean absolute difference between a rep and the template, over the active
// angles that are visible in this rep. null when none are visible.
export function templateDistance(model: TemplateModel, frames: PoseFrame[]) {
  const ts = frames.map((f) => f.t);
  const parts: number[] = [];
  model.active.forEach((k, row) => {
    if (mean(frames.map((f) => visibilityOf(f, k))) < RULES.visible) return;
    const ys = frames.map((f) => angleOf(f, k));
    const dev = resample(
      ts,
      ys.map((y) => y - ys[0]),
    );
    parts.push(mean(dev.map((d, i) => Math.abs(d - model.template[row][i]))));
  });
  return parts.length ? mean(parts) : null;
}

export function classifyTemplate(
  model: TemplateModel,
  allFrames: PoseFrame[],
  threshold = 0.8,
): Evaluation {
  const spec = model.spec;
  const frames = trimLeadIn(spec, allFrames);
  const result = (
    label: Evaluation["label"],
    error_type: string | null,
    confidence: number,
    feedback: string,
  ): Evaluation => ({
    label,
    error_type,
    confidence: Math.round(confidence * 1000) / 1000,
    feedback,
    model_version: model.version,
  });
  if (frames.length < 6 || frames.some((f, i) => i > 0 && f.t <= frames[i - 1].t))
    return result("inconclusive", "tracking", 0, "We need a complete, clearly tracked repetition.");
  const duration = frames.at(-1)!.t - frames[0].t;
  const values = frames.map((f) => measureSpec(spec, f.points, f.aspect_ratio));
  let quality = trackingConfidence(mean(values.map((v) => v.quality)));
  if (
    duration < 600 ||
    duration > 15000 ||
    Math.min(...values.map((v) => v.quality)) < 0.2 ||
    frames.some((f, i) => i > 0 && f.t - frames[i - 1].t > RULES.maxGapMs)
  )
    quality = Math.min(quality, 0.5);
  if (quality < threshold)
    return result("inconclusive", "tracking", quality, "Keep your whole body visible. Your therapist can review this rep.");
  const angles = values.map((v) => v.angle);
  const complete =
    isResting(spec, angles[0]) &&
    isResting(spec, angles.at(-1)!) &&
    angles.some((a) => isMovingAngle(spec, a));
  if (!complete)
    return result("inconclusive", "incomplete", Math.min(quality, 0.6), "Return to the starting position to finish a full rep.");
  const peak = spec.direction > 0 ? Math.max(...angles) : Math.min(...angles);
  const lo = Math.min(spec.bandStart, spec.bandEnd);
  const hi = Math.max(spec.bandStart, spec.bandEnd);
  if (peak < lo || peak > hi)
    return result("incorrect", "range_of_motion", quality, "Move through the range shown in your therapist's demo.");
  const distance = templateDistance(model, frames);
  if (distance !== null && distance > model.tolerance)
    return result("incorrect", "movement_pattern", quality, "Follow the movement in your therapist's demo more closely.");
  if (duration < model.minTempoMs)
    return result("incorrect", "tempo", quality, "Slow down and move smoothly through the repetition.");
  return result("correct", null, quality, "Good control. That repetition counts.");
}

export class FitError extends Error {}

// Fit a template from demo frames. Mirrors ml/fit_template.py.
export function fitTemplate(
  frames: PoseFrame[],
  view: "front" | "side",
): TemplateModel {
  if (frames.length < 20) throw new FitError("The demo is too short. Record at least two full repetitions.");
  // Per-angle series, smoothed with a 3-frame median.
  const raw = ANGLES.map((_, k) => frames.map((f) => angleOf(f, k)));
  const series = raw.map((ys) =>
    ys.map((y, i) =>
      i === 0 || i === ys.length - 1
        ? y
        : [ys[i - 1], y, ys[i + 1]].sort((a, b) => a - b)[1],
    ),
  );
  const vis = ANGLES.map((_, k) => frames.map((f) => visibilityOf(f, k)));
  const ranges = series.map((ys, k) => {
    const good = ys.filter((_, i) => vis[k][i] >= RULES.visible);
    if (good.length < 0.6 * ys.length) return 0;
    return percentile(good, 0.95) - percentile(good, 0.05);
  });
  // Primary pair: the left/right pair with the largest single-side range.
  let pair = 0;
  for (let q = 1; q < 4; q++)
    if (Math.max(ranges[2 * q], ranges[2 * q + 1]) > Math.max(ranges[2 * pair], ranges[2 * pair + 1]))
      pair = q;
  const [rl, rr] = [ranges[2 * pair], ranges[2 * pair + 1]];
  if (Math.max(rl, rr) < 25)
    throw new FitError("Not enough movement was found. Keep the whole movement in view.");
  const combine: MovementSpec["combine"] =
    Math.min(rl, rr) >= 0.6 * Math.max(rl, rr)
      ? view === "front"
        ? "mean"
        : "visible"
      : rl >= rr
        ? "left"
        : "right";
  const base: MovementSpec = {
    joints: [ANGLES[2 * pair], ANGLES[2 * pair + 1]],
    combine,
    direction: 1,
    rest: 0,
    move: 0,
    bandStart: 0,
    bandEnd: 0,
    gauge: { from: 0, to: 180 },
  };
  const primary = frames.map((f) => measureSpec(base, f.points, f.aspect_ratio));
  const goodPrimary = primary.filter((v) => v.quality >= RULES.visible).map((v) => v.angle);
  const rest = percentile(goodPrimary.slice(0, 10), 0.5);
  const lowP = percentile(goodPrimary, 0.05);
  const highP = percentile(goodPrimary, 0.95);
  const far = Math.abs(highP - rest) >= Math.abs(lowP - rest) ? highP : lowP;
  const direction: 1 | -1 = far >= rest ? 1 : -1;
  const excursion = Math.abs(far - rest);
  if (excursion < 25)
    throw new FitError("Start and end the demo in the resting position, with clear movement between.");
  const clamp = (a: number) => Math.max(0, Math.min(180, a));
  const spec: MovementSpec = {
    ...base,
    direction,
    rest: rest + direction * 0.2 * excursion,
    move: rest + direction * 0.35 * excursion,
  };
  // Segment the demo with the same segmenter patients use.
  const segmenter = new RepSegmenter(spec);
  const reps = frames
    .map((f) => segmenter.push(f))
    .filter((r): r is PoseFrame[] => r !== null)
    .map((r) => trimLeadIn(spec, r));
  if (reps.length < 2)
    throw new FitError(`Found ${reps.length} repetition${reps.length === 1 ? "" : "s"}. Record at least two (three or more is better), returning to rest between them.`);
  const repPeaks = reps.map((r) =>
    Math.max(...r.map((f) => direction * (measureSpec(spec, f.points, f.aspect_ratio).angle - rest))),
  );
  const meanPeak = mean(repPeaks);
  spec.bandStart = rest + direction * Math.max(0.75 * meanPeak, 0.4 * excursion);
  spec.bandEnd = clamp(rest + direction * 1.35 * meanPeak);
  spec.gauge = {
    from: clamp(rest - direction * 0.15 * excursion),
    to: clamp(spec.bandEnd + direction * 0.15 * excursion),
  };
  // Active angles: clearly visible and moving at least 15 degrees, largest first.
  const active = ranges
    .map((r, k) => ({ r, k, v: mean(vis[k]) }))
    .filter((a) => a.r >= 15 && a.v >= 0.6)
    .sort((a, b) => b.r - a.r || a.k - b.k)
    .slice(0, 4)
    .map((a) => a.k)
    .sort((a, b) => a - b);
  if (!active.length) active.push(rl >= rr ? 2 * pair : 2 * pair + 1);
  const curves = reps.map((r) => {
    const ts = r.map((f) => f.t);
    return active.map((k) => {
      const ys = r.map((f) => angleOf(f, k));
      return resample(ts, ys.map((y) => y - ys[0]));
    });
  });
  const template = active.map((_, row) =>
    Array.from({ length: POINTS }, (_, i) => mean(curves.map((c) => c[row][i]))),
  );
  const spread = curves.map((c) =>
    mean(c.map((curve, row) => mean(curve.map((d, i) => Math.abs(d - template[row][i]))))),
  );
  const durations = reps.map((r) => r.at(-1)!.t - r[0].t);
  const model: TemplateModel = {
    kind: "template",
    version: TEMPLATE_VERSION,
    spec,
    active,
    template: template.map((row) => row.map((d) => Math.round(d * 10) / 10)),
    tolerance: Math.max(15, 2 * mean(spread) + 6),
    minTempoMs: Math.max(600, 0.5 * mean(durations)),
    demoReps: reps.length,
  };
  const passed = reps.filter((r) => classifyTemplate(model, r, 0.6).label === "correct").length;
  if (passed * 2 <= reps.length)
    throw new FitError("The demo repetitions were too different from each other. Record slower, consistent repetitions.");
  return model;
}
