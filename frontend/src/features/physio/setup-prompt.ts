export type SetupChecks = { body: boolean; light: boolean; distance: boolean };

export type SetupPrompt = {
  tone: "fix" | "ready";
  title: string;
  detail: string;
  // False when nobody is detected: the checks were not measured, so they are not shown.
  showChecks: boolean;
};

const BODY_DETAIL = "Head, hands, hips and feet all need to be on screen.";

// The one instruction shown large over the camera before tracking starts.
// Nobody detected comes first, then light (a dark room hides joints), then the
// body, then distance. distanceTip is the hint from distanceCheck in engine.ts.
export function setupPrompt(
  checks: SetupChecks,
  distanceTip: string,
  holdLeft: number | null,
): SetupPrompt {
  const fix = (title: string, detail: string, showChecks = true): SetupPrompt => ({
    tone: "fix",
    title,
    detail,
    showChecks,
  });
  if (distanceTip === "Step into view" && !checks.body)
    return fix(
      "Step into view",
      "Stand 2 to 3 metres from the camera, in a well-lit room.",
      false,
    );
  if (!checks.light)
    return fix(
      "Find more even light",
      "Face a window or turn on a lamp. Avoid bright light behind you.",
    );
  if (!checks.body)
    return distanceTip === "Step back a little"
      ? fix("Step back so your whole body fits", BODY_DETAIL)
      : fix("Get your whole body in the frame", BODY_DETAIL);
  if (!checks.distance)
    return fix(
      distanceTip || "Adjust your distance",
      "About 2 to 3 metres from the camera usually works.",
    );
  return {
    tone: "ready",
    title: holdLeft !== null ? `Hold still… ${holdLeft}` : "Hold still",
    detail: "Everything looks good. Tracking starts in a moment.",
    showChecks: true,
  };
}
