# Design decisions

## 2026-11-07: implement PhysioTrace on the existing starter

The user approved `docs/architecture.md`. Keep the Next.js, FastAPI, and Supabase stack. Use private Supabase storage in place of introducing MinIO. Existing email/password auth remains the identity boundary. Application roles are assigned by database administrators; sign-up metadata cannot grant therapist access.

The browser runs MediaPipe Pose Landmarker and a versioned rule-based exercise classifier. The backend repeats the deterministic keypoint checks before recording a rep. Only the backend can call the service-only recording function. Reads and therapist review calls use the patient's or therapist's verified bearer token so PostgreSQL RLS applies. The secret key appears only in the backend `apikey` header.

The API router discovery already in `app/main.py` loads the new feature routes. That entry point is unchanged.

## 2026-11-07: consent and review semantics

Pose sequences and results are care records. Video stays in a bounded browser memory buffer unless an uncertain repetition is uploaded with review consent. Recording is video-only, capped at 10 MiB per rep. A recording starts when movement is detected, so it can omit up to 300 ms of preparation. Pose-only replay remains available.

Review-upload consent and future-training consent are separate and default off. A session snapshots consent. Upload checks the current consent again after storage completes; a concurrent revocation rejects attachment and removes that new upload. Revoking review consent hides prior clips; an already issued signed URL expires within 60 seconds. Revoking training consent removes dataset memberships and opts prior reps out permanently. A later opt-in applies only to newly recorded eligible reps.

Review is one transaction with a row lock and a unique rep label. A correct label changes the original record, preserving its exercise day in the patient's chosen timezone. Counting queries read that record directly, so reviews cannot increment a counter twice. Unique patient/client rep identifiers make network retries safe.

## 2026-11-07: no training in this implementation

Use uv-managed Python 3.12.16 and a committed lockfile. CUDA 12.8 PyTorch and NumPy live in the optional `ml` group. The API does not import either package. Dataset version and membership tables support an explicit future offline export; labeling a rep does not create a dataset or start training.

The initial rule ranges are prototype defaults for the two MVP movements, not validated clinical assessments. Confidence thresholds can be prescribed; the fixed range checks need therapist validation before clinical use. No public rehabilitation dataset or raw exercise footage was downloaded.

## 2026-11-07: CUDA or MLX for offline ML

The offline `ml` group installs one accelerator stack per platform: CUDA 12.8 PyTorch on Windows and Linux, and MLX on Apple Silicon macOS. PyTorch is no longer installed on macOS, because CPU or MPS torch is not a target. `backend/check_accelerator.py` picks CUDA first, then MLX, and exits non-zero when neither is usable, so a CPU-only environment is reported instead of silently used. Future training code should import `pick_accelerator()` from that module rather than probing devices itself. The API still imports neither package.

## 2026-11-07: frontend legibility and rep result feedback

Patients may read the screen from a distance during exercise, so the minimum text size was raised (most labels went from 8 to 10 px and 10 px text went to 12 px) and the font stack now starts with the platform UI font. The live session shows the latest rep result in a tinted banner, and an incorrect or uncertain rep scrolls its replay into view, matching the "pause and replay the last rep" routing rule. The session side panel shows today's accepted reps against the prescribed target. Arrows that looked like links on non-interactive cards were removed.
