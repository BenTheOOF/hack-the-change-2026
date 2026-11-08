# Implementation verification

Verified locally on 2026-11-07. No training was run and no connected database was modified.

- Frontend strict typecheck passed.
- Three Node tests passed for squat segmentation, shoulder segmentation, confidence routing, incomplete reps, and camera aspect-ratio correction.
- The production Next.js build passed.
- Seven pytest tests passed. The installed Starlette version emits a deprecation warning for its existing httpx test-client adapter.
- The new migration executed in disposable PostgreSQL through PGlite. Checks passed for row-level security, self-promotion denial, assigned-therapist visibility, rep idempotency, one-time review correction, original-day preservation, and training-consent revocation.
- The running API returned 200 for health and its rule-model manifest, 401 for unauthenticated care access, and the expected CORS origin for the local frontend.
- The browser demo passed the patient exercise flow, correct and uncertain rep routing, therapist review, corrected patient totals, and feedback display.
- Desktop and 390-pixel mobile layouts were inspected. Mobile privacy choices are accessible, and closing an unsaved consent change preserves the prior saved choice.
- Browser pose WASM files and the pinned pretrained lite pose detector were prepared locally.
- uv-managed Python 3.12.16 is installed. PyTorch 2.11.0+cu128 and NumPy are installed in the optional ML group. A tensor multiplication passed on CPU. Fresh checks still reported cuda_available false, including after the user enabled CUDA. NVIDIA-SMI reported insufficient permissions, so GPU execution could not be verified from this session.

Live Supabase sign-up/sign-in, the Storage HTTP service, actual camera capture, and GPU execution still require verification in the configured environment. The privacy-safe demo does not prove those integrations. A camera permission prompt was not accepted during automated testing. A direct PyTorch CUDA initialization returned: No CUDA GPUs are available.

## 2026-11-07 follow-up on macOS (Apple Silicon)

- `uv lock` resolved the platform-split `ml` group. `uv sync --group ml` installed MLX 0.32.4 and mlx-metal. `uv run --group ml python check_accelerator.py` ran the matrix multiply on `Device(gpu, 0)` through MLX. CUDA was not available on this machine and was not re-tested.
- `uv run --group ml pytest`: 7 passed.
- Frontend `npm run typecheck`, `npm test` (3 passed), and `npm run build` passed on Node 22.
- Camera fix: the ignored `public/mediapipe/` assets had never been generated, so pose tracking failed after camera permission. `predev` and `prebuild` now run `pose:setup`. In the browser, the local WASM and lite pose model loaded and `PoseLandmarker.detectForVideo` ran. Blocked, missing, busy, and insecure-origin camera cases now show plain instructions. A live camera feed was not tested because the in-app browser blocks camera access.
- rules-1.1.0: new Node and pytest cases show a 120 degree squat and a 72 degree shoulder raise at 0.7 visibility now count, where rules-1.0.0 sent them to review. A pure `autoStart` helper is tested for the 1.5 s hold and the 3 s replay pause. Auto-start with a live camera was not tested because the in-app browser blocks camera access.
- The demo was checked at 1440 px and 375 px: correct, incorrect, and uncertain simulated reps, the replay auto-scroll, today's target in the session panel, and the therapist flag reason. No horizontal overflow at 375 px. No console errors.

The local Git metadata was initially empty. Main-branch history was recovered from the connected repository without overwriting implementation files. Work is on feat/physiotrace. Nothing was pushed or deployed.
