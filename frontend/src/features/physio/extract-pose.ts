// Extract pose keypoints from a therapist's demo video, in the browser, at 10 fps.
// Only these keypoints are used for training; the video itself is kept for patients to watch.
import type { PoseFrame } from "./engine";
import { createPoseLandmarker } from "./pose-model";
import { MAX_DEMO_SECONDS, type Trim } from "./trim";

const STEP_MS = 100;
// The source can be longer than the part used for the model.
export const MAX_SOURCE_SECONDS = 600;

function once(target: HTMLVideoElement, event: string, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The video stopped responding while it was analyzed.")),
      timeoutMs,
    );
    const done = () => {
      clearTimeout(timer);
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "This browser cannot play the video. Try an MP4 (H.264) or WebM file.",
        ),
      );
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

// Browser-recorded WebM often reports an Infinity duration until it is
// seeked to the end, which makes it scan the file and learn the real length.
export async function resolveDuration(video: HTMLVideoElement) {
  if (video.duration === Infinity) {
    video.currentTime = 1e9;
    await once(video, "durationchange");
    video.currentTime = 0;
    await once(video, "seeked");
  }
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("The video length could not be read. Try another file.");
  return duration;
}

// Load a video only to read its length (used before the therapist trims it).
export async function readDuration(url: string) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = url;
  try {
    await once(video, "loadeddata");
    return await resolveDuration(video);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

// Extract keypoints from the trimmed part only. Frame times start at 0 at trim.start.
export async function extractDemoPose(
  url: string,
  trim: Trim,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PoseFrame[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await once(video, "loadeddata");
  const duration = await resolveDuration(video);
  const startMs = Math.max(0, trim.start * 1000);
  const endMs = Math.min(duration, trim.end) * 1000;
  if (endMs - startMs > MAX_DEMO_SECONDS * 1000 + 50)
    throw new Error(`Choose a part of ${MAX_DEMO_SECONDS} seconds or less.`);
  const pose = await createPoseLandmarker();
  const frames: PoseFrame[] = [];
  try {
    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    for (let t = startMs; t <= endMs; t += STEP_MS) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      video.currentTime = t / 1000;
      await once(video, "seeked");
      // VIDEO mode needs strictly increasing timestamps; offset by 1 so the first is positive.
      const result = pose.detectForVideo(video, t + 1);
      const points = result.landmarks[0];
      if (points?.length === 33)
        frames.push({
          t: Math.round(t - startMs),
          aspect_ratio: aspect,
          points: points.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            visibility: p.visibility ?? 0,
          })),
        });
      onProgress(Math.min(1, (t - startMs) / Math.max(1, endMs - startMs)));
    }
  } finally {
    pose.close();
    video.removeAttribute("src");
    video.load();
  }
  if (frames.length < 20)
    throw new Error(
      "A person could not be tracked in enough of the selected part. Keep the whole body in view with good light.",
    );
  // The API accepts up to 600 frames (60 s at 10 fps).
  return frames.slice(0, 600);
}
