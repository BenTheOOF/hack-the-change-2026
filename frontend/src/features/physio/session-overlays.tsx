"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/features/ui/icons";
import type { SetupChecks, SetupPrompt } from "./setup-prompt";

// Turn browser camera and model-loading failures into steps a patient can act on.
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access was blocked. Allow the camera for this site in your browser’s address bar or settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found. Connect a camera or try another device.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Your camera is busy. Close other apps or tabs that use it, then try again.";
  if (name === "PoseModelError")
    return "The pose tracker could not load. Run `npm run pose:setup` in frontend, then reload this page.";
  return error instanceof Error && error.message
    ? error.message
    : "The camera could not start. Please try again.";
}

// Big, direct setup instruction over the camera, so it can be read from 2 to 3
// metres away. The side panel keeps the full checklist.
export function SetupOverlay({
  prompt,
  checks,
}: {
  prompt: SetupPrompt;
  checks: SetupChecks;
}) {
  // Full label, and the short one used when the camera view is small.
  const items: [keyof SetupChecks, string, string][] = [
    ["body", "Body in frame", "Body"],
    ["light", "Lighting", "Light"],
    ["distance", "Distance", "Distance"],
  ];
  return (
    <div
      className={"setup-overlay tone-" + prompt.tone}
      role="status"
      aria-live="polite"
    >
      <strong className="setup-overlay-title">{prompt.title}</strong>
      <span className="setup-overlay-detail">{prompt.detail}</span>
      {prompt.showChecks && (
        <ul className="setup-overlay-checks">
          {items.map(([key, label, short]) => (
            <li key={key} className={checks[key] ? "ready" : ""}>
              <Icon name={checks[key] ? "check" : "x"} size={16} />
              <span className="label-full">{label}</span>
              <span className="label-short">{short}</span>
              <span className="sr-only">
                {checks[key] ? " ready" : " not ready"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Daily target reached: tracking is paused until the patient picks one.
export function FinishOverlay({
  count,
  target,
  onFinish,
  onContinue,
}: {
  count: number;
  target: number;
  onFinish: () => void;
  onContinue: () => void;
}) {
  const finish = useRef<HTMLButtonElement>(null);
  useEffect(() => finish.current?.focus(), []);
  return (
    <div
      className="finish-overlay"
      role="alertdialog"
      aria-labelledby="finish-title"
      aria-describedby="finish-detail"
    >
      <span className="finish-mark" aria-hidden="true">
        <Icon name="check" />
      </span>
      <strong id="finish-title" className="finish-title">
        Today&apos;s target reached
      </strong>
      <span id="finish-detail" className="finish-detail">
        {count} of {target} reps done. Extra reps are optional; stop if
        anything hurts.
      </span>
      <div className="finish-actions">
        <button ref={finish} className="primary" onClick={onFinish}>
          Finish session
        </button>
        <button className="secondary" onClick={onContinue}>
          Keep going
        </button>
      </div>
    </div>
  );
}
