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

## 2026-11-07: therapist-defined exercises trained from a demo video

Approved by the user before implementation. Therapists add an exercise with a name, steps, camera view, and a demo video they upload or record in the app. The browser extracts pose keypoints from the video at 10 fps with the existing MediaPipe setup, so training uses keypoint sequences, never raw video, and the worker needs no video decoding or new dependencies.

Training runs in a separate Python worker (`ml/worker.py`, started with `scripts/worker.sh`), chosen by the user so the API never trains. It claims queued exercises through a service-only RPC (`for update skip locked`), fits the model, and records ready or failed with a reason the therapist sees. A worker that dies mid-fit leaves the row in `training`; the therapist resubmits (marked `ponytail:`).

The model is a template, not a neural network, because one demo video is too little data for one. The fitter picks the joint angle (elbows, shoulders, hips, knees, left/right pairs) with the largest range, derives the rest and movement edges (20% and 35% of the demo excursion), a counting band (75% to 135% of the mean demo excursion), a minimum rep time (half the demo mean, at least 0.6 s), and a 32-point time-normalized trajectory template of up to four moving joints with a tolerance of at least 15 degrees. A fit is rejected unless most demo reps pass their own model. numpy runs on the CPU here because the fit gains nothing from a GPU; the CUDA/MLX rule applies to future neural-network training.

The evaluator exists in TypeScript (live feedback) and pure Python (the API re-checks custom reps and cannot import numpy). The fitter exists in Python (worker) and TypeScript (the demo, which has no backend, and the instant "Found N reps" preview before a therapist saves). `ml/fixtures/demo_curl.json` and its expected fit are checked by both test suites so the ports cannot drift.

The engine now describes every movement with a `MovementSpec` (primary angle, direction, edges, band); the two built-ins use specs built from `RULES` and behave exactly as before. Custom prescriptions use `exercise = 'custom'` plus `custom_exercise_id`; a trigger allows only the therapist's own ready exercises. Patients see a custom exercise only once it is prescribed to them, and demo videos are served with 10-minute signed URLs.

## 2026-11-07: trim the demo video before training

Therapists can upload or record a longer video (up to 10 minutes and 50 MiB; recordings stop at 3 minutes) and choose the part used for the model with start and end handles, between 2 and 60 seconds. Only that part is analysed; demo keypoints start at 0 at the trim start. The original file is uploaded unchanged and the trim is stored as `demo_start_ms` and `demo_end_ms` (migration `20261108030000_custom_exercise_trim.sql`); every player loops between those times. This avoids re-encoding in the browser, which would be slow, lose quality, and is unavailable in Safari. The API rejects trims outside 2 to 60 seconds or keypoints that run past the trim.

## 2026-11-07: distance check from torso length; therapist sections

The "Comfortable distance" check used the vertical spread of the exercise's own joints. That shrinks during a squat, is tiny for arm-only custom exercises, and is skewed side-on, where the far side is hidden. It now uses torso length (shoulder to hip, on the clearer side, aspect-corrected) in frame heights: 0.12 to 0.34 passes, which roughly matches a standing body filling 40% to 100% of the frame and still works seated or side-on. The session shows "Move a little closer" or "Step back a little" when it fails.

The therapist workspace now has sidebar sections like the patient view: Review queue (with a count), Patients & plans (each assigned patient's current plans, from a new `prescriptions` list in the therapist overview, and the prescription form), and Your exercises. Saving a prescription shows a confirmation next to the button with the exercise, patient, target, and dates.

## 2026-11-07: keep tracking through brief misses; full pose model

Floor exercises such as push-ups lost the body often: any frame where MediaPipe found no pose reset the rep in progress and discarded its recording. A miss now keeps the rep, the last skeleton, and the gauge reading for up to 600 ms (`TRACKING_GRACE_MS`, just under the classifier's 700 ms gap limit, so a rep that survives the grace is still judged normally). A longer loss resets as before and tells the patient they went out of view mid-rep.

The browser now uses MediaPipe's full pose model instead of lite (9.4 MB instead of 5.8 MB, fetched by `npm run pose:setup`). It is more reliable for bodies that are not upright, at about twice the cost per frame, which fits within the 100 ms sampling interval. Detection, presence, and tracking confidence went from 0.6 to 0.5; per-joint visibility (`RULES.visible`) still decides what counts. The same model is used to extract keypoints from therapist demo videos.

## 2026-11-07: side-on demos follow the visible side (template-1.1.0)

A side-on push-up demo produced a target band in the wrong place and a "Body in frame" check that dropped near the floor. Three causes, reproduced with a synthetic side-on push-up fixture (`ml/fixtures/make_demo_pushup.py`, with a hidden far arm that has middling visibility and noisy guesses, as MediaPipe produces):

- The fitter scored left and right joints separately, so the hidden far limb's noisy range could drive the fit and its angles entered the movement-shape check. Side-on fits now follow the clearer side of each left/right pair frame by frame, always use the "visible" combine, and store active angles as pairs (`sideAgnostic`), measured on whichever side the camera sees better in each rep. A patient facing the other way from the demo is measured correctly.
- Rest came from the first 10 frames, so a trim that started mid-rep put the rest edge at 107 degrees instead of about 147 and moved the band; full push-ups then failed as the wrong movement. Rest is now the end of the range nearest the clip's first and last frames, taken as the median of frames dwelling there.
- "Body in frame" required joints 2% away from every edge; hands on the floor sit at the bottom edge. Joints now only need to be inside the frame.

Front-view fits are unchanged apart from the rest estimate (the curl fixture's rest edge moved by 0.3 degrees). The model version is `template-1.1.0`; older models still evaluate as before, so exercises fitted earlier need to be added again to get the fix.
