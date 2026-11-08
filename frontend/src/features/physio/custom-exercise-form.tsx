"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseFrame } from "./engine";
import { extractDemoPose, MAX_SOURCE_SECONDS, readDuration } from "./extract-pose";
import { fitTemplate, type TemplateModel } from "./template";
import { TrimmedVideo } from "./trimmed-video";
import { Icon } from "@/features/ui/icons";
import { clampTrim, formatTime, MAX_DEMO_SECONDS, type Trim } from "./trim";

export type ExerciseSubmission = {
  name: string;
  description: string;
  steps: string[];
  view: "front" | "side";
  frames: PoseFrame[];
  video: Blob;
  // The part of the video the model was trained on, in seconds.
  trim: Trim;
  // Browser preview of the fit. The worker trains the saved model; the demo uses this one.
  preview: TemplateModel;
};

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
// Recordings can run longer than the part used; the therapist trims afterwards.
const MAX_RECORD_SECONDS = 180;

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
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 });
  const [playhead, setPlayhead] = useState(0);
  const previewVideo = useRef<HTMLVideoElement>(null);
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

  async function chooseVideo(blob: Blob) {
    abort.current?.abort();
    setVideo(blob);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setFrames(null);
    setPreview(null);
    setProblem("");
    setDuration(0);
    try {
      const length = await readDuration(url);
      if (length > MAX_SOURCE_SECONDS + 1)
        throw new Error(`Choose a video of ${MAX_SOURCE_SECONDS / 60} minutes or less, then trim it.`);
      setDuration(length);
      setTrim(clampTrim({ start: 0, end: Math.min(length, MAX_DEMO_SECONDS) }, length));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The video could not be read.");
    }
  }

  // Moving either edge clears the previous analysis, since it covered another part.
  function moveTrim(edge: "start" | "end", value: number) {
    setTrim((current) => clampTrim({ ...current, [edge]: value }, duration, edge));
    setFrames(null);
    setPreview(null);
    setProblem("");
    if (previewVideo.current) previewVideo.current.currentTime = value;
  }

  async function analyse() {
    if (!videoUrl) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFrames(null);
    setPreview(null);
    setProblem("");
    setProgress(0);
    try {
      setFrames(await extractDemoPose(videoUrl, trim, setProgress, controller.signal));
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
      void chooseVideo(new Blob(chunks, { type: mimeType.split(";")[0] }));
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
      else if (s >= MAX_RECORD_SECONDS) {
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
          trim,
          preview,
        });
        if (ok) {
          setName("");
          setDescription("");
          setSteps("");
          setVideo(null);
          setVideoUrl(undefined);
          setDuration(0);
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
        <span className="field-label">
          Demo video: upload or record, then keep the part with 2 or more reps (up to {MAX_DEMO_SECONDS} s)
        </span>
        {camera ? (
          <div className="record-box">
            <video ref={live} muted playsInline aria-label="Camera preview for the demo" />
            <div className="record-actions">
              {recording ? (
                <button type="button" className="primary" onClick={() => recorder.current?.stop()}>
                  Stop recording ({seconds}s)
                </button>
              ) : (
                <button type="button" className="primary" onClick={startRecording}>
                  Start recording
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
          <>
            <TrimmedVideo
              ref={previewVideo}
              className="demo-preview"
              src={videoUrl}
              start={trim.start}
              end={duration ? trim.end : null}
              controls
              muted
              loop
              playsInline
              onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
              aria-label="Selected demo video, playing the chosen part"
            />
            {duration > 0 && (
              <div className="trim-editor">
                <div className="trim-track" aria-hidden="true">
                  <span
                    className="trim-selection"
                    style={{
                      left: (trim.start / duration) * 100 + "%",
                      width: ((trim.end - trim.start) / duration) * 100 + "%",
                    }}
                  />
                  <span className="trim-playhead" style={{ left: (playhead / duration) * 100 + "%" }} />
                </div>
                {(["start", "end"] as const).map((edge) => (
                  <div className="trim-row" key={edge}>
                    <label>
                      {edge === "start" ? "Start" : "End"}
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={trim[edge]}
                        onChange={(e) => moveTrim(edge, Number(e.target.value))}
                        aria-valuetext={formatTime(trim[edge])}
                      />
                    </label>
                    <output>{formatTime(trim[edge])}</output>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => moveTrim(edge, playhead)}
                    >
                      Use current frame
                    </button>
                  </div>
                ))}
                <p className="muted">
                  Using {(trim.end - trim.start).toFixed(1)} s of {formatTime(duration)}. Start and end the part at rest.
                </p>
                <button
                  type="button"
                  className="secondary"
                  disabled={progress !== null}
                  onClick={() => void analyse()}
                >
                  {frames ? "Analyse again" : "Analyse this part"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="video-empty">
            <p>Do 3 or more slow reps with the whole movement in view. You can trim the video after choosing it.</p>
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
                  void chooseVideo(file);
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
            <Icon name="check" size={18} /> Found {preview.demoReps} reps. Main joint:{" "}
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
        {demo ? "Save and train exercise" : "Save and send for training"}
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

