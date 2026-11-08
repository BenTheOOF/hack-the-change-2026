-- PhysioTrace keeps patient data behind RLS and clinical writes behind narrow RPCs.
create table public.care_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Patient' check (length(display_name) <= 100),
  role text not null default 'patient' check (role in ('patient', 'therapist')),
  review_consent boolean not null default false,
  training_consent boolean not null default false,
  consent_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.care_assignments (
  therapist_id uuid not null references public.care_profiles(id),
  patient_id uuid not null references public.care_profiles(id),
  primary key (therapist_id, patient_id),
  check (therapist_id <> patient_id)
);

create function public.is_assigned_therapist(p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_assignments a join public.care_profiles p on p.id = a.therapist_id
    where a.patient_id = p_patient and a.therapist_id = auth.uid() and p.role = 'therapist'
  );
$$;

create function public.can_view_care(p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() = p_patient or public.is_assigned_therapist(p_patient);
$$;

create function public.create_care_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Role metadata is deliberately ignored. Only administrators assign therapist roles.
  insert into public.care_profiles(id, display_name)
    values(new.id, left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Patient'), 100));
  return new;
end;
$$;
create trigger create_care_profile after insert on auth.users
for each row execute function public.create_care_profile();
insert into public.care_profiles(id) select id from auth.users on conflict do nothing;

create table public.exercise_prescriptions (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.care_profiles(id),
  patient_id uuid not null references public.care_profiles(id),
  exercise text not null check (exercise in ('squat', 'shoulder_abduction')),
  daily_target integer not null check (daily_target between 1 and 200),
  instructions text not null default '' check (length(instructions) <= 2000),
  confidence_threshold double precision not null default 0.8 check (confidence_threshold between 0.6 and 0.99),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on between starts_on and starts_on + 366)
);

create table public.exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_profiles(id),
  prescription_id uuid not null references public.exercise_prescriptions(id),
  timezone text not null check (length(timezone) <= 80),
  review_consent boolean not null default false,
  training_consent boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create table public.exercise_reps (
  id uuid primary key default gen_random_uuid(),
  client_rep_id uuid not null,
  session_id uuid not null references public.exercise_sessions(id),
  patient_id uuid not null references public.care_profiles(id),
  prescription_id uuid not null references public.exercise_prescriptions(id),
  exercise text not null check (exercise in ('squat', 'shoulder_abduction')),
  exercise_day date not null,
  label text not null check (label in ('correct', 'incorrect', 'inconclusive')),
  original_label text not null check (original_label in ('correct', 'incorrect', 'inconclusive')),
  error_type text,
  confidence double precision not null check (confidence between 0 and 1),
  feedback text not null,
  model_version text not null,
  frames jsonb not null check (jsonb_typeof(frames) = 'array' and jsonb_array_length(frames) between 6 and 180),
  clip_path text,
  training_consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (patient_id, client_rep_id)
);
create index exercise_reps_patient_day on public.exercise_reps(patient_id, exercise_day);
create index exercise_reps_review_queue on public.exercise_reps(patient_id, created_at) where label = 'inconclusive';

create table public.rep_reviews (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null unique references public.exercise_reps(id),
  patient_id uuid not null references public.care_profiles(id),
  therapist_id uuid not null references public.care_profiles(id),
  label text not null check (label in ('correct', 'incorrect')),
  error_type text,
  feedback text not null check (length(trim(feedback)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (label = 'correct' or error_type is not null)
);

create table public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  created_at timestamptz not null default now(),
  notes text not null default ''
);
create table public.dataset_examples (
  dataset_id uuid not null references public.dataset_versions(id),
  rep_id uuid not null references public.exercise_reps(id),
  review_id uuid not null references public.rep_reviews(id),
  primary key (dataset_id, rep_id)
);

alter table public.care_profiles enable row level security;
alter table public.care_assignments enable row level security;
alter table public.exercise_prescriptions enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.exercise_reps enable row level security;
alter table public.rep_reviews enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.dataset_examples enable row level security;

create policy care_profile_read on public.care_profiles for select to authenticated
  using (public.can_view_care(id));
create policy care_assignment_read on public.care_assignments for select to authenticated
  using (patient_id = auth.uid() or therapist_id = auth.uid());
create policy prescription_read on public.exercise_prescriptions for select to authenticated
  using (public.can_view_care(patient_id));
create policy prescription_create on public.exercise_prescriptions for insert to authenticated
  with check (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id));
create policy session_read on public.exercise_sessions for select to authenticated
  using (public.can_view_care(patient_id));
create policy session_create on public.exercise_sessions for insert to authenticated
  with check (
    patient_id = auth.uid() and started_at between now() - interval '1 minute' and now() + interval '1 minute'
    and ended_at is null
    and exists (select 1 from public.care_profiles p where p.id = auth.uid() and p.role = 'patient'
      and p.review_consent = exercise_sessions.review_consent and p.training_consent = exercise_sessions.training_consent)
    and exists (select 1 from public.exercise_prescriptions p where p.id = prescription_id
      and p.patient_id = auth.uid() and (now() at time zone exercise_sessions.timezone)::date between p.starts_on and p.ends_on)
  );
create policy rep_read on public.exercise_reps for select to authenticated
  using (public.can_view_care(patient_id));
create policy review_read on public.rep_reviews for select to authenticated
  using (public.can_view_care(patient_id));
-- Offline dataset manifests are never available through patient or therapist clients.
create policy dataset_version_service on public.dataset_versions for all to service_role using (true) with check (true);
create policy dataset_example_service on public.dataset_examples for all to service_role using (true) with check (true);

revoke all on public.care_profiles, public.care_assignments, public.exercise_prescriptions,
  public.exercise_sessions, public.exercise_reps, public.rep_reviews,
  public.dataset_versions, public.dataset_examples from anon, authenticated;
grant select on public.care_profiles, public.care_assignments, public.exercise_prescriptions,
  public.exercise_sessions, public.exercise_reps, public.rep_reviews to authenticated;
grant insert on public.exercise_prescriptions, public.exercise_sessions to authenticated;
grant all on public.care_profiles, public.care_assignments, public.exercise_prescriptions,
  public.exercise_sessions, public.exercise_reps, public.rep_reviews,
  public.dataset_versions, public.dataset_examples to service_role;

create function public.set_care_consent(p_review boolean, p_training boolean) returns public.care_profiles
language plpgsql security definer set search_path = ''
as $$
declare profile public.care_profiles;
begin
  select * into profile from public.care_profiles where id = auth.uid() and role = 'patient' for update;
  if not found then raise exception 'Patient account required' using errcode = '42501'; end if;
  update public.care_profiles set review_consent = p_review, training_consent = p_training,
    consent_updated_at = now() where id = auth.uid() returning * into profile;
  if not p_training then
    update public.exercise_reps set training_consent = false where patient_id = auth.uid();
    delete from public.dataset_examples where rep_id in (
      select id from public.exercise_reps where patient_id = auth.uid()
    );
  end if;
  return profile;
end;
$$;

create function public.finish_care_session(p_session uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.exercise_sessions set ended_at = coalesce(ended_at, now())
    where id = p_session and patient_id = auth.uid();
  if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.record_care_rep(
  p_patient uuid, p_session uuid, p_client_id uuid, p_exercise text, p_evaluation jsonb, p_frames jsonb
) returns public.exercise_reps
language plpgsql security definer set search_path = ''
as $$
declare s public.exercise_sessions; profile public.care_profiles; rep public.exercise_reps; plan public.exercise_prescriptions;
begin
  select * into profile from public.care_profiles where id = p_patient and role = 'patient' for update;
  if not found then raise exception 'Patient unavailable' using errcode = '42501'; end if;
  select * into rep from public.exercise_reps where patient_id = p_patient and client_rep_id = p_client_id;
  if found then
    if rep.session_id <> p_session then raise exception 'Rep identifier belongs to another session' using errcode = '42501'; end if;
    return rep;
  end if;
  select * into s from public.exercise_sessions where id = p_session and patient_id = p_patient for update;
  if not found or s.ended_at is not null or s.started_at < now() - interval '2 hours' then
    raise exception 'Session unavailable' using errcode = '42501';
  end if;
  select * into plan from public.exercise_prescriptions where id = s.prescription_id;
  if plan.exercise <> p_exercise then raise exception 'Exercise mismatch' using errcode = '42501'; end if;
  insert into public.exercise_reps(client_rep_id, session_id, patient_id, prescription_id, exercise,
    exercise_day, label, original_label, error_type, confidence, feedback, model_version, frames, training_consent)
  values(p_client_id, p_session, p_patient, s.prescription_id, p_exercise, (now() at time zone s.timezone)::date,
    p_evaluation->>'label', p_evaluation->>'label', p_evaluation->>'error_type',
    (p_evaluation->>'confidence')::double precision, p_evaluation->>'feedback',
    p_evaluation->>'model_version', p_frames, s.training_consent and profile.training_consent)
  returning * into rep;
  return rep;
end;
$$;

create function public.review_care_rep(p_rep uuid, p_label text, p_error text, p_feedback text) returns public.rep_reviews
language plpgsql security definer set search_path = ''
as $$
declare rep public.exercise_reps; review public.rep_reviews;
begin
  select * into rep from public.exercise_reps where id = p_rep for update;
  if not found or not public.is_assigned_therapist(rep.patient_id) then
    raise exception 'Rep unavailable' using errcode = '42501';
  end if;
  if rep.label <> 'inconclusive' then raise exception 'Rep has already been resolved'; end if;
  if p_label not in ('correct', 'incorrect') or length(trim(p_feedback)) not between 1 and 2000
    or (p_label = 'incorrect' and (p_error is null or p_error not in ('range_of_motion', 'tempo', 'uneven_movement', 'other'))) then
    raise exception 'Invalid review';
  end if;
  insert into public.rep_reviews(rep_id, patient_id, therapist_id, label, error_type, feedback)
    values(p_rep, rep.patient_id, auth.uid(), p_label, case when p_label = 'correct' then null else p_error end, trim(p_feedback))
    returning * into review;
  update public.exercise_reps set label = p_label, error_type = review.error_type, feedback = review.feedback where id = p_rep;
  return review;
end;
$$;

create function public.attach_care_clip(p_rep uuid, p_path text) returns void
language plpgsql security definer set search_path = ''
as $$
declare rep public.exercise_reps; profile public.care_profiles;
begin
  select * into profile from public.care_profiles where id = auth.uid() for update;
  select * into rep from public.exercise_reps where id = p_rep and patient_id = auth.uid() for update;
  if not found or not profile.review_consent or rep.label <> 'inconclusive'
    or not exists(select 1 from public.exercise_sessions s where s.id = rep.session_id and s.review_consent)
    or p_path not like auth.uid()::text || '/' || p_rep::text || '/%' then
    raise exception 'Clip consent required' using errcode = '42501';
  end if;
  update public.exercise_reps set clip_path = p_path where id = p_rep;
end;
$$;

-- Explicit offline export preparation only. This function does not start training.
create function public.create_care_dataset(p_version text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare dataset uuid;
begin
  insert into public.dataset_versions(version) values(p_version) returning id into dataset;
  insert into public.dataset_examples(dataset_id, rep_id, review_id)
    select dataset, r.id, v.id from public.exercise_reps r
    join public.rep_reviews v on v.rep_id = r.id join public.care_profiles p on p.id = r.patient_id
    where r.training_consent and p.training_consent;
  return dataset;
end;
$$;

revoke all on function public.create_care_profile() from public, anon, authenticated;
revoke all on function public.is_assigned_therapist(uuid), public.can_view_care(uuid),
  public.set_care_consent(boolean, boolean), public.finish_care_session(uuid),
  public.review_care_rep(uuid, text, text, text), public.attach_care_clip(uuid, text) from public, anon;
grant execute on function public.is_assigned_therapist(uuid), public.can_view_care(uuid),
  public.set_care_consent(boolean, boolean), public.finish_care_session(uuid),
  public.review_care_rep(uuid, text, text, text), public.attach_care_clip(uuid, text) to authenticated;
revoke all on function public.record_care_rep(uuid, uuid, uuid, text, jsonb, jsonb),
  public.create_care_dataset(text) from public, anon, authenticated;
grant execute on function public.record_care_rep(uuid, uuid, uuid, text, jsonb, jsonb),
  public.create_care_dataset(text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('review-clips', 'review-clips', false, 10485760, array['video/webm', 'video/mp4']);
-- No browser storage policy: the API authorizes uploads and short-lived signed reads.
