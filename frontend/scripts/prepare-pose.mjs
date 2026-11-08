import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "public", "mediapipe");
await mkdir(destination, { recursive: true });
await cp(
  path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  path.join(destination, "wasm"),
  { recursive: true },
);
// The full model: more reliable than lite for floor exercises such as push-ups.
const modelPath = path.join(destination, "pose_landmarker_full.task");
try {
  const data = await readFile(modelPath);
  if (data.length < 1_000_000) throw new Error("Incomplete pose model.");
} catch {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  );
  if (!response.ok)
    throw new Error(
      "Could not download the pretrained MediaPipe pose detector: " +
        response.status,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1_000_000)
    throw new Error("The pose detector download is incomplete.");
  await writeFile(modelPath, bytes);
}
console.log("Browser pose assets are ready. No training was run.");
