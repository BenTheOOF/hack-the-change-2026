// Shared MediaPipe Pose Landmarker loading for live sessions and demo-video analysis.
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

// MediaPipe's WASM runtime prints glog INFO lines (for example "INFO: Created
// TensorFlow Lite XNNPACK delegate for CPU.") through console.error, which the
// Next.js dev overlay reports as errors. Drop only those INFO lines.
// ponytail: tasks-vision has no log-level option; remove this if it gains one.
let mediapipeLogFilter = false;
function filterMediapipeInfoLogs() {
  if (mediapipeLogFilter) return;
  mediapipeLogFilter = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO: ")) return;
    original(...args);
  };
}

// The "full" model tracks bodies that are not upright (push-ups, floor work)
// much more reliably than "lite", at roughly twice the cost per frame; at
// 10 fps that is fine on laptops and recent phones.
export const POSE_MODEL = "/mediapipe/pose_landmarker_full.task";

// Load the pinned pose model in VIDEO mode. Throws an error named
// PoseModelError when the browser assets are missing or fail to load.
export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  filterMediapipeInfoLogs();
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: POSE_MODEL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      // Looser than the 0.6 used before: horizontal bodies score lower, and
      // per-joint visibility still gates what counts (RULES.visible).
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (cause) {
    const error = new Error("Pose model failed to load.", { cause });
    error.name = "PoseModelError";
    throw error;
  }
}
