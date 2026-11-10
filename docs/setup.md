# Setup

The short version is in the [README](../README.md#run-it-locally). This page covers the rest: environment variables, Supabase, Google sign-in, admins, the exercise trainer, the AI assistant, and the optional ML accelerator.

## Requirements

- Node.js 24
- [uv](https://docs.astral.sh/uv/). It installs the Python version pinned in `backend/.python-version` (3.12.16).
- Supabase is optional. The landing page and `/demo` run without it.

Keep exactly one `.env`, at the repository root. `frontend/next.config.ts` and `backend/app/config.py` both read it. Do not create another one inside `frontend/` or `backend/`.

## First run

macOS or Linux:

```bash
cp -n .env.example .env
./scripts/dev.sh
```

`scripts/dev.sh` installs dependencies if they're missing, then starts the API on port 8000 and the web app on port 3000. Ctrl+C stops both. It won't start while an earlier run still holds either port.

Windows (PowerShell), at the repository root. Install the frontend once:

```powershell
npm ci --prefix frontend
```

Then run these in two terminals:

```powershell
.\scripts\backend.ps1
```

```powershell
.\scripts\frontend.ps1
```

`backend.ps1` copies `.env.example` to `.env` if there is no `.env` yet, runs `uv sync` the first time, and serves the API on 127.0.0.1:8000. `frontend.ps1` runs the Next.js dev server on 127.0.0.1:3000.

`npm run dev` and `npm run build` first run `npm run pose:setup`. That step copies the MediaPipe WASM runtime out of `node_modules` and downloads the pinned pose model (about 9 MB) from Google into the git-ignored `frontend/public/mediapipe/`. It downloads no training data and trains nothing. Run it again if you change the `@mediapipe/tasks-vision` version.

### Camera

Browsers expose the camera only over HTTPS or on localhost, and only after the person allows it. If you open the dev server from a phone at the LAN address over plain HTTP, the camera stays off. The built-in browsers in some editors block the camera, so test live sessions in Chrome, Edge, Safari, or Firefox. `/demo` has simulated good, incorrect, and uncertain reps that work with no camera at all.

## Environment variables

Every variable is documented in [`.env.example`](../.env.example). The main ones:

| Variable | Read by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and Next.js server | Supabase project and publishable key |
| `SUPABASE_SECRET_KEY` | API only | secret key, sent in the `apikey` header and never to the browser |
| `NEXT_PUBLIC_API_URL` | browser | FastAPI address. Use `127.0.0.1`, not `localhost`. |
| `CORS_ORIGINS` | API | browser origins the API accepts |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MAX_TOKENS` | API only | the "Ask PhysioTrace" assistant |
| `ADMIN_EMAILS` | API only | Google-verified emails that become admins on first sign-in |

To get a new variable onto Fly and Vercel, add it to `.env.example`, then to the code that reads it, then to `scripts/push-env`.

## Connect Supabase

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in the root `.env`. Keep these key names.
2. Apply the migrations in `backend/supabase/migrations/` with the Supabase CLI, run from `backend/`. Nothing is applied automatically.
3. Sign up a patient account and a therapist account, by email or with Google. Every new account starts as a patient. Roles are never taken from sign-up metadata.
4. Make yourself an admin (see below). Then open `/dashboard`, and in the Admin tab set the therapist role and assign the patient to the therapist. If you have no admin yet, `backend/supabase/admin-care.sql` grants a role and an assignment directly with database access.
5. The therapist signs in at `/dashboard` and prescribes an exercise with a date range, daily target, confidence threshold, and movement cue. The patient sees the plan after a refresh.

### Google sign-in

1. In Google Cloud, create a Web application OAuth client with the redirect URI `https://<your-project>.supabase.co/auth/v1/callback`.
2. In Supabase, open Authentication > Providers > Google, turn it on, and paste in the client ID and secret.
3. In Authentication > URL Configuration, add `http://localhost:3000/auth/callback` and your deployed `/auth/callback` URL.

Google accounts start as patients and take their name from Google. With a local `supabase start`, enable the `[auth.external.google]` block in `backend/supabase/config.toml` instead.

### Admins

Admins work in the Admin tab. They set each account to patient or therapist, promote or demote admins (the last admin can't be removed), and assign or unassign patients. They can open the Therapist and Patient views for their own relationships. They get no access to other patients' reps, clips, or feedback.

To create the first admin, put your email in `ADMIN_EMAILS` and sign in with Google. Only Google-verified emails count: email confirmation is off, so anyone could register your address with a password. For an admin who signs in by password, run `backend/supabase/admin-grant.sql` with database access.

## Therapist-defined exercises

A therapist adds an exercise from the workspace with an uploaded or recorded demo video, then trims it to a section of 2 to 60 seconds that contains two or more reps and starts and ends at rest. The browser extracts pose keypoints from that section. The offline worker fits the model:

```bash
scripts/worker.sh
```

On Windows, run `scripts\worker.ps1`. The worker reads the root `.env`, checks for queued exercises every 5 seconds, and marks each one Ready, or Failed with a reason the therapist sees. Ready exercises can be prescribed like the built-in ones. The demo needs no worker, because it fits the model in the browser right away.

## Ask PhysioTrace assistant

Signed-in patients and therapists can open "Ask PhysioTrace" in the sidebar with general questions about technique, camera setup, and the app. Therapists get their own system prompt that covers the review queue, prescriptions, custom exercises, and coaching cues. The API calls any OpenAI-compatible Chat Completions provider (Gemini by default) through `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`, with a limit of 20 questions per person per day. Only the typed conversation goes to the provider. Plans, reps, feedback, and video are never sent. With `LLM_MODEL` empty, `/ai/chat` answers 503.

## Optional ML accelerator

No model has been trained. This group exists for future offline training:

```bash
cd backend
uv sync --group ml
uv run --group ml python check_accelerator.py
```

| Platform | Stack | Device |
| --- | --- | --- |
| Windows, Linux | PyTorch from the CUDA 12.8 index | `cuda` |
| macOS on Apple Silicon | MLX | Apple GPU through Metal |

`check_accelerator.py` tries CUDA, then MLX, and exits non-zero when neither works. There is no CPU fallback. The API and the production image don't need this group. `uv run pytest` syncs only the default groups, so use `uv run --group ml pytest` to keep an installed accelerator environment.

## Deploying

Vercel (frontend) and Fly (API) deploy from `main`. To deploy to your own server and domain, follow [deployment.md](deployment.md).
