"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  alignLeadIn,
  autoStart,
  demoFrame,
  distanceCheck,
  trackingLoss,
  measureSpec,
  drawSkeleton,
  RepSegmenter,
  RULES,
  type BuiltinExercise,
  type Evaluation,
  type PoseFrame,
} from "./engine";
import { ExerciseSteps } from "./exercise-steps";
import { MovementGauge } from "./movement-gauge";
import type { ExerciseInfo, Movement } from "./movement";
import { createPoseLandmarker } from "./pose-model";
import { PoseReplay } from "./pose-replay";
import { TrimmedVideo } from "./trimmed-video";
import type { Prescription } from "./types";

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

const READY_HOLD_MS = 2000;
const LEAD_IN_MAX_MS = RULES.leadInMs;
const POST_ROLL_MS = 500;

type Take = {
  rec: MediaRecorder;
  started: number;
  chunks: Blob[];
  done?: (blob?: Blob) => void;
};
const REPLAY_PAUSE_MS = 3000;

type Props = {
  plan: Prescription;
  movement: Movement;
  info: ExerciseInfo;
  // Therapist's demo video for custom exercises.
  demoVideoUrl?: string;
  demo: boolean;
  uploadConsent: boolean;
  todayCount: number;
  onRep: (
    frames: PoseFrame[],
    evaluation: Evaluation,
    clip?: Blob,
  ) => Promise<Evaluation>;
  onClose: () => Promise<void>;
};

export function LiveSession({
  plan,
  movement,
  info,
  demoVideoUrl,
  demo,
  uploadConsent,
  todayCount,
  onRep,
  onClose,
}: Props) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null),
    detector = useRef<PoseLandmarker | null>(null);
  const takes = useRef<Take[]>([]),
    recordingUnsupported = useRef(false);
  const animation = useRef(0),
    generation = useRef(0),
    mounted = useRef(true),
    running = useRef(false),
    evaluating = useRef(false),
    paused = useRef(false),
    readySince = useRef(0),
    lostSince = useRef(0),
    resumeAt = useRef(0);
  const spec = movement.spec;
  const segmenter = useRef(new RepSegmenter(spec));
  const [userPaused, setUserPaused] = useState(false);
  // Live joint angle for the gauge, and the furthest angle of the current rep.
  const [liveAngle, setLiveAngle] = useState<number | null>(null);
  const [peakAngle, setPeakAngle] = useState<number | null>(null);
  const peak = useRef<number | null>(null);
  const further = (a: number, b: number | null) =>
    b === null ? a : spec.direction < 0 ? Math.min(a, b) : Math.max(a, b);
  // Whole seconds left before tracking starts; null while checks are not all ready.
  const [holdLeft, setHoldLeft] = useState<number | null>(null);
  const holdShown = useRef<number | null>(null);
  const [camera, setCamera] = useState(false),
    [loading, setLoading] = useState(false),
    [active, setActive] = useState(false);
  // "Move a little closer" or "Step back a little" beside the distance check.
  const [distanceTip, setDistanceTip] = useState("");
  const distanceHint = useRef("");
  const [checks, setChecks] = useState({
    body: false,
    light: false,
    distance: false,
  });
  const [feedback, setFeedback] = useState(
    "Set up your space, then turn on your camera.",
  );
  const [error, setError] = useState(""),
    [accepted, setAccepted] = useState(0),
    [pending, setPending] = useState(0);
  const [last, setLast] = useState<{
    frames: PoseFrame[];
    evaluation: Evaluation;
    url?: string;
  } | null>(null);
  const lastUrl = useRef<string | null>(null);
  const smallCanvas = useRef<HTMLCanvasElement | null>(null);
  const replayPanel = useRef<HTMLDivElement>(null);
  const lastLabel = last?.evaluation.label;

  // A rep that needs attention must be seen, not left below the fold.
  useEffect(() => {
    if (lastLabel && lastLabel !== "correct")
      replayPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [last, lastLabel]);

  const discardTake = (take: Take) => {
    take.rec.ondataavailable = null;
    take.rec.onstop = null;
    if (take.rec.state !== "inactive") take.rec.stop();
  };
  const discardTakes = () => {
    takes.current.forEach(discardTake);
    takes.current = [];
  };

  const newTake = (): Take | null => {
    if (!stream.current || !window.MediaRecorder) return null;
    const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    if (!mime) return null;
    try {
      const rec = new MediaRecorder(stream.current, {
        mimeType: mime,
        videoBitsPerSecond: 700000,
      });
      const take: Take = { rec, started: performance.now(), chunks: [] };
      let size = 0;
      rec.ondataavailable = (event) => {
        size += event.data.size;
        if (size <= 10 * 1024 * 1024) take.chunks.push(event.data);
        else take.chunks = [];
      };
      rec.onstop = () =>
        take.done?.(
          take.chunks.length
            ? new Blob(take.chunks, { type: mime })
            : undefined,
        );
      rec.start(250);
      return take;
    } catch {
      return null;
    }
  };

  // While the patient waits at rest, keep two staggered recordings. The older
  // one is kept when movement starts, so every clip has 1.5-3 s of lead-in.
  const rollTakes = (now: number) => {
    if (recordingUnsupported.current) return;
    const list = takes.current;
    if (list.length && now - list[0].started >= LEAD_IN_MAX_MS)
      discardTake(list.shift()!);
    const newest = list.at(-1);
    if (
      !newest ||
      (list.length < 2 && now - newest.started >= LEAD_IN_MAX_MS / 2)
    ) {
      const take = newTake();
      if (take) list.push(take);
      else recordingUnsupported.current = true;
    }
  };

  const keepOldestTake = () => {
    takes.current.slice(1).forEach(discardTake);
    takes.current = takes.current.slice(0, 1);
  };

  // Keep recording briefly after the return to rest, then hand back the clip.
  const finishTake = async (): Promise<
    { blob?: Blob; started: number } | undefined
  > => {
    keepOldestTake();
    const take = takes.current.pop();
    if (!take) return undefined;
    await new Promise((resolve) => setTimeout(resolve, POST_ROLL_MS));
    return new Promise((resolve) => {
      take.done = (blob) => resolve({ blob, started: take.started });
      if (take.rec.state === "inactive") resolve({ started: take.started });
      else take.rec.stop();
    });
  };

  const evaluate = async (segment: PoseFrame[]) => {
    if (evaluating.current) return;
    evaluating.current = true;
    running.current = false;
    setActive(false);
    const segmentStart = segmenter.current.lastStart;
    try {
      const take = await finishTake();
      const clip = take?.blob;
      // Start the saved pose where the video starts, so the overlay lines up.
      const frames = clip
        ? alignLeadIn(spec, segment, take.started - segmentStart)
        : segment;
      const local = movement.classify(frames, plan.confidence_threshold);
      setFeedback(local.feedback);
      const saved = await onRep(
        frames,
        local,
        clip,
      );
      if (!mounted.current) return;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      const url = clip ? URL.createObjectURL(clip) : undefined;
      lastUrl.current = url ?? null;
      setLast({ frames, evaluation: saved, url });
      setFeedback(saved.feedback);
      if (saved.label === "correct") {
        setAccepted((n) => n + 1);
        running.current = true;
        setActive(true);
      } else {
        if (saved.label === "inconclusive") setPending((n) => n + 1);
        // Give the patient time to watch the replay before tracking resumes.
        resumeAt.current = performance.now() + REPLAY_PAUSE_MS;
      }
    } catch (e) {
      resumeAt.current = performance.now() + REPLAY_PAUSE_MS;
      setError(
        e instanceof Error ? e.message : "The repetition could not be saved.",
      );
      setFeedback(
        "We could not confirm this rep was saved. Check your history before trying it again.",
      );
    } finally {
      evaluating.current = false;
    }
  };

  const stopCamera = () => {
    generation.current += 1;
    cancelAnimationFrame(animation.current);
    running.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    detector.current?.close();
    detector.current = null;
    discardTakes();
    segmenter.current.reset();
    readySince.current = 0;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopCamera();
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    };
  }, []);

  async function startCamera() {
    setLoading(true);
    setError("");
    const current = ++generation.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // Browsers only expose the camera on HTTPS or localhost, not on a LAN IP over plain HTTP.
      setError(
        "The camera only works on a secure page. Open PhysioTrace over HTTPS or at http://localhost on this device.",
      );
      setLoading(false);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      if (!mounted.current || generation.current !== current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const pose = await createPoseLandmarker();
      if (!mounted.current || generation.current !== current) {
        pose.close();
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      detector.current = pose;
      video.current!.srcObject = media;
      await video.current!.play();
      setCamera(true);
      setFeedback(
        "Find your starting position. Tracking starts on its own once every setup check is ready.",
      );
      let lastSample = 0,
        lastVideo = -1;
      smallCanvas.current = document.createElement("canvas");
      smallCanvas.current.width = 32;
      smallCanvas.current.height = 24;
      const loop = (now: number) => {
        if (
          generation.current !== current ||
          !video.current ||
          !detector.current
        )
          return;
        if (
          video.current.readyState >= 2 &&
          now - lastSample >= 100 &&
          video.current.currentTime !== lastVideo
        ) {
          lastSample = now;
          lastVideo = video.current.currentTime;
          try {
            const result = detector.current.detectForVideo(video.current, now);
            const points = result.landmarks[0]?.map((p) => ({
              x: p.x,
              y: p.y,
              z: p.z,
              visibility: p.visibility ?? 0,
            }));
            const ctx = canvas.current?.getContext("2d");
            const loss = trackingLoss(lostSince.current, !!points, now);
            lostSince.current = loss.lostSince;
            if (!points && !loss.reset) {
              // A brief miss: keep the last skeleton, reading, and rep in progress.
            } else if (points && ctx) {
              drawSkeleton(ctx, points, 640, 480);
              const sides = [
                [0, 11, 23, 27, 31],
                [0, 12, 24, 28, 32],
              ];
              // Custom exercises need the joints their model measures.
              const customJoints = [
                ...new Set(
                  spec.combine === "visible"
                    ? spec.joints[
                        Math.min(...spec.joints[0].map((i) => points[i].visibility)) >=
                        Math.min(...spec.joints[1].map((i) => points[i].visibility))
                          ? 0
                          : 1
                      ]
                    : spec.combine === "left"
                      ? spec.joints[0]
                      : spec.combine === "right"
                        ? spec.joints[1]
                        : spec.joints.flat(),
                ),
              ];
              const indices =
                plan.exercise === "custom"
                  ? customJoints
                  : plan.exercise === "squat"
                  ? sides.reduce((best, side) =>
                      Math.min(...side.map((i) => points[i].visibility)) >
                      Math.min(...best.map((i) => points[i].visibility))
                        ? side
                        : best,
                    )
                  : [0, 11, 12, 15, 16, 23, 24, 27, 28];
              const body = indices.every(
                (i) =>
                  points[i].visibility > 0.5 &&
                  points[i].x > 0.02 &&
                  points[i].x < 0.98 &&
                  points[i].y > 0.02 &&
                  points[i].y < 0.98,
              );
              const distance = distanceCheck(
                points,
                video.current.videoWidth / video.current.videoHeight,
              );
              if (distance.hint !== distanceHint.current) {
                distanceHint.current = distance.hint;
                setDistanceTip(distance.hint);
              }
              const sample = smallCanvas.current!.getContext("2d", {
                willReadFrequently: true,
              });
              let brightness = 0;
              if (sample) {
                sample.drawImage(video.current, 0, 0, 32, 24);
                const pixels = sample.getImageData(0, 0, 32, 24).data;
                for (let i = 0; i < pixels.length; i += 4)
                  brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                brightness /= pixels.length / 4;
              }
              const setup = {
                body,
                distance: distance.ok,
                light: brightness > 35 && brightness < 245,
              };
              setChecks(setup);
              const reading = measureSpec(
                spec,
                points,
                video.current.videoWidth / video.current.videoHeight,
              );
              const angleNow =
                reading.quality >= RULES.visible
                  ? Math.round(reading.angle)
                  : null;
              setLiveAngle(angleNow);
              // Start tracking on its own once every check has held steadily.
              if (!running.current && !evaluating.current && !paused.current) {
                const next = autoStart(
                  readySince.current,
                  setup.body && setup.light && setup.distance,
                  now,
                  resumeAt.current,
                  READY_HOLD_MS,
                );
                readySince.current = next.readySince;
                const left = next.readySince
                  ? Math.max(
                      1,
                      Math.ceil(
                        (Math.max(
                          READY_HOLD_MS - (now - next.readySince),
                          resumeAt.current - now,
                        )) /
                          1000,
                      ),
                    )
                  : null;
                if (left !== holdShown.current) {
                  holdShown.current = left;
                  setHoldLeft(left);
                }
                if (next.start) {
                  holdShown.current = null;
                  setHoldLeft(null);
                  segmenter.current.reset();
                  running.current = true;
                  setActive(true);
                  setError("");
                  setFeedback(
                    "Tracking started. Return to your starting position between repetitions.",
                  );
                }
              }
              if (running.current) {
                if (!segmenter.current.active) rollTakes(now);
                // Poor tracking during an active rep must reach the classifier as uncertainty.
                const wasActive = segmenter.current.active;
                const frames = segmenter.current.push({
                  t: now,
                  points,
                  aspect_ratio:
                    video.current.videoWidth / video.current.videoHeight,
                });
                if (!wasActive && segmenter.current.active) {
                  keepOldestTake();
                  peak.current = null;
                }
                if (segmenter.current.active && angleNow !== null) {
                  const next = further(angleNow, peak.current);
                  if (next !== peak.current) {
                    peak.current = next;
                    setPeakAngle(next);
                  }
                }
                if (wasActive && !segmenter.current.active && !frames)
                  discardTakes();
                if (frames) void evaluate(frames);
              }
            } else if (!points) {
              ctx?.clearRect(0, 0, 640, 480);
              readySince.current = 0;
              setLiveAngle(null);
              setChecks({ body: false, distance: false, light: false });
              if (segmenter.current.active)
                setFeedback(
                  "We lost sight of you mid-rep. Keep your whole body in view, then start the next rep from rest.",
                );
              // Do not join movements on either side of a longer tracking loss.
              segmenter.current.reset();
              discardTakes();
            }
          } catch {
            setError(
              "Pose tracking stopped. Close this session and reopen the camera.",
            );
            stopCamera();
            setCamera(false);
            return;
          }
        }
        animation.current = requestAnimationFrame(loop);
      };
      animation.current = requestAnimationFrame(loop);
    } catch (e) {
      stopCamera();
      setError(cameraErrorMessage(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function simulate(kind: "correct" | "incorrect" | "inconclusive") {
    const sample = info.custom?.sample_rep;
    let frames: PoseFrame[];
    if (plan.exercise === "custom") {
      if (!sample?.length) return;
      // Replay a demo rep: as recorded, at half range (each joint blended halfway
      // back toward its starting position), or poorly tracked.
      const start = sample[0].points;
      const changed = sample.map((f) => ({
        ...f,
        points: f.points.map((p, i) =>
          kind === "incorrect"
            ? {
                ...p,
                x: start[i].x + (p.x - start[i].x) * 0.5,
                y: start[i].y + (p.y - start[i].y) * 0.5,
              }
            : kind === "inconclusive"
              ? { ...p, visibility: 0.5 }
              : p,
        ),
      }));
      // Cut the rep out with the segmenter, exactly as live tracking would.
      const last = changed.at(-1)!;
      const cutter = new RepSegmenter(spec);
      frames =
        [...changed, ...[1, 2, 3].map((k) => ({ ...last, t: last.t + k * 100 }))]
          .map((f) => cutter.push(f))
          .find((r): r is PoseFrame[] => r !== null) ?? changed;
    } else {
      const angles =
        plan.exercise === "squat"
          ? kind === "incorrect"
            ? [175, 165, 145, 135, 145, 165, 175]
            : [175, 165, 130, 95, 120, 165, 175]
          : kind === "incorrect"
            ? [5, 20, 40, 55, 40, 20, 5]
            : [5, 20, 55, 90, 55, 20, 5];
      frames = angles.map((a, i) =>
        demoFrame(
          plan.exercise as BuiltinExercise,
          a,
          i * 300,
          kind === "inconclusive" ? 0.5 : 0.97,
        ),
      );
    }
    // Play the simulated movement on the gauge before judging it.
    peak.current = null;
    const step = plan.exercise === "custom" ? 70 : 160;
    for (const f of frames) {
      const a = Math.round(measureSpec(spec, f.points, f.aspect_ratio).angle);
      setLiveAngle(a);
      peak.current = further(a, peak.current);
      setPeakAngle(peak.current);
      await new Promise((resolve) => setTimeout(resolve, step));
    }
    await evaluate(frames);
  }

  return (
    <section className="session-layout">
      <div>
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR GUIDED SESSION</span>
            <h1>{info.name}</h1>
          </div>
          <button
            className="secondary"
            disabled={evaluating.current}
            onClick={async () => {
              stopCamera();
              setCamera(false);
              await onClose();
            }}
          >
            End session
          </button>
        </div>
        <div className="camera-row">
        <div className="camera-stage">
          <video
            ref={video}
            muted
            playsInline
            className={camera ? "" : "hidden"}
            aria-label="Live camera preview"
          />
          <canvas
            ref={canvas}
            width={640}
            height={480}
            className={camera ? "skeleton-overlay" : "hidden"}
            aria-label="Live pose overlay"
          />
          {!camera && (
            <div className="camera-placeholder">
              <div className="camera-symbol">◉</div>
              <h2>A little space. A little progress.</h2>
              <p>Your camera stays on this device.</p>
              <button
                className="primary"
                disabled={loading}
                onClick={() => void startCamera()}
              >
                {loading ? "Preparing camera…" : "Turn on camera"}
              </button>
            </div>
          )}
          <span className="camera-chip">
            <span className="status-dot" />{" "}
            {camera ? "On-device pose tracking" : "Camera is off"}
          </span>
          <span className="camera-bottom">
            No audio ·{" "}
            {uploadConsent
              ? "Uncertain clips are shared with your therapist"
              : "Clips stay on this device"}
          </span>
        </div>
        <MovementGauge
          movement={movement.key}
          angle={camera || demo ? liveAngle : null}
          peak={peakAngle}
        />
        </div>
        <div
          className={"feedback-banner" + (lastLabel ? " tone-" + lastLabel : "")}
          aria-live="polite"
        >
          <span className="feedback-icon" aria-hidden="true">
            {lastLabel === "correct" ? "✓" : lastLabel === "incorrect" ? "↺" : "✦"}
          </span>
          <div>
            <strong>
              {lastLabel === "correct"
                ? "Rep counted. Keep your pace."
                : lastLabel === "incorrect"
                  ? "Let’s adjust that one."
                  : lastLabel === "inconclusive"
                    ? "Sent to your therapist for a closer look."
                    : active
                      ? "You’re ready. Move at your pace."
                      : "One repetition at a time."}
            </strong>
            <p>{feedback}</p>
          </div>
          {camera && !active && userPaused && (
            <button
              className="primary"
              onClick={() => {
                paused.current = false;
                readySince.current = 0;
                setUserPaused(false);
              }}
            >
              Resume →
            </button>
          )}
          {camera && !active && !userPaused && (
            <span className="auto-start-hint">
              {holdLeft !== null
                ? "Hold still… starting in " + holdLeft
                : "Starts after all checks stay ready for 2 seconds"}
            </span>
          )}
          {active && (
            <button
              className="secondary"
              onClick={() => {
                paused.current = true;
                setUserPaused(true);
                running.current = false;
                setActive(false);
                segmenter.current.reset();
                discardTakes();
              }}
            >
              Pause
            </button>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {last && last.evaluation.label !== "correct" && (
          <div className="panel replay-panel" ref={replayPanel}>
            <div className="section-heading">
              <h3>Your last repetition</h3>
              <span className={"badge " + last.evaluation.label}>
                {last.evaluation.label === "inconclusive"
                  ? "Awaiting review"
                  : "Not counted"}
              </span>
            </div>
            <PoseReplay frames={last.frames} videoUrl={last.url} />
            <p className="replay-cue">{last.evaluation.feedback}</p>
            <p className="muted">
              {last.evaluation.label === "inconclusive"
                ? "This rep counts once your therapist accepts it."
                : "Watch the replay, then try the next rep when you are ready."}{" "}
              {Math.round(last.evaluation.confidence * 100)}% confidence ·{" "}
              {last.evaluation.model_version}
            </p>
          </div>
        )}
        <div className="panel steps-panel">
          <ExerciseSteps steps={info.steps} />
        </div>
        {demo && (
          <div className="demo-controls">
            <strong>Explore the feedback</strong>
            <span>Simulated keypoints, no camera required.</span>
            <button
              className="secondary"
              onClick={() => void simulate("correct")}
            >
              Good rep
            </button>
            <button
              className="secondary"
              onClick={() => void simulate("incorrect")}
            >
              Needs adjustment
            </button>
            <button
              className="secondary"
              onClick={() => void simulate("inconclusive")}
            >
              Uncertain rep
            </button>
          </div>
        )}
      </div>
      <aside className="session-aside">
        <div className="panel">
          <span className="eyebrow">TODAY</span>
          <div className="session-count">
            {todayCount}
            <small> / {plan.daily_target}</small>
            <span>accepted reps today</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Daily target"
            aria-valuemin={0}
            aria-valuemax={plan.daily_target}
            aria-valuenow={Math.min(todayCount, plan.daily_target)}
          >
            <span
              style={{
                width:
                  Math.min(100, (todayCount / plan.daily_target) * 100) + "%",
              }}
            />
          </div>
          <p>
            This session: {accepted} accepted · {pending} waiting for review
          </p>
          <div className="divider" />
          <h3>Make room to move</h3>
          {[
            ["body", "Body in frame"],
            ["light", "Even lighting"],
            ["distance", "Comfortable distance"],
          ].map(([key, label]) => (
            <div className="setup-check" key={key}>
              <span
                className={
                  checks[key as keyof typeof checks] ? "check-ready" : ""
                }
              >
                {checks[key as keyof typeof checks] ? "✓" : "○"}
              </span>
              {label}
              {key === "distance" && camera && !checks.distance && distanceTip && (
                <small className="check-hint">{distanceTip}</small>
              )}
            </div>
          ))}
        </div>
        {demoVideoUrl && (
          <div className="panel demo-video-panel">
            <span className="eyebrow">YOUR THERAPIST&apos;S DEMO</span>
            <TrimmedVideo
              src={demoVideoUrl}
              start={(info.custom?.demo_start_ms ?? 0) / 1000}
              end={
                info.custom?.demo_end_ms ? info.custom.demo_end_ms / 1000 : null
              }
              controls
              muted
              loop
              playsInline
              aria-label={"Demo of " + info.name}
            />
          </div>
        )}
        <div className="panel soft-panel">
          <span className="eyebrow">YOUR MOVEMENT CUE</span>
          <h3>Slow, steady, comfortable.</h3>
          <p>{plan.instructions || info.instruction}</p>
          <p className="muted">
            Current baseline: joint angles and tracking confidence. Follow your
            therapist’s prescribed range.
          </p>
        </div>
        <div className="safety-note">
          <strong>Listen to your body.</strong>
          <p>
            Stop if you feel pain. PhysioTrace supports your therapist’s care
            and does not replace it.
          </p>
        </div>
      </aside>
    </section>
  );
}
