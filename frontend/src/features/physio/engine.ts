export type Exercise = "squat" | "shoulder_abduction";
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
    exercise: Exercise,
    frames: PoseFrame[],
    threshold: number,
  ): Evaluation;
}
export const MODEL_VERSION = "rules-1.0.0";
export const EXERCISES = {
  squat: {
    name: "Bodyweight squat",
    short: "Squat",
    focus: "Lower body · Control",
    instruction:
      "Stand side-on to the camera with your feet, hips and shoulders visible. Use the comfortable range prescribed by your therapist.",
  },
  shoulder_abduction: {
    name: "Standing shoulder abduction",
    short: "Shoulder raise",
    focus: "Upper body · Mobility",
    instruction:
      "Face the camera with both arms in view. Raise your arms out to the sides within your prescribed range, then lower slowly.",
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

export function measure(exercise: Exercise, points: Point[], aspect = 1) {
  const joints =
    exercise === "squat"
      ? [
          [23, 25, 27],
          [24, 26, 28],
        ]
      : [
          [23, 11, 13],
          [24, 12, 14],
        ];
  const values = joints.map(([a, b, c]) =>
    jointAngle(points[a], points[b], points[c], aspect),
  );
  const quality = joints.map((j) =>
    Math.min(...j.map((i) => points[i].visibility)),
  );
  const side = quality[0] >= quality[1] ? 0 : 1;
  return exercise === "squat"
    ? { angle: values[side], quality: quality[side], asymmetry: 0 }
    : {
        angle: (values[0] + values[1]) / 2,
        quality: Math.min(...quality),
        asymmetry: Math.abs(values[0] - values[1]),
      };
}

export const ruleClassifier: RepClassifier = {
  classify(exercise, frames, threshold = 0.8) {
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
    let quality = values.reduce((s, v) => s + v.quality, 0) / values.length;
    if (
      duration < 600 ||
      duration > 15000 ||
      Math.min(...values.map((v) => v.quality)) < 0.35 ||
      frames.some((f, i) => i > 0 && f.t - frames[i - 1].t > 500)
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
    const complete =
      exercise === "squat"
        ? angles[0] >= 155 && angles.at(-1)! >= 160 && Math.min(...angles) < 150
        : angles[0] <= 35 && angles.at(-1)! <= 30 && Math.max(...angles) > 40;
    let error: string | null = null,
      feedback = "";
    if (exercise === "squat") {
      const depth = Math.min(...angles);
      if (depth > 115 || depth < 55) error = "range_of_motion";
      feedback =
        "Try the comfortable squat depth prescribed by your therapist.";
    } else {
      const height = Math.max(...angles);
      if (height < 75 || height > 115) error = "range_of_motion";
      feedback =
        "Raise your arms to the height prescribed by your therapist, then lower slowly.";
      if (Math.max(...values.map((v) => v.asymmetry)) > 30) {
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
    if (duration < 1200) {
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

export class RepSegmenter {
  private frames: PoseFrame[] = [];
  private ready: PoseFrame[] = [];
  private restingFrames = 0;
  private exercise: Exercise;
  constructor(exercise: Exercise) {
    this.exercise = exercise;
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
    const { angle, quality } = measure(
      this.exercise,
      frame.points,
      frame.aspect_ratio,
    );
    const resting = this.exercise === "squat" ? angle >= 160 : angle <= 30;
    const moving = this.exercise === "squat" ? angle < 150 : angle > 40;
    if (!this.frames.length) {
      if (quality >= 0.6 && resting) {
        this.ready = [...this.ready.slice(-2), frame];
      } else if (quality >= 0.6 && moving && this.ready.length >= 2) {
        this.frames = [...this.ready, frame];
        this.ready = [];
      } else if (quality < 0.6) {
        this.ready = [];
      }
      return null;
    }
    this.frames.push(frame);
    this.restingFrames = resting && quality >= 0.6 ? this.restingFrames + 1 : 0;
    if (this.frames.length > 180 || frame.t - this.frames[0].t > 15000) {
      this.reset();
      return null;
    }
    if (this.restingFrames >= 2) {
      const start = this.frames[0].t;
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
  exercise: Exercise,
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
