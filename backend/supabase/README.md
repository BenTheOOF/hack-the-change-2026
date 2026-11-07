# supabase

The database schema, kept as SQL files. The hosted Supabase project is built from these files, so a change that is not in git does not exist for the rest of the team.

Run the Supabase CLI from `backend/`, the folder that contains this one. The CLI looks for `supabase/` upward from where you run it. From the repo root, pass `--workdir backend` instead.

## What is in here

```
migrations/   SQL files that run in filename order. Names start with a timestamp.
config.toml   Settings for the optional local stack (npx supabase start). Hosted projects ignore it.
```

The four migrations that ship:

1. `profiles`: a profile row for every new user, created by a trigger.
2. `notes`: the notes table, with realtime switched on.
3. `ai_usage`: the per-user daily counter for `/ai/chat`.
4. `storage`: the private `uploads` bucket and its folder rules.

## Add a table

1. From `backend/`, run `npx supabase migration new <short_name>`. It creates a file here with the current timestamp.
2. Write the SQL. A table that users read and write needs row-level security, or anyone can read it:

   ```sql
   create table public.todos (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
     title text not null
   );

   alter table public.todos enable row level security;

   create policy "own todos" on public.todos
     for all to authenticated
     using ((select auth.uid()) = user_id)
     with check ((select auth.uid()) = user_id);
   ```

3. Add this line if other tabs should see inserts live:

   ```sql
   alter publication supabase_realtime add table public.todos;
   ```

4. Commit the file. After it merges to `main`, one person runs `npx supabase db push --remote` from `backend/`.

## Rules

- Never edit a migration that is already on `main`. Add a new file that changes it.
- Do not change tables, policies or buckets by hand in the dashboard. The next `db push` will not know about the change.
- Two people creating migrations at the same time is fine. Timestamps keep the files apart.
- `db push` without `--remote` targets a local database, not your hosted project.

## Local stack

If you have Docker, run `npx supabase start` from `backend/`. It starts a private copy of Supabase on your machine and applies these migrations. Put the URL and keys it prints into your `.env`. `npx supabase stop` shuts it down.
