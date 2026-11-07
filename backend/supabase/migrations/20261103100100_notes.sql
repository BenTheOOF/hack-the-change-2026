create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "read own notes" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "insert own notes" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "delete own notes" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime only sends changes for tables in this publication.
alter publication supabase_realtime add table public.notes;
