// Pick the part of a demo video used for the model. Times are in seconds.
export const MAX_DEMO_SECONDS = 60;
export const MIN_DEMO_SECONDS = 2;

export type Trim = { start: number; end: number };

// Keep a trim inside the video, at least MIN and at most MAX seconds long.
// The edge being moved wins: moving the start pushes the end along, and the reverse.
export function clampTrim(
  trim: Trim,
  duration: number,
  moved: "start" | "end" = "start",
): Trim {
  const round = (s: number) => Math.round(s * 10) / 10;
  const total = Math.max(0, duration);
  let start = Math.min(Math.max(0, trim.start), total);
  let end = Math.min(Math.max(0, trim.end), total);
  const min = Math.min(MIN_DEMO_SECONDS, total);
  if (moved === "start") {
    if (end - start < min) end = Math.min(total, start + min);
    if (end - start > MAX_DEMO_SECONDS) end = start + MAX_DEMO_SECONDS;
    start = Math.min(start, end - min);
  } else {
    if (end - start < min) start = Math.max(0, end - min);
    if (end - start > MAX_DEMO_SECONDS) start = end - MAX_DEMO_SECONDS;
    end = Math.max(end, start + min);
  }
  return { start: round(Math.max(0, start)), end: round(Math.min(total, end)) };
}

export const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  return m + ":" + (s - m * 60).toFixed(1).padStart(4, "0");
};
