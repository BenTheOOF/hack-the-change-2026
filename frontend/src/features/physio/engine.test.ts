import test from "node:test";
import assert from "node:assert/strict";
import {
  alignLeadIn,
  trackingLoss,
  distanceCheck,
  movementProgress,
  autoStart,
  demoFrame,
  jointAngle,
  RepSegmenter,
  ruleClassifier,
} from "./engine.ts";

const sequence = (
  exercise: "squat" | "shoulder_abduction",
  angles: number[],
  visibility = 0.97,
) => angles.map((a, i) => demoFrame(exercise, a, i * 250, visibility));

test("a full squat counts once and an unfinished squat never counts", () => {
  const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 1 });
  assert.ok(
    Math.abs(jointAngle(point(0.5, 0), point(0, 0), point(0.5, 1), 2) - 45) <
      0.001,
  );
  const segmenter = new RepSegmenter("squat");
  const frames = sequence(
    "squat",
    [175, 175, 160, 140, 110, 90, 100, 140, 165, 175, 175],
  );
  const reps = frames.map((f) => segmenter.push(f)).filter((f) => f !== null);
  assert.equal(reps.length, 1);
  assert.equal(
    ruleClassifier.classify("squat", reps[0]!, 0.8).label,
    "correct",
  );
  segmenter.reset();
  assert.equal(
    frames
      .slice(0, 6)
      .map((f) => segmenter.push(f))
      .filter(Boolean).length,
    0,
  );
});

test("shallow and poorly tracked repetitions take different routes", () => {
  assert.equal(
    ruleClassifier.classify(
      "squat",
      sequence("squat", [175, 160, 145, 135, 145, 165, 175]),
      0.8,
    ).label,
    "incorrect",
  );
  assert.equal(
    ruleClassifier.classify(
      "squat",
      sequence("squat", [175, 160, 110, 90, 110, 165, 175], 0.5),
      0.8,
    ).label,
    "inconclusive",
  );
});

test("shoulder abduction completes only after the arms return", () => {
  const segmenter = new RepSegmenter("shoulder_abduction");
  const reps = sequence(
    "shoulder_abduction",
    [5, 10, 25, 50, 75, 90, 80, 50, 20, 5],
  )
    .map((f) => segmenter.push(f))
    .filter(Boolean);
  assert.equal(reps.length, 1);
  assert.equal(
    ruleClassifier.classify("shoulder_abduction", reps[0]!, 0.8).label,
    "correct",
  );
});

test("typical lite-model tracking and a moderate rehab squat count", () => {
  // Knees and ankles often report about 0.7 visibility while clearly in frame.
  const moderate = sequence("squat", [175, 165, 145, 125, 120, 140, 165, 175], 0.7);
  const result = ruleClassifier.classify("squat", moderate, 0.8);
  assert.equal(result.label, "correct");
  assert.ok(result.confidence >= 0.8);
  const raise = sequence("shoulder_abduction", [10, 25, 50, 72, 50, 25, 10], 0.7);
  assert.equal(
    ruleClassifier.classify("shoulder_abduction", raise, 0.8).label,
    "correct",
  );
});

test("tracking starts only after every check holds 2 s and the replay pause ends", () => {
  let state = autoStart(0, true, 1000, 0);
  assert.deepEqual(state, { readySince: 1000, start: false });
  assert.equal(autoStart(state.readySince, true, 2900, 0).start, false);
  assert.deepEqual(autoStart(0, false, 2400, 0), { readySince: 0, start: false });
  assert.equal(autoStart(state.readySince, true, 3000, 0).start, true);
  // After an incorrect rep the replay pause delays the restart.
  state = autoStart(state.readySince, true, 3000, 4500);
  assert.equal(state.start, false);
  assert.equal(autoStart(state.readySince, true, 4500, 4500).start, true);
});

test("a replay lead-in is kept but never changes the classification", () => {
  const rest = Array(20).fill(175);
  const rep = [175, 165, 140, 110, 95, 110, 140, 165, 175, 175];
  const segmenter = new RepSegmenter("squat");
  const out = sequence("squat", [...rest, ...rep])
    .map((f) => segmenter.push(f))
    .filter((f) => f !== null);
  assert.equal(out.length, 1);
  // 20 resting frames at 250 ms: up to 3 s (13 frames) of lead-in is kept.
  assert.ok(out[0]!.length >= rep.length + 10);
  assert.equal(out[0]![0].t, 0);
  const short = sequence("squat", rep);
  const long = out[0]!;
  const a = ruleClassifier.classify("squat", short, 0.8);
  const b = ruleClassifier.classify("squat", long, 0.8);
  assert.equal(b.label, a.label);
  assert.equal(b.error_type, a.error_type);
  // Too-fast reps stay too fast however long the lead-in is.
  const fast = [...Array(12).fill(175), 175, 150, 110, 150, 175, 175].map(
    (a, i) => demoFrame("squat", a, i * 120),
  );
  assert.equal(ruleClassifier.classify("squat", fast, 0.8).error_type, "tempo");
});

test("aligning to the video drops early lead-in but keeps the movement", () => {
  const frames = sequence("squat", [175, 175, 175, 175, 175, 140, 100, 140, 175, 175]);
  const aligned = alignLeadIn("squat", frames, 600);
  assert.equal(aligned[0].t, 0);
  assert.equal(aligned.length, frames.length - 3); // frames at 0, 250, 500 ms dropped
  // A late video start can never cut into the two resting frames before movement.
  assert.equal(alignLeadIn("squat", frames, 5000).length, frames.length - 3);
  assert.equal(alignLeadIn("squat", frames, -200), frames);
});

test("the movement gauge matches the classifier's counting range", () => {
  const zone = (e: "squat" | "shoulder_abduction", a: number) =>
    movementProgress(e, a).zone;
  assert.equal(zone("squat", 175), "rest");
  assert.equal(zone("squat", 145), "approach");
  assert.equal(zone("squat", 130), "target");
  assert.equal(zone("squat", 90), "target");
  assert.equal(zone("squat", 50), "target");
  assert.equal(zone("squat", 45), "over");
  assert.equal(zone("shoulder_abduction", 20), "rest");
  assert.equal(zone("shoulder_abduction", 55), "approach");
  assert.equal(zone("shoulder_abduction", 90), "target");
  assert.equal(zone("shoulder_abduction", 140), "over");
  const squat = movementProgress("squat", 130);
  assert.equal(squat.position, squat.bandStart);
  assert.ok(squat.bandStart < squat.bandEnd);
  assert.equal(movementProgress("squat", 180).position, 0);
  assert.equal(movementProgress("squat", 20).position, 1);
});

test("the distance check works facing the camera, side-on, and seated", () => {
  const front = demoFrame("squat", 175, 0).points;
  assert.equal(distanceCheck(front).ok, true);
  // Side-on: the far shoulder and hip are hidden, the near side is enough.
  const side = front.map((p, i) => ([11, 23].includes(i) ? { ...p, visibility: 0.1 } : p));
  assert.equal(distanceCheck(side).ok, true);
  // Mid-squat the body is shorter, but the torso is not.
  assert.equal(distanceCheck(demoFrame("squat", 100, 0).points).ok, true);
  const scale = (k: number) =>
    front.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * k, y: 0.5 + (p.y - 0.5) * k }));
  assert.equal(distanceCheck(scale(0.4)).hint, "Move a little closer");
  assert.equal(distanceCheck(scale(1.6)).hint, "Step back a little");
  const hidden = front.map((p) => ({ ...p, visibility: 0.2 }));
  assert.equal(distanceCheck(hidden).hint, "Step into view");
});

test("a brief tracking miss keeps the rep, a long one resets it", () => {
  let state = trackingLoss(0, true, 1000);
  assert.deepEqual(state, { lostSince: 0, reset: false });
  state = trackingLoss(state.lostSince, false, 1100);
  assert.deepEqual(state, { lostSince: 1100, reset: false });
  assert.equal(trackingLoss(state.lostSince, false, 1700).reset, false);
  assert.equal(trackingLoss(state.lostSince, false, 1701).reset, true);
  assert.deepEqual(trackingLoss(state.lostSince, true, 1500), { lostSince: 0, reset: false });
});
