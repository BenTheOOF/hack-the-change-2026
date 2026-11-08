import {
  movementProgress,
  type BuiltinExercise,
  type MovementSpec,
} from "./engine";

// Vertical gauge beside the camera: how far the current movement has gone,
// where the counting range is, and the furthest point of the current rep.
// It fills downward when the angle shrinks (squat) and upward when it grows.
export function MovementGauge({
  movement,
  angle,
  peak,
}: {
  movement: BuiltinExercise | MovementSpec;
  angle: number | null;
  peak: number | null;
}) {
  const label =
    movement === "squat"
      ? ["Depth", "Squat depth"]
      : movement === "shoulder_abduction"
        ? ["Height", "Arm height"]
        : ["Range", "Movement range"];
  const live = angle === null ? null : movementProgress(movement, angle);
  const band = movementProgress(movement, 0);
  const best = peak === null ? null : movementProgress(movement, peak);
  // Fill toward the direction of travel: down when the angle shrinks.
  const spec = typeof movement === "string" ? null : movement;
  const edge =
    movement === "squat" || spec?.direction === -1 ? "top" : "bottom";
  const pct = (v: number) => v * 100 + "%";
  return (
    <div
      className="movement-gauge"
      role="progressbar"
      aria-label={label[1]}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={live ? Math.round(live.position * 100) : 0}
      aria-valuetext={live?.cue ?? "Waiting for your pose"}
    >
      <span className="gauge-title">{label[0]}</span>
      <div className="gauge-track">
        <div
          className="gauge-band"
          style={{
            [edge]: pct(band.bandStart),
            height: pct(band.bandEnd - band.bandStart),
          }}
        >
          <span>Target</span>
        </div>
        {live && (
          <div
            className={"gauge-fill zone-" + live.zone}
            style={{ [edge]: 0, height: pct(live.position) }}
          />
        )}
        {best && (
          <div
            className="gauge-peak"
            style={{ [edge]: pct(best.position) }}
            title="Furthest point this rep"
          />
        )}
      </div>
      <span className={"gauge-cue" + (live ? " zone-" + live.zone : "")}>
        {live?.cue ?? "Step into view"}
      </span>
    </div>
  );
}
