# PhysioTrace implementation proposal

## Scope

Implement the patient exercise session, daily targets and history, therapist review queue, and feedback loop for bodyweight squat and standing shoulder abduction. Use a versioned rule-based classifier. Do not train models, download training datasets, or run retraining jobs.

## Keep the starter stack

Keep Next.js App Router and TypeScript in `frontend`, FastAPI in `backend`, and Supabase for email/password authentication, PostgreSQL, and private review-clip storage. Supabase storage fills the object-storage role in AGENTS.md without introducing a second storage service or MinIO. Keep existing auth and API entry points. Add routes through the router discovery already present in `app/main.py`.

Use MediaPipe Pose Landmarker in the browser for body keypoints. Its pretrained pose detector is inference infrastructure, not a trained exercise classifier. Add its web SDK because implementing pose estimation with platform APIs alone is not practical. Use uv to pin Python 3.12, manage the virtual environment, and lock dependencies. Put CUDA-enabled PyTorch in an optional `ml` dependency group so the API deployment does not load or install the GPU stack by default.

## Patient session

1. Select a prescribed exercise and read the safety prompt.
2. Request the camera only after an explicit click. Check that the body is visible and the camera has enough light. Show the camera and a skeleton overlay.
3. Use joint angles and a per-exercise state machine to segment complete repetitions. Classify only the keypoint sequence, never raw images.
4. Route results using stored exercise thresholds: accepted correct reps count, incorrect reps show corrective feedback and a local replay, and uncertain reps wait for therapist review.
5. Keep video in a bounded memory buffer on the device. Upload an uncertain rep only after separate review-upload consent. Training consent is another independent, default-off choice. Pose-only review remains available when a clip is not uploaded.
6. Show daily progress, rep history, pending reviews, and therapist feedback. A therapist correction updates the original rep and its original exercise day exactly once.

## Data and access

Add one timestamped migration. Preserve existing migrations and enable row-level security on every new public table.

- `care_profiles`: a patient or therapist role tied to the auth user. New accounts become patients; therapist status is assigned by an administrator, never by self-selected sign-up metadata.
- `care_assignments`: a therapist-to-patient relationship established by an administrator.
- `exercise_prescriptions`: assigned exercise, daily target, date range, and confidence thresholds.
- `exercise_sessions`: patient, exercise, timestamps, and consent snapshot.
- `exercise_reps`: immutable client rep identifier, timestamps, exercise day, model version, normalized pose sequence, result, confidence, and optional private clip path.
- `rep_reviews`: one therapist label per rep, error type, feedback, and review time. A transactional database function authorizes the assigned therapist, locks the rep, records the review, and updates the rep result.
- `dataset_versions` and `dataset_examples`: explicit versioned export manifests containing only reviewed pose sequences with current training consent. No training or automatic export happens when a review is saved.

Patients read and write only their own permitted records. Therapists can read only assigned patients and label only their uncertain reps. Policies prevent patients from changing roles, therapist links, prescriptions, review outcomes, or training manifests. Private clip access uses short-lived signed URLs after authorization. Revoking training consent excludes the sample from future exports.

## API and UI

Add protected `/physio` routes for the profile, prescriptions, sessions, rep submission, daily progress, history, review queue, labels, and clip authorization. Use `Depends(get_current_user)` and the user's bearer token for Supabase queries so row-level security remains active. Keep the backend secret key in the `apikey` header only.

Keep route pages thin and place application code under `frontend/src/features/physio`. Patients see their plan and a live-session screen. Therapists see the assigned-patient review queue and an inspect/label panel. Include a clearly marked local demo that works without Supabase credentials and does not upload or claim to save clinical data.

## Verification and delivery

Use the existing pytest setup for API authorization, input limits, replay-safe rep submission, and review routing. Use Node's built-in test runner for segmentation and classifier logic rather than adding another test framework. Run frontend typecheck and build, backend tests, and a CUDA tensor smoke check without training. Document migrations, administrator setup for therapist assignments, local startup, consent behavior, and remaining live-account checks.

Implement in runnable phases: data/API foundation, patient session, therapist review/feedback, and final verification. Update the README and `docs/decisions.md` as each phase lands. Do not deploy or apply remote database migrations as part of local implementation.
