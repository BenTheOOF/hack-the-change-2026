
export function ExerciseSteps({ steps }: { steps: readonly string[] }) {
  return (
    <div className="exercise-steps">
      <strong>How to do it</strong>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
