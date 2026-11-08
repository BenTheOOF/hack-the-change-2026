export type BuiltinExercise = "squat" | "shoulder_abduction";
// "custom" plans point at a therapist-defined exercise with a fitted template model.
export type Exercise = BuiltinExercise | "custom";
export type Point = { x: number; y: number; z: number; visibility: number };
export type PoseFrame = { t: number; aspect_ratio?: number; points: Point[] };
export type Evaluation = {
  label: "correct" | "incorrect" | "inconclusive";
  error_type: string | null;
  confidence: number;
  feedback: string;
  model_version: string;
};
export interface RepClassifier {
  classify(
    exercise: BuiltinExercise,
    frames: PoseFrame[],
    threshold: number,
  ): Evaluation;
}
export const MODEL_VERSION = "rules-1.1.0";
// Rule thresholds. Keep in sync with backend/app/physio.py.
// MediaPipe treats visibility >= 0.5 as visible; the lite model often rates
// knees and ankles 0.6-0.85 even when they are clearly in frame.
export const RULES = {
  visible: 0.5,
  squat: { rest: 155, move: 145, depthMin: 50, depthMax: 130 },
  shoulder: { rest: 35, move: 40, peakMin: 70, peakMax: 130, asymmetry: 35 },
  minTempoMs: 1000,
  maxGapMs: 700,
  // Resting pose kept before a rep so its replay shows the whole movement.
  leadInMs: 3000,
} as const;

// A movement is described by one primary joint angle. direction is +1 when the
// angle grows during the movement (arm raise) and -1 when it shrinks (squat).
// rest/move are the segmentation edges; bandStart..bandEnd is the range that counts.
export type JointTriple = readonly [number, number, number];
export type MovementSpec = {
  joints: readonly [JointTriple, JointTriple];
  combine: "visible" | "mean" | "left" | "right";
  direction: 1 | -1;
  rest: number;
  move: number;
  bandStart: number;
  bandEnd: number;
  gauge: { from: number; to: number };
};

export const SPECS: Record<BuiltinExercise, MovementSpec> = {
  squat: {
    joints: [
      [23, 25, 27],
      [24, 26, 28],
    ],
    combine: "visible",
    direction: -1,
    rest: RULES.squat.rest,
    move: RULES.squat.move,
    bandStart: RULES.squat.depthMax,
    bandEnd: RULES.squat.depthMin,
    gauge: { from: 175, to: 40 },
  },
  shoulder_abduction: {
    joints: [
      [23, 11, 13],
      [24, 12, 14],
    ],
    combine: "mean",
    direction: 1,
    rest: RULES.shoulder.rest,
    move: RULES.shoulder.move,
    bandStart: RULES.shoulder.peakMin,
    bandEnd: RULES.shoulder.peakMax,
    gauge: { from: 10, to: 150 },
  },
};

const specOf = (x: BuiltinExercise | MovementSpec) =>
  typeof x === "string" ? SPECS[x] : x;
// True when angle is at or beyond edge in the movement direction.
const past = (spec: MovementSpec, angle: number, edge: number) =>
  (angle - edge) * spec.direction >= 0;
export const isResting = (spec: MovementSpec, angle: number) =>
  (angle - spec.rest) * spec.direction <= 0;
export const isMovingAngle = (spec: MovementSpec, angle: number) =>
  (angle - spec.move) * spec.direction > 0;

const isMoving = (spec: MovementSpec, frame: PoseFrame) => {
  const { angle, quality } = measureSpec(spec, frame.points, frame.aspect_ratio);
  return quality >= RULES.visible && isMovingAngle(spec, angle);
};

// Classify from two resting frames before movement, as the segmenter always
// did. A longer replay lead-in therefore never changes tempo or duration checks.
export function trimLeadIn(
  movement: BuiltinExercise | MovementSpec,
  frames: PoseFrame[],
) {
  const spec = specOf(movement);
  const first = frames.findIndex((f) => isMoving(spec, f));
  return first > 2 ? frames.slice(first - 2) : frames;
}

// Map mean joint visibility to a tracking confidence: 0.7+ is fully trusted,
// 0.62 reaches the default 0.8 threshold, 0.5 stays uncertain.
export const trackingConfidence = (visibility: number) =>
  Math.max(0, Math.min(1, (visibility - 0.3) / 0.4));
export const EXERCISES = {
  squat: {
    name: "Bodyweight squat",
    short: "Squat",
    focus: "Lower body · Control",
    instruction:
      "Stand side-on to the camera with your feet, hips and shoulders visible. Use the comfortable range prescribed by your therapist.",
    steps: [
      "Place the camera at hip height, 2 to 3 metres away, and stand side-on so your whole body is in view.",
      "Stand tall with feet hip-width apart and knees straight.",
      "Push your hips back and bend your knees as if sitting into a chair. Keep your chest up and heels down.",
      "Go only as low as is comfortable, roughly until your thighs point down at an angle.",
      "Stand back up slowly until your knees are straight. Take about two seconds for the whole rep.",
    ],
  },
  shoulder_abduction: {
    name: "Standing shoulder abduction",
    short: "Shoulder raise",
    focus: "Upper body · Mobility",
    instruction:
      "Face the camera with both arms in view. Raise your arms out to the sides within your prescribed range, then lower slowly.",
    steps: [
      "Place the camera at chest height, 2 to 3 metres away, and face it so your head, arms and hips are in view.",
      "Stand tall with your arms relaxed by your sides and palms facing in.",
      "Raise both arms out to the sides together, elbows straight, up to about shoulder height.",
      "Pause briefly without shrugging your shoulders.",
      "Lower both arms slowly back to your sides. Take about two seconds for the whole rep.",
    ],
  },
} as const;

export function jointAngle(a: Point, b: Point, c: Point, aspect = 1): number {
  const ux = (a.x - b.x) * aspect,
    uy = a.y - b.y,
    vx = (c.x - b.x) * aspect,
    vy = c.y - b.y;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return length < 1e-8
    ? 0
    : (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / length))) *
        180) /
        Math.PI;
}

export function measureSpec(spec: MovementSpec, points: Point[], aspect = 1) {
  const values = spec.joints.map(([a, b, c]) =>
    jointAngle(points[a], points[b], points[c], aspect),
  );
  const quality = spec.joints.map((j) =>
    Math.min(...j.map((i) => points[i].visibility)),
  );
  if (spec.combine === "mean")
    return {
      angle: (values[0] + values[1]) / 2,
      quality: Math.min(...quality),
      asymmetry: Math.abs(values[0] - values[1]),
    };
  // A side view can occlude one limb, so "visible" follows the clearer side.
  const side =
    spec.combine === "left"
      ? 0
      : spec.combine === "right"
        ? 1
        : quality[0] >= quality[1]
          ? 0
          : 1;
  return { angle: values[side], quality: quality[side], asymmetry: 0 };
}

export function measure(exercise: BuiltinExercise, points: Point[], aspect = 1) {
  return measureSpec(SPECS[exercise], points, aspect);
}

// Drop lead-in frames recorded before the video started (cutMs, relative to
// the first frame), keeping at least the two resting frames before movement.
export function alignLeadIn(
  movement: BuiltinExercise | MovementSpec,
  frames: PoseFrame[],
  cutMs: number,
): PoseFrame[] {
  const spec = specOf(movement);
  const first = frames.findIndex((f) => isMoving(spec, f));
  const limit = first > 2 ? first - 2 : 0;
  let start = 0;
  while (start < limit && frames[start].t < cutMs) start++;
  if (!start) return frames;
  const t0 = frames[start].t;
  return frames.slice(start).map((f) => ({ ...f, t: f.t - t0 }));
}

export const ruleClassifier: RepClassifier = {
  classify(exercise, allFrames, threshold = 0.8) {
    const frames = trimLeadIn(exercise, allFrames);
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
      model_version: MODEL_VERSION,
    });
    if (
      frames.length < 6 ||
      frames.some((f, i) => i > 0 && f.t <= frames[i - 1].t)
    ) {
      return result(
        "inconclusive",
        "tracking",
        0,
        "We need a complete, clearly tracked repetition.",
      );
    }
    const duration = frames.at(-1)!.t - frames[0].t;
    const values = frames.map((f) =>
      measure(exercise, f.points, f.aspect_ratio),
    );
    let quality = trackingConfidence(
      values.reduce((s, v) => s + v.quality, 0) / values.length,
    );
    if (
      duration < 600 ||
      duration > 15000 ||
      Math.min(...values.map((v) => v.quality)) < 0.2 ||
      frames.some((f, i) => i > 0 && f.t - frames[i - 1].t > RULES.maxGapMs)
    )
      quality = Math.min(quality, 0.5);
    if (quality < threshold)
      return result(
        "inconclusive",
        "tracking",
        quality,
        "Keep your whole body visible. Your therapist can review this rep.",
      );
    const angles = values.map((v) => v.angle);
    const { squat, shoulder } = RULES;
    const complete =
      exercise === "squat"
        ? angles[0] >= squat.rest &&
          angles.at(-1)! >= squat.rest &&
          Math.min(...angles) < squat.move
        : angles[0] <= shoulder.rest &&
          angles.at(-1)! <= shoulder.rest &&
          Math.max(...angles) > shoulder.move;
    let error: string | null = null,
      feedback = "";
    if (exercise === "squat") {
      const depth = Math.min(...angles);
      if (depth > squat.depthMax || depth < squat.depthMin)
        error = "range_of_motion";
      feedback =
        "Try the comfortable squat depth prescribed by your therapist.";
    } else {
      const height = Math.max(...angles);
      if (height < shoulder.peakMin || height > shoulder.peakMax)
        error = "range_of_motion";
      feedback =
        "Raise your arms to the height prescribed by your therapist, then lower slowly.";
      if (Math.max(...values.map((v) => v.asymmetry)) > shoulder.asymmetry) {
        error = "uneven_movement";
        feedback = "Move both arms together within your prescribed range.";
      }
    }
    if (!complete)
      return result(
        "inconclusive",
        "incomplete",
        Math.min(quality, 0.6),
        "Return to the starting position to finish a full rep.",
      );
    if (duration < RULES.minTempoMs) {
      error = "tempo";
      feedback = "Slow down and move smoothly through the repetition.";
    }
    return error
      ? result("incorrect", error, quality, feedback)
      : result(
          "correct",
          null,
          quality,
          "Good control. That repetition counts.",
        );
  },
};

// Decide when tracking may start on its own: every setup check must hold for
// holdMs, and any post-rep replay pause must be over. readySince 0 means "not ready".
export function autoStart(
  readySince: number,
  ready: boolean,
  now: number,
  resumeAt: number,
  holdMs = 2000,
): { readySince: number; start: boolean } {
  if (!ready) return { readySince: 0, start: false };
  if (!readySince) return { readySince: now, start: false };
  if (now - readySince >= holdMs && now >= resumeAt)
    return { readySince: 0, start: true };
  return { readySince, start: false };
}

// Where a joint angle sits on the movement gauge beside the camera.
// position runs 0 (resting) to 1 (furthest shown); the target band is the
// range that counts, taken from the spec so the gauge matches the classifier.
export type MovementZone = "rest" | "approach" | "target" | "over";

const CUES: Record<BuiltinExercise | "custom", Record<MovementZone, string>> = {
  squat: {
    rest: "Lower when you are ready",
    approach: "Go a little lower",
    target: "Good depth. Stand up slowly",
    over: "That is deep enough. Come up a little",
  },
  shoulder_abduction: {
    rest: "Raise your arms when ready",
    approach: "Raise a little higher",
    target: "Good height. Lower slowly",
    over: "High enough. Lower a little",
  },
  custom: {
    rest: "Start when you are ready",
    approach: "Keep going a little further",
    target: "Good range. Return slowly",
    over: "That is far enough. Ease back a little",
  },
};

export function movementProgress(
  movement: BuiltinExercise | MovementSpec,
  angle: number,
) {
  const spec = specOf(movement);
  const { from, to } = spec.gauge;
  const at = (a: number) =>
    Math.max(0, Math.min(1, (a - from) / (to - from)));
  const zone: MovementZone =
    past(spec, angle, spec.bandEnd) && angle !== spec.bandEnd
      ? "over"
      : past(spec, angle, spec.bandStart)
        ? "target"
        : past(spec, angle, spec.rest) && angle !== spec.rest
          ? "approach"
          : "rest";
  const cue =
    CUES[typeof movement === "string" ? movement : "custom"][zone];
  return {
    position: at(angle),
    bandStart: at(spec.bandStart),
    bandEnd: at(spec.bandEnd),
    zone,
    cue,
  };
}

export class RepSegmenter {
  private frames: PoseFrame[] = [];
  private ready: PoseFrame[] = [];
  private restingFrames = 0;
  private moveStart = 0;
  private spec: MovementSpec;
  /** Original timestamp of the first frame of the last completed rep. */
  lastStart = 0;
  constructor(movement: BuiltinExercise | MovementSpec) {
    this.spec = specOf(movement);
  }
  get active() {
    return this.frames.length > 0;
  }
  reset() {
    this.frames = [];
    this.ready = [];
    this.restingFrames = 0;
  }
  push(frame: PoseFrame): PoseFrame[] | null {
    if (frame.points.length !== 33) return null;
    const { angle, quality } = measureSpec(
      this.spec,
      frame.points,
      frame.aspect_ratio,
    );
    const { visible } = RULES;
    const resting = isResting(this.spec, angle);
    const moving = isMovingAngle(this.spec, angle);
    if (!this.frames.length) {
      if (quality >= visible && resting) {
        this.ready = [
          ...this.ready.filter((f) => frame.t - f.t <= RULES.leadInMs),
          frame,
        ].slice(-30);
      } else if (quality >= visible && moving && this.ready.length >= 2) {
        this.frames = [...this.ready, frame];
        this.moveStart = frame.t;
        this.ready = [];
      } else if (quality < visible) {
        this.ready = [];
      }
      return null;
    }
    this.frames.push(frame);
    this.restingFrames =
      resting && quality >= visible ? this.restingFrames + 1 : 0;
    if (this.frames.length > 180 || frame.t - this.moveStart > 15000) {
      this.reset();
      return null;
    }
    if (this.restingFrames >= 2) {
      const start = this.frames[0].t;
      this.lastStart = start;
      const complete = this.frames.map((f) => ({ ...f, t: f.t - start }));
      this.reset();
      this.ready = [frame];
      return complete.length >= 6 ? complete : null;
    }
    return null;
  }
}

export const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#b7f99b";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const [a, b] of CONNECTIONS) {
    if (Math.min(points[a].visibility, points[b].visibility) < 0.35) continue;
    ctx.beginPath();
    ctx.moveTo(points[a].x * width, points[a].y * height);
    ctx.lineTo(points[b].x * width, points[b].y * height);
    ctx.stroke();
  }
  ctx.fillStyle = "#f6ffef";
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (points[i].visibility < 0.35) continue;
    ctx.beginPath();
    ctx.arc(points[i].x * width, points[i].y * height, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function demoFrame(
  exercise: BuiltinExercise,
  angle: number,
  t: number,
  visibility = 0.97,
): PoseFrame {
  const points: Point[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.15,
    z: 0,
    visibility,
  }));
  const set = (i: number, x: number, y: number) => {
    points[i] = { x, y, z: 0, visibility };
  };
  set(11, 0.42, 0.3);
  set(12, 0.58, 0.3);
  set(23, 0.44, 0.53);
  set(24, 0.56, 0.53);
  set(25, 0.44, 0.73);
  set(26, 0.56, 0.73);
  set(27, 0.44, 0.94);
  set(28, 0.56, 0.94);
  if (exercise === "squat") {
    const a = (angle * Math.PI) / 180;
    for (const [hip, knee, ankle] of [
      [23, 25, 27],
      [24, 26, 28],
    ]) {
      set(
        hip,
        points[knee].x + 0.2 * Math.sin(a),
        points[knee].y + 0.2 * Math.cos(a),
      );
      set(ankle, points[knee].x, points[knee].y + 0.2);
    }
    set(11, points[23].x, points[23].y - 0.24);
    set(12, points[24].x, points[24].y - 0.24);
    set(13, points[11].x - 0.07, points[11].y + 0.13);
    set(14, points[12].x + 0.07, points[12].y + 0.13);
  } else {
    const a = (angle * Math.PI) / 180;
    set(13, 0.42 - 0.2 * Math.sin(a), 0.3 + 0.2 * Math.cos(a));
    set(14, 0.58 + 0.2 * Math.sin(a), 0.3 + 0.2 * Math.cos(a));
  }
  set(15, points[13].x - 0.04, points[13].y + 0.12);
  set(16, points[14].x + 0.04, points[14].y + 0.12);
  set(31, points[27].x - 0.04, 0.96);
  set(32, points[28].x + 0.04, 0.96);
  return { t, points };
}
