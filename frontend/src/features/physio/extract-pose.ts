// Extract pose keypoints from a therapist's demo video, in the browser, at 10 fps.
// Only these keypoints are used for training; the video itself is kept for patients to watch.
import type { PoseFrame } from "./engine";
import { createPoseLandmarker } from "./pose-model";

export const MAX_DEMO_SECONDS = 60;
const STEP_MS = 100;

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

export async function extractDemoPose(
  url: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PoseFrame[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await once(video, "loadeddata");
  // Browser-recorded WebM often reports an Infinity duration until it is
  // seeked to the end, which makes it scan the file and learn the real length.
  if (video.duration === Infinity) {
    video.currentTime = 1e9;
    await once(video, "durationchange");
    video.currentTime = 0;
    await once(video, "seeked");
  }
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("The video length could not be read. Try another file.");
  if (duration > MAX_DEMO_SECONDS + 0.5)
    throw new Error(`Keep the demo to ${MAX_DEMO_SECONDS} seconds or less.`);
  const pose = await createPoseLandmarker();
  const frames: PoseFrame[] = [];
  try {
    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    for (let t = 0; t <= duration * 1000; t += STEP_MS) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      video.currentTime = t / 1000;
      await once(video, "seeked");
      // VIDEO mode needs strictly increasing timestamps; offset by 1 so the first is positive.
      const result = pose.detectForVideo(video, t + 1);
      const points = result.landmarks[0];
      if (points?.length === 33)
        frames.push({
          t,
          aspect_ratio: aspect,
          points: points.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            visibility: p.visibility ?? 0,
          })),
        });
      onProgress(Math.min(1, t / (duration * 1000)));
    }
  } finally {
    pose.close();
    video.removeAttribute("src");
    video.load();
  }
  if (frames.length < 20)
    throw new Error(
      "A person could not be tracked in enough of the video. Keep the whole body in view with good light.",
    );
  // The API accepts up to 600 frames (60 s at 10 fps).
  return frames.slice(0, 600);
}
