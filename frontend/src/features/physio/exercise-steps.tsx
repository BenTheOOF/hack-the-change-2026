import { EXERCISES, type Exercise } from "./engine";

export function ExerciseSteps({ exercise }: { exercise: Exercise }) {
  return (
    <div className="exercise-steps">
      <strong>How to do it</strong>
      <ol>
        {EXERCISES[exercise].steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
