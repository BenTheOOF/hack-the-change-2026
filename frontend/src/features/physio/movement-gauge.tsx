import { movementProgress, type Exercise } from "./engine";

// Vertical gauge beside the camera: how far the current movement has gone,
// where the counting range is, and the furthest point of the current rep.
// Squats fill downward ("go lower"); arm raises fill upward ("raise higher").
export function MovementGauge({
  exercise,
  angle,
  peak,
}: {
  exercise: Exercise;
  angle: number | null;
  peak: number | null;
}) {
  const live = angle === null ? null : movementProgress(exercise, angle);
  const band = movementProgress(exercise, 0);
  const best = peak === null ? null : movementProgress(exercise, peak);
  const edge = exercise === "squat" ? "top" : "bottom";
  const pct = (v: number) => v * 100 + "%";
  return (
    <div
      className="movement-gauge"
      role="progressbar"
      aria-label={exercise === "squat" ? "Squat depth" : "Arm height"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={live ? Math.round(live.position * 100) : 0}
      aria-valuetext={live?.cue ?? "Waiting for your pose"}
    >
      <span className="gauge-title">
        {exercise === "squat" ? "Depth" : "Height"}
      </span>
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
