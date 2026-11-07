# Hackathon starter

A Next.js web app (Vercel), a FastAPI API (Fly.io) and a Supabase project, already connected. Follow the sections below from top to bottom.
At the end you have it running locally and deployed.

## Layout

```
frontend/           Next.js 16 web app. Deployed to Vercel.
backend/            FastAPI API. Deployed to Fly.
backend/supabase/   Database migrations. Run the Supabase CLI from backend/.
scripts/            dev.sh, push-env and the worktree scripts. Run them from the repo root.
docs/               OWNERSHIP.md lists who works in which folder.
.env                Not in git. One file for both sides, in the repo root.
```

`frontend/README.md` and `backend/README.md` have the setup and run steps for each side on its own. Before you change code, read `CONTEXT.md` and `.coding-standards`.

## Prerequisites

1. Install Node.js 20.9 or newer from nodejs.org. Check: `node -v` prints `v20.9.0` or higher.
2. Install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`. Check: `uv --version`.
3. Install git. Check: `git --version`.
4. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`. Check: `fly version`.
5. Install the Vercel CLI: `npm i -g vercel`. Check: `vercel --version`.
6. Make accounts at Supabase, Fly.io, Vercel and the Anthropic Console. Fly asks for a card.

## Create the Supabase project

1. In the Supabase dashboard click New project. Choose a name, a region and a database password. Save the password.
2. Wait until the project is ready. Expected: the project dashboard opens.
3. Note the project ref, the text between `https://` and `.supabase.co` in the project URL.
4. Open Project Settings, then API Keys. Expected: a publishable key (`sb_publishable_...`) and a secret key (`sb_secret_...`). Keep the tab open.

## Fill in .env

1. In the repo root, copy `.env.example` to `.env` with `cp .env.example .env`. If you have no `.env.example`, create `.env` with the names in the table below.
2. Fill in these values:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Connect button at the top of the dashboard shows it.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Project Settings, API Keys, publishable key.
   - `SUPABASE_SECRET_KEY`: Project Settings, API Keys, secret key.
   - `ANTHROPIC_API_KEY`: create one in the Anthropic Console. You can leave it empty for now.
   - `LLM_MODEL`: copy a model id from the provider docs. You can leave it empty for now.
3. Leave the rest as it is. Expected: only the two LLM lines may be empty.

`.env` is the only env file in the repo and it is git-ignored.

| Name | Read by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | frontend, backend | Your project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | frontend, backend | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | backend only | `sb_secret_...`. Never sent to the browser. |
| `CORS_ORIGINS` | backend | Comma-separated page origins. Locally `http://localhost:3000`. |
| `NEXT_PUBLIC_API_URL` | frontend | Locally `http://127.0.0.1:8000`. |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | backend | Empty is fine. `/ai/chat` then returns 503. |
| `LLM_MAX_TOKENS` | backend | Defaults to 512. |
| `API_PORT`, `WEB_PORT` | `scripts/dev.sh`, `scripts/worktree.sh` | Default 8000 and 3000. Keep both lines in `.env`: `worktree.sh` only rewrites lines that exist. |

## Apply migrations

Run the Supabase CLI from `backend/`, the folder that contains `supabase/`. The CLI looks for `supabase/` upward from where you run it, so it will not find it from the repo root.

1. Run `cd backend`, then `npx supabase login`. Expected: the CLI says you are logged in.
2. Run `npx supabase link --project-ref YOUR_PROJECT_REF` and enter the database password. Expected: the CLI says the project is linked.
3. Run `npx supabase db push --remote` and answer `y`. Without `--remote` the command targets a local database. Expected: four migration files are applied with no errors.
4. In the dashboard open Table Editor. Expected: `profiles`, `notes` and `ai_usage`. Open Storage. Expected: a private bucket named `uploads`.

## Disable email confirmation for the hackathon

1. In the dashboard open Authentication, then Sign In / Providers, then Email.
2. Turn off Confirm email and save. The label can differ slightly between dashboard versions.
3. Expected: a new user can sign up and reach the dashboard without opening an email.

## Run locally

Both sides together:

1. In the repo root run `./scripts/dev.sh`. Expected: the first run installs dependencies, then uvicorn starts on port 8000 and Next.js on port 3000.
2. Open `http://localhost:3000`. Expected: a home page with Sign up, Log in and Dashboard links.
3. Press Ctrl+C to stop both servers.

One side at a time: `frontend/README.md` and `backend/README.md` list the commands. The dashboard shows "Could not reach the API" if you start only the frontend.

## Checklist: confirm every feature works

Run `./scripts/dev.sh`, then go through these in order.

1. Open `http://127.0.0.1:8000/health`. Expected: `{"status":"ok"}`.
2. Open `http://localhost:3000/dashboard` while signed out. Expected: you land on `/login`.
3. Go to `/signup`, enter an email and a password of 6 or more characters, and submit. Expected: you land on `/dashboard`.
4. Read the line "API says". Expected: JSON with your user id and email.
5. In Supabase open Table Editor, then `profiles`. Expected: one row with your email.
6. Open the dashboard in two browser tabs and add a note in one. Expected: it appears in the other within a couple of seconds.
7. Send a message under "Ask the LLM". Expected: a reply. If you left the LLM values empty, expected: a message asking you to set `ANTHROPIC_API_KEY` and `LLM_MODEL`.
8. Click Files, choose a small file and click Upload. Expected: its name appears in the list.
9. Click Log out, then open `/dashboard`. Expected: you land on `/login`.
10. Run `cd backend && uv run pytest`. Expected: `1 passed`.
11. Run `cd frontend && npm run typecheck`. Expected: no output after the `tsc --noEmit` line.

## Deploy the API to Fly

1. Run `fly auth login`. Expected: you are logged in.
2. Run `fly apps create YOUR-API-NAME`. Expected: the CLI confirms the app exists.
3. In `backend/fly.toml` replace `CHANGE-ME` with that name.
4. From the repo root run `scripts/push-env fly`. Expected: Fly lists the imported secrets.
5. Run `cd backend && fly deploy`. Expected: the build finishes and a machine starts.
6. Run `curl https://YOUR-API-NAME.fly.dev/health`. Expected: `{"status":"ok"}`. The first call after a quiet period takes a few seconds while the machine wakes.

## Deploy the web app to Vercel

1. Run `vercel login`. Expected: you are logged in.
2. Run `cd frontend && vercel link` and create a new project. Expected: a `.vercel` folder appears in `frontend`.
3. From the repo root run `scripts/push-env vercel https://YOUR-API-NAME.fly.dev`. Expected: three production variables are added.
4. Run `cd frontend && vercel --prod`. Expected: the CLI prints your production URL.
5. From the repo root run `scripts/push-env fly https://YOUR-PROJECT.vercel.app` with that URL. Expected: Fly updates `CORS_ORIGINS` and restarts.
6. Open the Vercel URL and sign up. Expected: the dashboard shows the "API says" line.

If you connect the git repo to Vercel instead of using the CLI, set Root Directory to `frontend`.

## Set the Supabase Site URL and redirect URLs

1. In the dashboard open Authentication, then URL Configuration.
2. Set Site URL to your Vercel production URL.
3. Under Redirect URLs add `https://YOUR-PROJECT.vercel.app/**` and `http://localhost:*/**`. If the second pattern does not match in your project, add each local port, for example `http://localhost:3001/**`.
4. Save. Expected: both entries are listed.

## The 4-person workflow

1. One person pushes the repo to GitHub: `git init && git add -A && git commit -m "Starter" && git push`. Everyone else clones it.
2. Share the filled-in `.env` privately. Never commit it.
3. From the main checkout each person runs `scripts/worktree.sh <name>`. Expected: a folder `../<repo>-<name>` on branch `feat/<name>`, with its own ports (3001 and 8001 for the first, 3002 and 8002 for the next), a matching API URL, and dependencies installed.
4. In that folder run `./scripts/dev.sh`.
5. After the branch merges, run `scripts/worktree-remove.sh <name>` from the main checkout.
6. Fill in the real names in `docs/OWNERSHIP.md`. Touch shared files only in small PRs, and rebase before merging.

Everyone shares one hosted Supabase project. Change the schema only through git:

1. From `backend/`, run `npx supabase migration new <short_name>` and write the SQL in the file it creates.
2. Commit it. After it merges to `main`, one person runs `npx supabase db push --remote` from `backend/`.
3. Do not edit tables, policies or buckets by hand in the dashboard.

Optional local database, with Docker installed: from `backend/`, run `npx supabase start`, copy the URL and keys it prints into your `.env`, and run `npx supabase stop` when you are done.

## Swap Supabase projects or backends

To use a new Supabase project:

1. Replace the three `SUPABASE` values in `.env`.
2. From `backend/`, run `npx supabase link --project-ref NEW_REF`, then `npx supabase db push --remote`.
3. From the repo root run `scripts/push-env fly https://YOUR-PROJECT.vercel.app`, then `scripts/push-env vercel https://YOUR-API-NAME.fly.dev`, then `cd frontend && vercel --prod`.

To use a different backend:

1. Set `NEXT_PUBLIC_API_URL` in `.env` for local work.
2. Run `scripts/push-env vercel https://NEW-BACKEND-URL`, then `cd frontend && vercel --prod`.
3. Add the web URL to the new backend's allowed origins.

## Troubleshooting

CORS errors in the browser console:

1. Check that `CORS_ORIGINS` holds the exact page origin, including `https://` or the port.
2. For the deployed app run `scripts/push-env fly https://YOUR-PROJECT.vercel.app` again.
3. Locally, edit `.env` and restart `./scripts/dev.sh`.

Redirect loops, or being sent back to `/login`:

1. Make sure email confirmation is off. With it on, sign-up creates no session.
2. Clear cookies for the site and sign in again.
3. Check that the Supabase URL and publishable key in `.env` come from the same project.
4. On Vercel, redeploy after changing a variable. Values are fixed at build time.

401 from the API:

1. `Missing bearer token`: sign out and back in.
2. `Invalid or expired token`: the API's Supabase URL and publishable key must match the project that issued the token. Check the Fly names with `fly secrets list -c backend/fly.toml`.
3. "Could not reach the API" on the dashboard: `NEXT_PUBLIC_API_URL` must use the same port as `API_PORT`.

Other:

1. `/ai/chat` returns 503: set `ANTHROPIC_API_KEY` and `LLM_MODEL`, and push them to Fly.
2. `/ai/chat` returns 429: the daily limit of 20 is used up. It is `DAILY_LIMIT` in `backend/app/routers/ai.py`.
3. Notes do not appear live: confirm `notes` is listed under Database, Publications, `supabase_realtime`, and that both tabs are signed in as the same user.

## Cost notes

1. Supabase pauses free projects after a period of inactivity. If the app stops working after a quiet week, open the dashboard and restore the project.
2. Vercel Hobby is for non-commercial use.
3. Fly needs a card on file. This setup uses one shared-cpu-1x machine with 256MB that stops when idle.
4. The LLM provider bills per token. `LLM_MAX_TOKENS` and the daily limit cap the spend per user.

## Tools we skipped

- Coolify: a self-hosted deploy platform. Vercel and Fly already cover that, and it needs a server you maintain.
- n8n: workflow automation. A FastAPI router does the same job in code.
- PocketBase: a backend with its own database and auth, which overlaps with Supabase.
- Appwrite: a backend with auth, database and storage, which overlaps with Supabase.
