-- Therapist-defined exercises. A therapist submits demo pose keypoints (extracted in the
-- browser) and a demo video; the offline worker (ml/worker.py) fits a template model.
-- Training never runs in the API or on labels.
create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.care_profiles(id),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 2000),
  steps text[] not null default '{}' check (cardinality(steps) <= 10),
  view text not null check (view in ('front', 'side')),
  demo_frames jsonb not null check (jsonb_typeof(demo_frames) = 'array' and jsonb_array_length(demo_frames) between 20 and 600),
  demo_video_path text,
  status text not null default 'queued' check (status in ('queued', 'training', 'ready', 'failed')),
  status_detail text check (length(status_detail) <= 500),
  model jsonb,
  model_version text check (length(model_version) <= 40),
  created_at timestamptz not null default now(),
  trained_at timestamptz,
  check (status <> 'ready' or model is not null)
);
create index custom_exercises_queue on public.custom_exercises(created_at) where status = 'queued';

alter table public.exercise_prescriptions add column custom_exercise_id uuid references public.custom_exercises(id);
alter table public.exercise_prescriptions drop constraint exercise_prescriptions_exercise_check;
alter table public.exercise_prescriptions add constraint exercise_prescriptions_exercise_check
  check (exercise in ('squat', 'shoulder_abduction', 'custom'));
alter table public.exercise_prescriptions add constraint exercise_prescriptions_custom_check
  check ((exercise = 'custom') = (custom_exercise_id is not null));
alter table public.exercise_reps drop constraint exercise_reps_exercise_check;
alter table public.exercise_reps add constraint exercise_reps_exercise_check
  check (exercise in ('squat', 'shoulder_abduction', 'custom'));

-- A therapist may prescribe only their own exercise, and only once its model is ready.
create function public.check_custom_prescription() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.custom_exercise_id is not null and not exists (
    select 1 from public.custom_exercises c
    where c.id = new.custom_exercise_id and c.therapist_id = new.therapist_id and c.status = 'ready'
  ) then
    raise exception 'Prescribe one of your own exercises after its model is ready' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger check_custom_prescription before insert or update on public.exercise_prescriptions
for each row execute function public.check_custom_prescription();

alter table public.custom_exercises enable row level security;
create policy custom_exercise_read on public.custom_exercises for select to authenticated
  using (
    therapist_id = auth.uid()
    or exists (select 1 from public.exercise_prescriptions p
      where p.custom_exercise_id = custom_exercises.id and p.patient_id = auth.uid())
  );
create policy custom_exercise_create on public.custom_exercises for insert to authenticated
  with check (
    therapist_id = auth.uid() and status = 'queued' and model is null and model_version is null
    and status_detail is null and trained_at is null and demo_video_path is null
    and exists (select 1 from public.care_profiles p where p.id = auth.uid() and p.role = 'therapist')
  );
create policy custom_exercise_service on public.custom_exercises for all to service_role using (true) with check (true);
revoke all on public.custom_exercises from anon, authenticated;
grant select, insert on public.custom_exercises to authenticated;
grant all on public.custom_exercises to service_role;

-- Worker queue: claim the oldest queued exercise without double-processing.
create function public.claim_custom_exercise() returns setof public.custom_exercises
language sql security definer set search_path = ''
as $$
  update public.custom_exercises set status = 'training'
  where id = (
    select id from public.custom_exercises where status = 'queued'
    order by created_at limit 1 for update skip locked
  )
  returning *;
$$;

create function public.finish_custom_exercise(p_id uuid, p_model jsonb, p_version text, p_error text)
returns public.custom_exercises
language plpgsql security definer set search_path = ''
as $$
declare row public.custom_exercises;
begin
  update public.custom_exercises set
    status = case when p_model is null then 'failed' else 'ready' end,
    model = p_model, model_version = p_version, status_detail = left(p_error, 500), trained_at = now()
  where id = p_id and status = 'training'
  returning * into row;
  if not found then raise exception 'Exercise is not being trained'; end if;
  return row;
end;
$$;

-- Attaching the demo video happens through the API after its upload succeeds.
create function public.attach_exercise_video(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.custom_exercises set demo_video_path = p_path
  where id = p_id and therapist_id = auth.uid() and p_path like auth.uid()::text || '/' || p_id::text || '/%';
  if not found then raise exception 'Exercise unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.check_custom_prescription() from public, anon, authenticated;
revoke all on function public.claim_custom_exercise(), public.finish_custom_exercise(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_custom_exercise(), public.finish_custom_exercise(uuid, jsonb, text, text)
  to service_role;
revoke all on function public.attach_exercise_video(uuid, text) from public, anon;
grant execute on function public.attach_exercise_video(uuid, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('exercise-demos', 'exercise-demos', false, 52428800, array['video/webm', 'video/mp4', 'video/quicktime']);
-- No browser storage policy: the API authorizes uploads and signed reads.
