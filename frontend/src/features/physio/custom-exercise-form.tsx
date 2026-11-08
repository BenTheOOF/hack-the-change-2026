"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseFrame } from "./engine";
import { extractDemoPose, MAX_DEMO_SECONDS } from "./extract-pose";
import { fitTemplate, type TemplateModel } from "./template";

export type ExerciseSubmission = {
  name: string;
  description: string;
  steps: string[];
  view: "front" | "side";
  frames: PoseFrame[];
  video: Blob;
  // Browser preview of the fit. The worker trains the saved model; the demo uses this one.
  preview: TemplateModel;
};

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function CustomExerciseForm({
  busy,
  demo,
  onSubmit,
}: {
  busy: boolean;
  demo: boolean;
  onSubmit: (exercise: ExerciseSubmission) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [view, setView] = useState<"front" | "side">("front");
  const [video, setVideo] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  const [frames, setFrames] = useState<PoseFrame[] | null>(null);
  const [preview, setPreview] = useState<TemplateModel | null>(null);
  const [problem, setProblem] = useState("");
  const [recording, setRecording] = useState(false);
  const [camera, setCamera] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  };
  useEffect(
    () => () => {
      abort.current?.abort();
      stopCamera();
    },
    [],
  );
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  // Re-fit the preview when the camera view changes; keypoints stay the same.
  useEffect(() => {
    if (!frames) return;
    try {
      setPreview(fitTemplate(frames, view));
      setProblem("");
    } catch (e) {
      setPreview(null);
      setProblem(e instanceof Error ? e.message : "The demo could not be analysed.");
    }
  }, [frames, view]);

  async function analyseVideo(blob: Blob) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setVideo(blob);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setFrames(null);
    setPreview(null);
    setProblem("");
    setProgress(0);
    try {
      setFrames(await extractDemoPose(url, setProgress, controller.signal));
    } catch (e) {
      if (controller.signal.aborted) return;
      setProblem(
        e instanceof Error && e.name === "PoseModelError"
          ? "The pose tracker could not load. Run `npm run pose:setup` in frontend, then reload."
          : e instanceof Error
            ? e.message
            : "The video could not be analysed.",
      );
    } finally {
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  async function openCamera() {
    setProblem("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("The camera only works over HTTPS or on localhost.");
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      setCamera(true);
      requestAnimationFrame(() => {
        if (live.current && stream.current) {
          live.current.srcObject = stream.current;
          void live.current.play();
        }
      });
    } catch (e) {
      setProblem(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site, or upload a video instead."
          : e instanceof Error
            ? e.message
            : "The camera could not start.",
      );
    }
  }

  function startRecording() {
    if (!stream.current) return;
    const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    if (!mimeType) {
      setProblem("This browser cannot record video. Upload a file instead.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, { mimeType, videoBitsPerSecond: 1_500_000 });
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      stopCamera();
      void analyseVideo(new Blob(chunks, { type: mimeType.split(";")[0] }));
    };
    recorder.current = rec;
    rec.start(500);
    setRecording(true);
    setSeconds(0);
    const started = Date.now();
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (rec.state !== "recording") clearInterval(tick);
      else if (s >= MAX_DEMO_SECONDS) {
        clearInterval(tick);
        rec.stop();
      }
    }, 250);
  }

  const ready = !!name.trim() && !!video && !!frames && !!preview && progress === null;
  return (
    <form
      className="custom-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || !video || !frames || !preview) return;
        const ok = await onSubmit({
          name: name.trim(),
          description: description.trim(),
          steps: steps
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 10),
          view,
          frames,
          video,
          preview,
        });
        if (ok) {
          setName("");
          setDescription("");
          setSteps("");
          setVideo(null);
          setVideoUrl(undefined);
          setFrames(null);
          setPreview(null);
        }
      }}
    >
      <div className="custom-fields">
        <label>
          Exercise name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="Seated elbow curl" />
        </label>
        <label>
          Short description
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What the patient should feel or focus on" />
        </label>
        <label>
          Steps, one per line
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} maxLength={2000} placeholder={"Sit tall with your back supported\nBend the elbow slowly\nLower with control"} />
        </label>
        <fieldset className="view-choice">
          <legend>Camera view in the demo</legend>
          <label>
            <input type="radio" name="view" checked={view === "front"} onChange={() => setView("front")} />
            Facing the camera
          </label>
          <label>
            <input type="radio" name="view" checked={view === "side"} onChange={() => setView("side")} />
            Side-on
          </label>
        </fieldset>
      </div>
      <div className="custom-video">
        <span className="field-label">Demo video (up to {MAX_DEMO_SECONDS} s, 2 or more reps)</span>
        {camera ? (
          <div className="record-box">
            <video ref={live} muted playsInline aria-label="Camera preview for the demo" />
            <div className="record-actions">
              {recording ? (
                <button type="button" className="primary" onClick={() => recorder.current?.stop()}>
                  ■ Stop recording ({seconds}s)
                </button>
              ) : (
                <button type="button" className="primary" onClick={startRecording}>
                  ● Start recording
                </button>
              )}
              {!recording && (
                <button type="button" className="secondary" onClick={stopCamera}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : videoUrl ? (
          <video className="demo-preview" src={videoUrl} controls muted playsInline aria-label="Selected demo video" />
        ) : (
          <div className="video-empty">
            <p>Start and end in the resting position. Do 3 or more slow reps with the whole movement in view.</p>
          </div>
        )}
        {!camera && (
          <div className="video-actions">
            <label className="secondary file-button">
              Upload video
              <input
                type="file"
                accept={VIDEO_TYPES.join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (!VIDEO_TYPES.includes(file.type)) {
                    setProblem("Choose an MP4, WebM, or MOV video.");
                    return;
                  }
                  if (file.size > 50 * 1024 * 1024) {
                    setProblem("Demo videos must be at most 50 MB.");
                    return;
                  }
                  void analyseVideo(file);
                }}
              />
            </label>
            <button type="button" className="secondary" onClick={() => void openCamera()}>
              Record with camera
            </button>
          </div>
        )}
        {progress !== null && (
          <div className="analyse-progress" role="status">
            <span>Reading the movement… {Math.round(progress * 100)}%</span>
            <div className="progress-track">
              <span style={{ width: progress * 100 + "%" }} />
            </div>
          </div>
        )}
        {preview && (
          <p className="fit-preview" role="status">
            ✓ Found {preview.demoReps} reps. Main joint:{" "}
            {jointName(preview)}. {demo ? "Ready to save." : "The trainer will build the model after you save."}
          </p>
        )}
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
      </div>
      <button className="primary custom-submit" disabled={busy || !ready}>
        {demo ? "Save and train exercise →" : "Save and send for training →"}
      </button>
    </form>
  );
}

function jointName(model: TemplateModel) {
  const names: Record<number, string> = { 13: "elbow", 14: "elbow", 11: "shoulder", 12: "shoulder", 23: "hip", 24: "hip", 25: "knee", 26: "knee" };
  const joint = names[model.spec.joints[0][1]] ?? "joint";
  return model.spec.combine === "left" ? "left " + joint : model.spec.combine === "right" ? "right " + joint : joint + "s";
}

export function trainingStatusLabel(status: string) {
  return { queued: "Queued for training", training: "Training…", ready: "Ready", failed: "Training failed" }[status] ?? status;
}

