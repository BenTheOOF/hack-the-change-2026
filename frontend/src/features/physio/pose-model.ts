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

// Load the pinned lite pose model in VIDEO mode. Throws an error named
// PoseModelError when the browser assets are missing or fail to load.
export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  filterMediapipeInfoLogs();
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  } catch (cause) {
    const error = new Error("Pose model failed to load.", { cause });
    error.name = "PoseModelError";
    throw error;
  }
}
