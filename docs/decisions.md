# Design decisions

## 2026-11-07: implement PhysioTrace on the existing starter

The user approved `docs/architecture.md`. Keep the Next.js, FastAPI, and Supabase stack. Use private Supabase storage in place of introducing MinIO. Existing email/password auth remains the identity boundary. Application roles are assigned by database administrators; sign-up metadata cannot grant therapist access.

The browser runs MediaPipe Pose Landmarker and a versioned rule-based exercise classifier. The backend repeats the deterministic keypoint checks before recording a rep. Only the backend can call the service-only recording function. Reads and therapist review calls use the patient's or therapist's verified bearer token so PostgreSQL RLS applies. The secret key appears only in the backend `apikey` header.

The API router discovery already in `app/main.py` loads the new feature routes. That entry point is unchanged.

## 2026-11-07: consent and review semantics

Pose sequences and results are care records. Video stays in a bounded browser memory buffer unless an uncertain repetition is uploaded with review consent. Recording is video-only, capped at 10 MiB per rep. A recording started when movement was detected, so it missed the start of the rep (superseded below). Pose-only replay remains available.

Review-upload consent and future-training consent are separate and default off. A session snapshots consent. Upload checks the current consent again after storage completes; a concurrent revocation rejects attachment and removes that new upload. Revoking review consent hides prior clips; an already issued signed URL expires within 60 seconds. Revoking training consent removes dataset memberships and opts prior reps out permanently. A later opt-in applies only to newly recorded eligible reps.

Review is one transaction with a row lock and a unique rep label. A correct label changes the original record, preserving its exercise day in the patient's chosen timezone. Counting queries read that record directly, so reviews cannot increment a counter twice. Unique patient/client rep identifiers make network retries safe.

## 2026-11-07: no training in this implementation

Use uv-managed Python 3.12.16 and a committed lockfile. CUDA 12.8 PyTorch and NumPy live in the optional `ml` group. The API does not import either package. Dataset version and membership tables support an explicit future offline export; labeling a rep does not create a dataset or start training.

The initial rule ranges are prototype defaults for the two MVP movements, not validated clinical assessments. Confidence thresholds can be prescribed; the fixed range checks need therapist validation before clinical use. No public rehabilitation dataset or raw exercise footage was downloaded.

## 2026-11-07: CUDA or MLX for offline ML

The offline `ml` group installs one accelerator stack per platform: CUDA 12.8 PyTorch on Windows and Linux, and MLX on Apple Silicon macOS. PyTorch is no longer installed on macOS, because CPU or MPS torch is not a target. `backend/check_accelerator.py` picks CUDA first, then MLX, and exits non-zero when neither is usable, so a CPU-only environment is reported instead of silently used. Future training code should import `pick_accelerator()` from that module rather than probing devices itself. The API still imports neither package.

## 2026-11-07: frontend legibility and rep result feedback

Patients may read the screen from a distance during exercise, so the minimum text size was raised (most labels went from 8 to 10 px and 10 px text went to 12 px) and the font stack now starts with the platform UI font. The live session shows the latest rep result in a tinted banner, and an incorrect or uncertain rep scrolls its replay into view, matching the "pause and replay the last rep" routing rule. The session side panel shows today's accepted reps against the prescribed target. Arrows that looked like links on non-interactive cards were removed.

## 2026-11-07: recalibrate the rule baseline (rules-1.1.0)

Real sessions sent most good reps to review or marked them not counted. Confidence was the raw MediaPipe visibility of the weakest joint, compared against 0.8, and the lite pose model often reports 0.6 to 0.85 for knees and ankles that are clearly in frame. Confidence is now `(visibility - 0.3) / 0.4`, clamped to 0..1, so 0.7 visibility is fully trusted, 0.62 meets the default 0.8 threshold, and 0.5 still goes to review. Prescribed thresholds and the database default are unchanged. The single-frame drop-out cap moved from 0.35 to 0.2 visibility and the frame-gap cap from 500 to 700 ms. Segmentation gates on visibility 0.5, MediaPipe's own visible cut-off.

Ranges were widened for rehabilitation patients: squat knee angle at the bottom 50 to 130 degrees (was 55 to 115), standing at 155 or more (was 160); shoulder abduction peak 70 to 130 degrees (was 75 to 115), rest at 35 or less (was 30), asymmetry limit 35 degrees (was 30); minimum rep time 1.0 s (was 1.2 s). Browser and backend share the same constants and the version is now `rules-1.1.0`. These are still prototype defaults that need therapist validation.

Training from YouTube videos was requested and declined. The project rules forbid scraping YouTube or other websites, and downloading its videos breaks its terms. Calibration data should come from licensed rehab datasets (UI-PRMD, KIMORE after a license check), the team's own recorded reps, or therapist-accepted reps from patients with training consent.

## 2026-11-07: automatic start and visible instructions

Tracking starts on its own once body-in-frame, lighting, and distance checks have held for 2 s (1.5 s at first), replacing the Begin set button. After an incorrect or uncertain rep it waits 3 s for the replay, then resumes when the checks hold again. Pause stops automatic restarts until the patient presses Resume. Step-by-step instructions for each exercise appear on the Today page cards and below the camera in the session.

## 2026-11-07: rep videos for the therapist and in patient history

Every rep the camera records is now kept on the patient's device in IndexedDB (newest 60 clips), and the history page plays it with the skeleton overlay. This is local storage, not an upload, so it stays within "video stays on the device". If the browser blocks storage, history falls back to the pose replay.

The therapist review plays the real video first, with a toggle for the skeleton overlay. Uploading a clip to the therapist still requires the patient's review-sharing consent, as required by the project rules; without it the therapist sees the pose replay and a note saying no video was shared. The session screen states which mode is active. In the demo, where nothing leaves the browser, the therapist view plays the local clip of a camera-recorded rep. A patient's history also plays clips they shared from another device, through the existing signed-URL route.

## 2026-11-07: demo data survives refreshes

The demo's reps, therapist reviews, and privacy choices are saved in the browser's localStorage under `physiotrace-demo-v1`, and demo clips use the same on-device clip store as real sessions. Nothing is sent to the server. A "Clear demo data" button in the demo banner, behind a confirmation, removes the saved state and the demo clips. Saving waits until the restore has rendered, so React's development double effects cannot overwrite saved data with the empty starting state. If storage is blocked or full, the demo keeps working in memory.

## 2026-11-07: rep clips start before the movement

Clips used to start when the segmenter detected movement, about 30 degrees into a squat, plus encoder start-up time, and stopped the instant the patient was back at rest. While tracking waits at rest, the session now keeps two staggered recordings and restarts the older one every 3 s; when movement starts it keeps the older one, so each clip has 1.5 to 3 s of lead-in. Recording continues for 0.5 s after the return to rest.

The segmenter keeps up to 3 s of resting pose before a rep, and the saved pose sequence is trimmed to start where the video starts so the skeleton overlay lines up with it. Both classifiers first drop lead-in frames beyond the two resting frames before movement, which is what the segmenter always supplied, so the lead-in never changes duration, tempo, or labels. The 15 s abort now counts from movement start. Sequences stay within the 180-frame and 20 s limits.

## 2026-11-07: movement gauge beside the camera

A vertical gauge next to the camera shows the live knee angle (squat, filling downward) or arm angle (shoulder abduction, filling upward), the counting range as a striped target band, and a marker for the furthest point of the current rep, with a cue such as "Go a little lower" or "Good depth. Stand up slowly". `movementProgress` in `engine.ts` derives the band from the same `RULES` the classifier uses, so the gauge and the label always agree. The reading is shown only when tracking visibility is at least 0.5. Demo reps animate the gauge before they are judged. On phones the camera's idle text is shortened so the camera and gauge fit side by side.
