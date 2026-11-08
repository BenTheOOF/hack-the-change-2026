// One place that turns a plan or rep into what the UI needs: display text,
// the movement spec for segmenting and the gauge, and the classifier.
import {
  EXERCISES,
  ruleClassifier,
  SPECS,
  type BuiltinExercise,
  type Evaluation,
  type Exercise,
  type MovementSpec,
  type PoseFrame,
} from "./engine";
import { classifyTemplate, type TemplateModel } from "./template";

export type CustomExercise = {
  id: string;
  therapist_id: string;
  name: string;
  description: string;
  steps: string[];
  view: "front" | "side";
  status: "queued" | "training" | "ready" | "failed";
  status_detail: string | null;
  model: TemplateModel | null;
  model_version: string | null;
  demo_video_path: string | null;
  created_at: string;
  // Demo only: one segmented demo rep, replayed by the simulated rep buttons.
  sample_rep?: PoseFrame[];
};

export type ExerciseInfo = {
  name: string;
  short: string;
  focus: string;
  instruction: string;
  steps: readonly string[];
  custom?: CustomExercise;
};

export type Movement = {
  // Built-ins keep their own gauge cues; custom exercises use the spec.
  key: BuiltinExercise | MovementSpec;
  spec: MovementSpec;
  classify: (frames: PoseFrame[], threshold: number) => Evaluation;
};

type Linked = {
  exercise: Exercise;
  custom_exercise_id?: string | null;
  prescription?: { custom_exercise_id: string | null } | null;
};

export const customIdOf = (item: Linked) =>
  item.custom_exercise_id ?? item.prescription?.custom_exercise_id ?? null;

export function exerciseInfo(
  item: Linked,
  customs: CustomExercise[],
): ExerciseInfo {
  if (item.exercise !== "custom") return EXERCISES[item.exercise];
  const custom = customs.find((c) => c.id === customIdOf(item));
  return {
    name: custom?.name ?? "Therapist exercise",
    short: custom?.name ?? "Custom",
    focus: "From your therapist · Custom",
    instruction:
      custom?.description ||
      "Follow the movement in your therapist's demo video.",
    steps: custom?.steps.length
      ? custom.steps
      : [
          "Watch your therapist's demo video first.",
          "Set up the camera so the moving joints stay in view.",
          "Start and finish every rep in the resting position.",
          "Move through the same range at a steady pace.",
        ],
    custom,
  };
}

export function movementFor(
  exercise: Exercise,
  custom?: CustomExercise,
): Movement | null {
  if (exercise !== "custom")
    return {
      key: exercise,
      spec: SPECS[exercise],
      classify: (frames, threshold) =>
        ruleClassifier.classify(exercise, frames, threshold),
    };
  const model = custom?.model;
  if (!model) return null;
  return {
    key: model.spec,
    spec: model.spec,
    classify: (frames, threshold) => classifyTemplate(model, frames, threshold),
  };
}
