import test from "node:test";
import assert from "node:assert/strict";
import {
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
