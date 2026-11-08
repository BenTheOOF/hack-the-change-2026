-- Admin accounts. Admins manage roles, admins, and patient assignments, and can use the patient
-- and therapist experience for their own relationships. They get no extra access to other
-- patients' reps, clips, or feedback: clinical read policies are unchanged.
alter table public.care_profiles add column is_admin boolean not null default false;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.care_profiles where id = auth.uid() and is_admin);
$$;

-- Admins can act as a therapist for patients assigned to them.
create or replace function public.is_assigned_therapist(p_patient uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_assignments a join public.care_profiles p on p.id = a.therapist_id
    where a.patient_id = p_patient and a.therapist_id = auth.uid() and (p.role = 'therapist' or p.is_admin)
  );
$$;

-- Admins can also run their own sessions as a patient.
drop policy session_create on public.exercise_sessions;
create policy session_create on public.exercise_sessions for insert to authenticated
  with check (
    patient_id = auth.uid() and started_at between now() - interval '1 minute' and now() + interval '1 minute'
    and ended_at is null
    and exists (select 1 from public.care_profiles p where p.id = auth.uid() and (p.role = 'patient' or p.is_admin)
      and p.review_consent = exercise_sessions.review_consent and p.training_consent = exercise_sessions.training_consent)
    and exists (select 1 from public.exercise_prescriptions p where p.id = prescription_id
      and p.patient_id = auth.uid() and (now() at time zone exercise_sessions.timezone)::date between p.starts_on and p.ends_on)
  );

drop policy custom_exercise_create on public.custom_exercises;
create policy custom_exercise_create on public.custom_exercises for insert to authenticated
  with check (
    therapist_id = auth.uid() and status = 'queued' and model is null and model_version is null
    and status_detail is null and trained_at is null and demo_video_path is null
    and exists (select 1 from public.care_profiles p where p.id = auth.uid() and (p.role = 'therapist' or p.is_admin))
  );

create or replace function public.set_care_consent(p_review boolean, p_training boolean) returns public.care_profiles
language plpgsql security definer set search_path = ''
as $$
declare profile public.care_profiles;
begin
  select * into profile from public.care_profiles where id = auth.uid() and (role = 'patient' or is_admin) for update;
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

create or replace function public.record_care_rep(
  p_patient uuid, p_session uuid, p_client_id uuid, p_exercise text, p_evaluation jsonb, p_frames jsonb
) returns public.exercise_reps
language plpgsql security definer set search_path = ''
as $$
declare s public.exercise_sessions; profile public.care_profiles; rep public.exercise_reps; plan public.exercise_prescriptions;
begin
  select * into profile from public.care_profiles where id = p_patient and (role = 'patient' or is_admin) for update;
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

-- Google accounts carry their name as full_name or name. Metadata never grants a role.
create or replace function public.create_care_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.care_profiles(id, display_name)
    values(new.id, left(coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      'Patient'), 100));
  return new;
end;
$$;

-- Account management. Each function checks that the caller is an admin.
create function public.admin_list_accounts()
returns table (id uuid, email text, display_name text, role text, is_admin boolean, provider text,
  created_at timestamptz, patient_count integer, therapist_count integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.display_name, p.role, p.is_admin,
      coalesce(u.raw_app_meta_data->>'provider', 'email'), p.created_at,
      (select count(*)::integer from public.care_assignments a where a.therapist_id = p.id),
      (select count(*)::integer from public.care_assignments a where a.patient_id = p.id)
    from public.care_profiles p left join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

create function public.admin_list_assignments() returns setof public.care_assignments
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  return query select * from public.care_assignments;
end;
$$;

create function public.admin_set_role(p_user uuid, p_role text) returns public.care_profiles
language plpgsql security definer set search_path = ''
as $$
declare profile public.care_profiles;
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  if p_role not in ('patient', 'therapist') then raise exception 'Choose patient or therapist'; end if;
  update public.care_profiles set role = p_role where id = p_user returning * into profile;
  if not found then raise exception 'Account not found'; end if;
  return profile;
end;
$$;

create function public.admin_set_admin(p_user uuid, p_value boolean) returns public.care_profiles
language plpgsql security definer set search_path = ''
as $$
declare profile public.care_profiles;
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  -- Serialize admin changes so two admins cannot remove each other at once.
  perform 1 from public.care_profiles where is_admin for update;
  if not p_value and (select count(*) from public.care_profiles where is_admin and id <> p_user) = 0 then
    raise exception 'Keep at least one admin';
  end if;
  update public.care_profiles set is_admin = p_value where id = p_user returning * into profile;
  if not found then raise exception 'Account not found'; end if;
  return profile;
end;
$$;

create function public.admin_assign(p_therapist uuid, p_patient uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  if p_therapist = p_patient then raise exception 'A therapist cannot be assigned to themselves'; end if;
  if not exists (select 1 from public.care_profiles where id = p_therapist and (role = 'therapist' or is_admin)) then
    raise exception 'Make this account a therapist first';
  end if;
  if not exists (select 1 from public.care_profiles where id = p_patient) then raise exception 'Account not found'; end if;
  insert into public.care_assignments(therapist_id, patient_id) values (p_therapist, p_patient) on conflict do nothing;
end;
$$;

create function public.admin_unassign(p_therapist uuid, p_patient uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin account required' using errcode = '42501'; end if;
  delete from public.care_assignments where therapist_id = p_therapist and patient_id = p_patient;
end;
$$;

-- The API grants the first admin from ADMIN_EMAILS, only for Google-verified accounts.
create function public.bootstrap_admin(p_user uuid) returns public.care_profiles
language plpgsql security definer set search_path = ''
as $$
declare profile public.care_profiles;
begin
  update public.care_profiles set is_admin = true where id = p_user returning * into profile;
  if not found then raise exception 'Account not found'; end if;
  return profile;
end;
$$;

revoke all on function public.is_admin(), public.admin_list_accounts(), public.admin_list_assignments(),
  public.admin_set_role(uuid, text), public.admin_set_admin(uuid, boolean), public.admin_assign(uuid, uuid),
  public.admin_unassign(uuid, uuid), public.bootstrap_admin(uuid) from public, anon;
grant execute on function public.is_admin(), public.admin_list_accounts(), public.admin_list_assignments(),
  public.admin_set_role(uuid, text), public.admin_set_admin(uuid, boolean), public.admin_assign(uuid, uuid),
  public.admin_unassign(uuid, uuid) to authenticated;
revoke all on function public.bootstrap_admin(uuid) from authenticated;
grant execute on function public.bootstrap_admin(uuid) to service_role;
