# PhysioTrace

AI vision app for physiotherapy patients. It watches a patient do a prescribed
exercise through their camera and judges each rep as correct or incorrect, with
real-time feedback. Low-confidence reps go to the patient's physical therapist
(PT) for review. The PT's labels are used to improve the model.

## Roles
- **Patient**: does exercises, gets live feedback, sees rep history and PT feedback.
- **PT**: reviews flagged clips, labels them, sends feedback to patients.

## Tech stack
- Front end (patient + PT): React + TypeScript web app, desktop and mobile browsers
- Pose estimation: MediaPipe Pose Landmarker, run **in the browser**
- Backend: Python, FastAPI
- Database: PostgreSQL
- Clip storage: existing private Supabase Storage (approved implementation choice)
- ML: Python, offline training only. Accelerator is CUDA PyTorch (Windows/Linux) or MLX (Apple Silicon), never CPU-only torch

## Repo layout
<!-- Update as the project grows -->
- `frontend/`: React app (patient session UI, PT dashboard)
- `backend/`: FastAPI app (API, auth, review queue, rep logs)
- `ml/`: data pipeline, rep segmentation, classifiers, training scripts
- `docs/`: architecture notes and decisions

## Commands
<!-- Fill in once set up -->
- Frontend dev: `cd frontend && npm run dev`, or `scripts/frontend.ps1` on Windows
- Backend dev: `cd backend && uv run uvicorn app.main:app --reload`, or `scripts/backend.ps1` on Windows
- ML accelerator check: `cd backend && uv sync --group ml && uv run --group ml python check_accelerator.py`
- Custom-exercise trainer: `scripts/worker.sh` (or `scripts/worker.ps1`); runs `ml/worker.py`, which fits queued therapist exercises offline
- Tests: `cd frontend && npm test && npm run typecheck`; `cd backend && uv run pytest`
- Build: `cd frontend && npm run build`; browser assets: `npm run pose:setup` (runs automatically before dev and build)

## Core architecture
Classify **pose keypoint sequences**, never raw video frames:
1. MediaPipe extracts body keypoints from each frame.
2. A per-exercise state machine splits the stream into reps using joint-angle thresholds.
3. A per-exercise classifier returns `{label: correct | incorrect, error_type, confidence}`.
4. Configurable confidence thresholds route each rep:
   - high-confidence **correct**: count it and log it (timestamp, exercise, confidence, model version)
   - high-confidence **incorrect**: pause counting, replay the last rep with skeleton
     overlay and corrective feedback, wait for the next rep
   - **inconclusive**: save the clip to the PT review queue; don't count it until reviewed

All classifiers implement one shared interface. The first one is a
**rule-based baseline** (joint-angle ranges). ML models replace it later
without changes elsewhere.

## Patient features
- Live camera feed with skeleton overlay, plus setup checks (full body in frame, lighting, distance)
- Rep evaluation and routing (above)
- Daily rep count vs. prescribed target, history, PT feedback feed

## PT features
- Review queue of low-confidence clips for each patient, played back with skeleton overlay
- Label each clip correct or incorrect; if incorrect, add an error type and written feedback
- Labelled clips and feedback show up in the patient's feed. A clip relabelled as correct counts toward that day's reps.
- Labelled clips go into a **versioned training dataset**

## Training data
- Sources: public rehab datasets with correct/incorrect labels (e.g. UI-PRMD,
  KIMORE; check licenses), our own recorded examples including deliberately
  incorrect reps, and PT-labelled clips.
- Every source goes through one pipeline that outputs normalized keypoint sequences segmented into reps.
- Retraining is an offline job that outputs a new versioned model. It never runs on each new label.

## Rules
- **Never** build scrapers for YouTube or other websites.
- **Never** upload raw video by default. Video stays on the device. Only clips flagged for review get uploaded, and only with the patient's consent.
- A patient's clips are used for training **only** with separate, explicit training consent.
- Role-based access: a PT can only see their own patients.
- Show a clear disclaimer that the app supports PT care and doesn't replace it, plus a "stop if you feel pain" prompt.
- Keep ML out of the request path. The backend serves models; it doesn't train them.

## Working conventions
- Build in small phases. Each phase must be runnable, with tests and a README update.
- For architectural changes, propose first and wait for approval.
- Ask before adding major dependencies.
- Record significant design decisions in `docs/decisions.md`.

## MVP scope
- 1–2 exercises: bodyweight squat, standing shoulder abduction
- Rule-based classifier + confidence routing
- Patient live session + PT review queue + feedback loop
- Email/password and Google auth with patient and PT roles, plus admins

## Current status
<!-- Update as phases complete -->
- Phase 0: architecture and data proposal approved by the user.
- Phase 1: care schema, RLS, and protected API implemented.
- Phase 2: browser pose session, baseline classifier, history, and daily targets implemented.
- Phase 3: assigned therapist queue, prescriptions, review corrections, and feedback implemented.
- Phase 4 (2026-11-07): offline ML accelerator is CUDA PyTorch (Windows/Linux) or MLX (Apple Silicon) via the optional uv `ml` group; `backend/check_accelerator.py` verifies it with no CPU fallback. MLX verified on an Apple GPU.
- Phase 4 frontend polish: larger minimum type and system font stack, live-session result banner (counted / adjust / sent for review), incorrect-rep replay scrolls into view, daily target progress inside the session, flag reason shown to the therapist, decorative arrows removed.
- Phase 5 (2026-11-07): rule baseline recalibrated to `rules-1.1.0` (visibility-based confidence rescaled, wider rehab ranges) in both browser and backend; tracking auto-starts when setup checks hold; step-by-step instructions on the Today page and in the session.
- Phase 6 (2026-11-07): therapist review plays the real rep video (skeleton overlay toggle) when the patient shares clips; patients rewatch every rep's video in history from on-device IndexedDB storage; auto-start hold is 2 s with a countdown.
- Demo data persists in this browser across refreshes (localStorage plus on-device clips) until "Clear demo data" is used.
- Rep clips include 1.5 to 3 s of lead-in and 0.5 s after the rep; the saved pose is aligned to the video and classification ignores the extra lead-in.
- Live session has a movement gauge beside the camera (target band from the classifier rules, peak marker, cue).
- Phase 7 (2026-11-07): therapists add their own exercises with an uploaded or recorded demo video. Pose keypoints are extracted in the browser; the offline worker (`ml/worker.py`) fits a template model (`template-1.0.0`) and marks it ready; the API re-checks custom reps with it. Migration `20261108020000_custom_exercises.sql`. The demo fits in the browser with the TypeScript port.
- Demo videos can be trimmed before training (start/end stored with the exercise; players loop that part).
- Distance setup check uses torso length (works facing the camera, side-on, and seated); therapist workspace has Review queue, Patients & plans, and Your exercises sections; prescriptions confirm inline.
- Pose tracking uses MediaPipe's full model (better for push-ups and floor work) and keeps a rep through misses of up to 600 ms.
- Template fits `template-1.1.0`: side-on demos follow the visible side and match patients facing either way; rest is found from both ends of the clip.
- Sign-in: email/password or Google (Supabase OAuth). Admin accounts (`is_admin`) manage roles, admins, and assignments from an Admin tab and can open both views for their own data; the first admin comes from `ADMIN_EMAILS` (Google-verified only) or `backend/supabase/admin-grant.sql`.
- Neural-network training: intentionally not run. No YouTube or scraped data (see `docs/decisions.md`).
