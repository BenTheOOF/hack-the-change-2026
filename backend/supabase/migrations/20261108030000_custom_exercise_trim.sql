-- The part of a demo video used for the model. The full upload is kept; players loop
-- between these times, and demo_frames start at 0 at demo_start_ms.
alter table public.custom_exercises
  add column demo_start_ms integer not null default 0 check (demo_start_ms >= 0),
  add column demo_end_ms integer check (demo_end_ms is null or demo_end_ms > demo_start_ms),
  add constraint custom_exercises_trim_length check (demo_end_ms is null or demo_end_ms - demo_start_ms <= 60100);
