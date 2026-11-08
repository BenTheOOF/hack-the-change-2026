-- Run with psql as the database administrator. These are data changes, not schema changes.
-- psql "$DATABASE_URL" -v therapist_id="<auth uuid>" -v patient_id="<auth uuid>" -f admin-care.sql
begin;
update public.care_profiles set role = 'therapist' where id = :'therapist_id'::uuid;
insert into public.care_assignments(therapist_id, patient_id)
values (:'therapist_id'::uuid, :'patient_id'::uuid)
on conflict do nothing;
commit;
