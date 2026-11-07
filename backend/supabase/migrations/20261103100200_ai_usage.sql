-- Requests per user per UTC day, used by POST /ai/chat.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

-- No policies on purpose: only the API (secret key) touches this table.
alter table public.ai_usage enable row level security;

-- Adds one request for today and returns the new total. One statement, so it is safe under concurrent calls.
create function public.increment_ai_usage(p_user uuid) returns int
language sql security definer set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count;
$$;

revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid) to service_role;
