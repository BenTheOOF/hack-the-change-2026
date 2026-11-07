# Context

Read this before changing anything. Rules for changes are in `.coding-standards`.

## What this repo is

A starter for a four-person hackathon team. Sign-in, a database, file storage, realtime and an LLM endpoint are wired up. Teams replace the example pages with their own idea.

## Stack

| Part | Choice | Where |
|---|---|---|
| Web | Next.js 16, App Router, TypeScript, `@supabase/ssr` | `frontend`, deployed to Vercel Hobby |
| API | FastAPI, uv | `backend`, deployed to Fly (one 256MB machine, stops when idle) |
| Data | Supabase: Postgres, Auth, Storage, Realtime | `backend/supabase/` |
| Auth | Email and password only | |
| LLM | Anthropic Messages API, called from the API only | `backend/app/routers/ai.py` |

Coolify, n8n, PocketBase and Appwrite were left out on purpose because they overlap with Supabase, Vercel and Fly.

## How the pieces connect

1. The browser signs in with Supabase. The session lives in cookies.
2. `frontend/src/proxy.ts` refreshes the session on each request and sends signed-out visitors from `/dashboard` to `/login`.
3. Pages that need the API send the Supabase access token as a bearer token.
4. `get_current_user` in `backend/app/auth.py` checks that token by calling Supabase `/auth/v1/user`. The API holds no JWT secret.
5. `POST /ai/chat` counts a request through the `increment_ai_usage` database function (secret key, `apikey` header), then calls the LLM.
6. Notes use Supabase realtime. The `notes` table is in the `supabase_realtime` publication.
7. Files live in the private `uploads` bucket at `<user id>/<file name>`.

## Decisions and traps

- There is one env file, at the repo root. `frontend/next.config.ts` loads it with `process.loadEnvFile`. `backend/app/config.py` loads it with pydantic-settings. Fly and Vercel use real environment variables.
- Key names are the current Supabase ones: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) and `SUPABASE_SECRET_KEY` (`sb_secret_...`). Do not use `anon` or `service_role`.
- Next.js 16 calls the middleware file `proxy.ts`. On Next.js 15 or older it is `middleware.ts`.
- Use `getClaims()` to check a session on the server. Do not use `getSession()` for that.
- `.env` uses `127.0.0.1` for the API, because Node can resolve `localhost` to IPv6 and miss it.
- `LLM_MODEL` is empty on purpose. Copy a current model id from the provider docs. Do not invent one. The `anthropic-version` header value is in `ai.py`.
- Email confirmation is off for the hackathon. With it on, sign-up returns no session and the user goes back to `/login`.
- `frontend/AGENTS.md` is git-ignored.
- The Supabase CLI looks for `supabase/` upward from the folder you run it in, so run it from `backend/`. `supabase db push` targets a local database unless you pass `--remote`.
- `backend/supabase/config.toml` only matters for `supabase start`.
- `@types/react-dom` is not installed because nothing imports `react-dom`. Add it as a dev dependency if you start to.

## What was run and what was not

Run after the split into `frontend/` and `backend/`: `npm ci`, `npm run typecheck` and `npm run build` in `frontend`; `uv sync`, `uv sync --frozen --no-dev` and `uv run pytest` in `backend`; `./scripts/dev.sh` with placeholder env values, then `/health`, the 401 on `/me`, the CORS preflight, the `/` page and the `/dashboard` redirect; `scripts/worktree.sh` and `scripts/worktree-remove.sh`; `npx supabase migration new` from `backend/`.

Not run, because they need live accounts or Docker: sign-up and login, row-level security, realtime, storage, the daily limit, `/ai/chat`, the Docker build, Fly and Vercel deploys, `push-env`, and `supabase login`, `link` and `db push`.
