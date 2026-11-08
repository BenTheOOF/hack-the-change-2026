-- Google accounts created before the profile trigger read Google's name kept the default
-- "Patient". Fill in the Google name for profiles that still have the default, now and on later
-- sign-ins. A name the person chose is never overwritten, and metadata still never grants a role.
create function public.metadata_display_name(meta jsonb) returns text
language sql immutable set search_path = ''
as $$
  select left(coalesce(
    nullif(trim(meta->>'display_name'), ''),
    nullif(trim(meta->>'full_name'), ''),
    nullif(trim(meta->>'name'), '')), 100);
$$;

update public.care_profiles p
set display_name = public.metadata_display_name(u.raw_user_meta_data)
from auth.users u
where u.id = p.id and p.display_name = 'Patient'
  and public.metadata_display_name(u.raw_user_meta_data) is not null;

-- Supabase rewrites the user's metadata on each OAuth sign-in, including linking Google later.
create function public.sync_care_profile_name() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.care_profiles
  set display_name = public.metadata_display_name(new.raw_user_meta_data)
  where id = new.id and display_name = 'Patient'
    and public.metadata_display_name(new.raw_user_meta_data) is not null;
  return new;
end;
$$;
create trigger sync_care_profile_name after update of raw_user_meta_data on auth.users
for each row execute function public.sync_care_profile_name();

revoke all on function public.sync_care_profile_name() from public, anon, authenticated;
