import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RepSegmenter, type PoseFrame, type Point } from "./engine.ts";
import { classifyTemplate, FitError, fitTemplate, type TemplateModel } from "./template.ts";

const ml = new URL("../../../../ml/fixtures/", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("demo_curl.json", ml), "utf8"));
const expected: TemplateModel = JSON.parse(
  readFileSync(new URL("demo_curl.expected.json", ml), "utf8"),
);

// Same geometry as ml/fixtures/make_demo_curl.py.
function curlFrame(elbow: number, t: number, visibility = 0.9): PoseFrame {
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.12, z: 0, visibility }));
  const put = (i: number, x: number, y: number) => (points[i] = { x, y, z: 0, visibility });
  const fixed: Record<number, [number, number]> = {
    11: [0.42, 0.3], 12: [0.58, 0.3], 13: [0.42, 0.45], 14: [0.58, 0.45],
    23: [0.45, 0.55], 24: [0.55, 0.55], 25: [0.45, 0.75], 26: [0.55, 0.75],
    27: [0.45, 0.95], 28: [0.55, 0.95],
  };
  for (const [i, [x, y]] of Object.entries(fixed)) put(Number(i), x, y);
  const a = (elbow * Math.PI) / 180;
  put(15, 0.42 + 0.15 * Math.sin(a), 0.45 - 0.15 * Math.cos(a));
  put(16, 0.58 - 0.15 * Math.sin(a), 0.45 - 0.15 * Math.cos(a));
  return { t, points };
}

function rep(
  peak: number,
  { ms = 2400, lead = 3, shape, oneArm = false, visibility = 0.9 }: {
    ms?: number; lead?: number; shape?: (x: number) => number; oneArm?: boolean; visibility?: number;
  } = {},
) {
  const rest = 165;
  const steps = ms / 100;
  const angles = Array(lead).fill(rest);
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    angles.push(rest - (rest - peak) * (shape ? shape(x) : 0.5 * (1 - Math.cos(2 * Math.PI * x))));
  }
  angles.push(...Array(5).fill(rest));
  const segmenter = new RepSegmenter(expected.spec);
  for (const [i, a] of angles.entries()) {
    const frame = curlFrame(a, i * 100, visibility);
    if (oneArm) frame.points[16] = curlFrame(rest, 0, visibility).points[16];
    const done = segmenter.push(frame);
    if (done) return done;
  }
  throw new Error("no rep segmented");
}

test("the browser fitter matches the Python fitter on the shared fixture", () => {
  const model = fitTemplate(fixture.frames, fixture.view);
  assert.equal(model.spec.combine, expected.spec.combine);
  assert.equal(model.spec.direction, expected.spec.direction);
  for (const key of ["rest", "move", "bandStart", "bandEnd"] as const)
    assert.ok(Math.abs(model.spec[key] - expected.spec[key]) < 0.5, key);
  assert.deepEqual(model.active, expected.active);
  assert.equal(model.demoReps, 4);
  assert.ok(Math.abs(model.tolerance - expected.tolerance) < 0.5);
  assert.ok(Math.abs(model.minTempoMs - expected.minTempoMs) < 1);
  model.template.forEach((row, r) =>
    row.forEach((d, i) => assert.ok(Math.abs(d - expected.template[r][i]) < 0.3)),
  );
  assert.throws(
    () => fitTemplate(Array.from({ length: 40 }, (_, i) => curlFrame(165, i * 100)), "front"),
    FitError,
  );
});

test("a fitted template routes reps like the backend", () => {
  const label = (frames: PoseFrame[]) => {
    const e = classifyTemplate(expected, frames, 0.8);
    return e.error_type ?? e.label;
  };
  assert.equal(label(rep(50)), "correct");
  assert.equal(label(rep(50, { lead: 25 })), "correct");
  assert.equal(label(rep(115)), "range_of_motion");
  assert.equal(label(rep(50, { oneArm: true })), "range_of_motion");
  assert.equal(
    label(rep(50, { ms: 3000, shape: (x) => (x > 0.05 && x < 0.95 ? 1 : 0) })),
    "movement_pattern",
  );
  assert.equal(label(rep(50, { ms: 800 })), "tempo");
  assert.equal(label(rep(50, { visibility: 0.55 })), "tracking");
});

const pushup = JSON.parse(readFileSync(new URL("demo_pushup.json", ml), "utf8"));
const pushupExpected: TemplateModel = JSON.parse(
  readFileSync(new URL("demo_pushup.expected.json", ml), "utf8"),
);
const cases = JSON.parse(readFileSync(new URL("pushup_cases.json", ml), "utf8"));
const segmentStream = (model: TemplateModel, stream: PoseFrame[]) => {
  const segmenter = new RepSegmenter(model.spec);
  for (const frame of stream) {
    const done = segmenter.push(frame);
    if (done) return done;
  }
  throw new Error("no rep segmented");
};

test("side-on push-ups ignore the hidden arm and work facing either way", () => {
  const label = (name: string) => {
    const e = classifyTemplate(pushupExpected, segmentStream(pushupExpected, cases.reps[name]), 0.8);
    return e.error_type ?? e.label;
  };
  assert.equal(label("full"), "correct");
  assert.equal(label("mirrored"), "correct");
  assert.equal(label("shallow"), "range_of_motion");
  assert.equal(label("fast"), "tempo");
});

test("the browser push-up fit matches Python, even when the trim starts mid-rep", () => {
  for (const frames of [pushup.frames, cases.demo_mid_rep]) {
    const model = fitTemplate(frames, "side");
    assert.equal(model.sideAgnostic, true);
    assert.equal(model.spec.combine, "visible");
    assert.deepEqual(model.active, pushupExpected.active);
    for (const key of ["rest", "move", "bandStart", "bandEnd"] as const)
      assert.ok(Math.abs(model.spec[key] - pushupExpected.spec[key]) < 1, key);
  }
});
