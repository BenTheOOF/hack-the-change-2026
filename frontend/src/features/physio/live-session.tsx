"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  demoFrame,
  drawSkeleton,
  EXERCISES,
  measure,
  RepSegmenter,
  ruleClassifier,
  type Evaluation,
  type PoseFrame,
} from "./engine";
import { PoseReplay } from "./pose-replay";
import type { Prescription } from "./types";

type Props = {
  plan: Prescription;
  demo: boolean;
  uploadConsent: boolean;
  onRep: (
    frames: PoseFrame[],
    evaluation: Evaluation,
    clip?: Blob,
  ) => Promise<Evaluation>;
  onClose: () => Promise<void>;
};

export function LiveSession({
  plan,
  demo,
  uploadConsent,
  onRep,
  onClose,
}: Props) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null),
    detector = useRef<PoseLandmarker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]);
  const finishRecording = useRef<((blob?: Blob) => void) | null>(null);
  const animation = useRef(0),
    generation = useRef(0),
    mounted = useRef(true),
    running = useRef(false),
    evaluating = useRef(false);
  const segmenter = useRef(new RepSegmenter(plan.exercise));
  const [camera, setCamera] = useState(false),
    [loading, setLoading] = useState(false),
    [active, setActive] = useState(false);
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

  const stopRecording = (): Promise<Blob | undefined> => {
    if (!recorder.current || recorder.current.state === "inactive")
      return Promise.resolve(undefined);
    return new Promise((resolve) => {
      finishRecording.current = resolve;
      recorder.current!.stop();
    });
  };

  const startRecording = () => {
    if (
      !stream.current ||
      !window.MediaRecorder ||
      recorder.current?.state === "recording"
    )
      return;
    const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    if (!mimeType) return;
    // ponytail: recording starts at detected movement, with at most 300ms of setup omitted.
    // A future encoded-frame ring buffer can preserve exact pre-roll without storing a whole session.
    try {
      const record = new MediaRecorder(stream.current, {
        mimeType,
        videoBitsPerSecond: 700000,
      });
      chunks.current = [];
      let size = 0;
      record.ondataavailable = (event) => {
        size += event.data.size;
        if (size <= 10 * 1024 * 1024) chunks.current.push(event.data);
        else {
          chunks.current = [];
          if (record.state === "recording") record.stop();
        }
      };
      record.onstop = () => {
        const blob = chunks.current.length
          ? new Blob(chunks.current, { type: mimeType })
          : undefined;
        chunks.current = [];
        finishRecording.current?.(blob);
        finishRecording.current = null;
      };
      recorder.current = record;
      record.start(250);
    } catch {
      /* Pose-only replay still works on browsers without a usable video encoder. */
    }
  };

  const evaluate = async (frames: PoseFrame[]) => {
    if (evaluating.current) return;
    evaluating.current = true;
    running.current = false;
    setActive(false);
    try {
      const clip = await stopRecording();
      const local = ruleClassifier.classify(
        plan.exercise,
        frames,
        plan.confidence_threshold,
      );
      setFeedback(local.feedback);
      const saved = await onRep(
        frames,
        local,
        uploadConsent ? clip : undefined,
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
      } else if (saved.label === "inconclusive") setPending((n) => n + 1);
    } catch (e) {
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
    if (recorder.current?.state === "recording") recorder.current.stop();
    segmenter.current.reset();
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
      const vision = await import("@mediapipe/tasks-vision");
      const files =
        await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const pose = await vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
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
        "Find your starting position. Begin when all setup checks are ready.",
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
            if (points && ctx) {
              drawSkeleton(ctx, points, 640, 480);
              const sides = [
                [0, 11, 23, 27, 31],
                [0, 12, 24, 28, 32],
              ];
              const indices =
                plan.exercise === "squat"
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
              const height =
                Math.max(...indices.map((i) => points[i].y)) -
                Math.min(...indices.map((i) => points[i].y));
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
                distance: height > 0.35 && height < 0.9,
                light: brightness > 35 && brightness < 245,
              };
              setChecks(setup);
              if (running.current) {
                // Poor tracking during an active rep must reach the classifier as uncertainty.
                const wasActive = segmenter.current.active;
                const frames = segmenter.current.push({
                  t: now,
                  points,
                  aspect_ratio:
                    video.current.videoWidth / video.current.videoHeight,
                });
                if (!wasActive && segmenter.current.active) startRecording();
                if (wasActive && !segmenter.current.active && !frames)
                  void stopRecording();
                if (frames) void evaluate(frames);
              }
            } else {
              ctx?.clearRect(0, 0, 640, 480);
              setChecks({ body: false, distance: false, light: false });
              // Do not join movements on either side of a complete tracking loss.
              segmenter.current.reset();
              void stopRecording();
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
      setError(
        e instanceof Error
          ? e.message
          : "Camera access is unavailable. Use HTTPS or localhost and allow camera access.",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function simulate(kind: "correct" | "incorrect" | "inconclusive") {
    const angles =
      plan.exercise === "squat"
        ? kind === "incorrect"
          ? [175, 165, 145, 135, 145, 165, 175]
          : [175, 165, 130, 95, 120, 165, 175]
        : kind === "incorrect"
          ? [5, 20, 40, 55, 40, 20, 5]
          : [5, 20, 55, 90, 55, 20, 5];
    await evaluate(
      angles.map((a, i) =>
        demoFrame(
          plan.exercise,
          a,
          i * 300,
          kind === "inconclusive" ? 0.5 : 0.97,
        ),
      ),
    );
  }

  return (
    <section className="session-layout">
      <div>
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR GUIDED SESSION</span>
            <h1>{EXERCISES[plan.exercise].name}</h1>
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
            End session ↗
          </button>
        </div>
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
          <span className="camera-bottom">No audio · Private by default</span>
        </div>
        <div className="feedback-banner" aria-live="polite">
          <span className="feedback-icon">✦</span>
          <div>
            <strong>
              {active
                ? "You’re ready. Move at your pace."
                : "One repetition at a time."}
            </strong>
            <p>{feedback}</p>
          </div>
          {camera && !active && (
            <button
              className="primary"
              disabled={
                !checks.body ||
                !checks.light ||
                !checks.distance ||
                evaluating.current
              }
              onClick={() => {
                segmenter.current.reset();
                running.current = true;
                setActive(true);
                setError("");
                setFeedback(
                  "Return to your starting position between repetitions.",
                );
              }}
            >
              {last ? "Try next rep" : "Begin set"} →
            </button>
          )}
          {active && (
            <button
              className="secondary"
              onClick={() => {
                running.current = false;
                setActive(false);
                segmenter.current.reset();
                void stopRecording();
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
          <div className="panel replay-panel">
            <div className="section-heading">
              <h3>Your last repetition</h3>
              <span className={"badge " + last.evaluation.label}>
                {last.evaluation.label === "inconclusive"
                  ? "Awaiting review"
                  : "Try again"}
              </span>
            </div>
            <PoseReplay frames={last.frames} videoUrl={last.url} />
            <p>{last.evaluation.feedback}</p>
          </div>
        )}
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
          <span className="eyebrow">THIS SESSION</span>
          <div className="session-count">
            {accepted}
            <span>accepted reps</span>
          </div>
          <p>{pending} waiting for review</p>
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
            </div>
          ))}
        </div>
        <div className="panel soft-panel">
          <span className="eyebrow">YOUR MOVEMENT CUE</span>
          <h3>Slow, steady, comfortable.</h3>
          <p>{plan.instructions || EXERCISES[plan.exercise].instruction}</p>
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
