# frontend

The Next.js 16 web app (App Router, TypeScript). It talks to Supabase directly for auth, notes and files, and to the FastAPI app in `backend` for `/me` and `/ai/chat`.

## Setup and run

You need Node.js 20.9 or newer and the `.env` file in the repo root. The root README explains how to fill it in. This app reads it through `next.config.ts`, so do not create a second env file here.

1. Run `cd frontend`, then `npm ci`.
2. Run `npm run dev`. The app is on `http://localhost:3000`. To use another port, run `PORT=3001 npm run dev`.

The dashboard calls the API, so start the backend too. From the repo root, `./scripts/dev.sh` starts both. With only the frontend running, the dashboard shows "Could not reach the API".

Commands, all run in this folder:

1. `npm run dev` starts the dev server.
2. `npm run typecheck` checks types.
3. `npm run build` builds for production. It does not need `.env`.

There are no frontend tests.

## What is in here

```
src/app/              Pages. A folder with a page.tsx is a URL.
src/features/<name>/  The code behind each page: components, server actions.
src/lib/supabase/     The three Supabase clients and the session refresh. Rarely edited.
src/lib/api.ts        apiFetch(), the helper that calls FastAPI with the user's token.
src/proxy.ts          Runs on every request. Refreshes the session and guards /dashboard.
next.config.ts        Loads the root .env.
```

Pages in `src/app` stay thin. They fetch data and render a component from `src/features`.

## Add a page

1. Create `src/app/<name>/page.tsx` that exports a default component.
2. Open `http://localhost:3000/<name>`.

Put it under `src/app/dashboard/` and it requires a login with no extra work, because `src/lib/supabase/proxy.ts` guards everything that starts with `/dashboard`.

## Add a feature

1. Create `src/features/<feature>/`.
2. Put components there. Add `"use client"` at the top of a file that uses state, effects or the browser Supabase client.
3. Import the component into a page. `src/features/notes/notes.tsx` is the smallest working example.

Stay inside your own `src/features/<feature>/` folder and nobody else's edits collide with yours.

## Read or write data

- In a client component: `createClient()` from `@/lib/supabase/client`.
- In a server component, server action or route handler: `await createClient()` from `@/lib/supabase/server`.
- Row-level security decides what each user can see, so you do not filter by user id in the query.

## Call the API

In a server component, call `apiFetch("/your-route", accessToken)`. See `src/app/dashboard/page.tsx`. In a client component, copy the `fetch` in `src/features/ai/chat.tsx`. The browser call goes through CORS, so the page's origin must be in `CORS_ORIGINS`.

## Add an environment variable

1. Add it to the root `.env.example` and your `.env`.
2. Read it with `process.env.NAME`. Browser code can only read names that start with `NEXT_PUBLIC_`.
3. Add it to `scripts/push-env` so Vercel gets it.

## Deploy

The root README has the Vercel steps. In short: `vercel link` and `vercel --prod` run from this folder, and a git-connected Vercel project needs Root Directory set to `frontend`.
