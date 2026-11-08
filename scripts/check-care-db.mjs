// Run against disposable PostgreSQL, never against a connected care database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    grant usage on schema auth, public to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `);
  for (const name of [
    "20261108010000_physiotrace.sql",
    "20261108020000_custom_exercises.sql",
    "20261108030000_custom_exercise_trim.sql",
    "20261108040000_admin_accounts.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../backend/supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const patient = "00000000-0000-4000-8000-000000000001";
  const therapist = "00000000-0000-4000-8000-000000000002";
  const stranger = "00000000-0000-4000-8000-000000000003";
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,'{\"role\":\"therapist\"}'),($2,'{}'),($3,'{}')",
    [patient, therapist, stranger],
  );
  assert.equal(
    (
      await db.query("select role from public.care_profiles where id=$1", [
        patient,
      ])
    ).rows[0].role,
    "patient",
  );
  await db.query(
    "update public.care_profiles set role='therapist' where id=$1",
    [therapist],
  );
  await db.query("insert into public.care_assignments values($1,$2)", [
    therapist,
    patient,
  ]);
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  await asUser(stranger);
  assert.equal(
    (
      await db.query("select * from public.care_profiles where id=$1", [
        patient,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query("update public.care_profiles set role='therapist' where id=$1", [
      stranger,
    ]),
  );
  await asUser(therapist);
  assert.equal(
    (
      await db.query("select * from public.care_profiles where id=$1", [
        patient,
      ])
    ).rows.length,
    1,
  );
  const plan = (
    await db.query(
      `insert into public.exercise_prescriptions(therapist_id,patient_id,exercise,daily_target,starts_on,ends_on)
    values($1,$2,'squat',10,current_date,current_date+7) returning id`,
      [therapist, patient],
    )
  ).rows[0].id;
  await asUser(patient);
  await db.exec("select public.set_care_consent(true,true)");
  const session = (
    await db.query(
      `insert into public.exercise_sessions(patient_id,prescription_id,timezone,review_consent,training_consent)
    values($1,$2,'UTC',true,true) returning id`,
      [patient, plan],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query(
      `insert into public.exercise_prescriptions(therapist_id,patient_id,exercise,daily_target,starts_on,ends_on)
    values($1,$1,'squat',100,current_date,current_date+7)`,
      [patient],
    ),
  );
  await db.exec("reset role; set role service_role");
  const clientId = "00000000-0000-4000-8000-000000000099";
  const evaluation = {
    label: "inconclusive",
    error_type: "tracking",
    confidence: 0.5,
    feedback: "Check tracking",
    model_version: "rules-1.0.0",
  };
  const frames = Array.from({ length: 6 }, (_, i) => ({
    t: i * 300,
    points: [],
  }));
  const recordSql =
    "select (public.record_care_rep($1,$2,$3,'squat',$4::jsonb,$5::jsonb)).*";
  const args = [
    patient,
    session,
    clientId,
    JSON.stringify(evaluation),
    JSON.stringify(frames),
  ];
  const rep = (await db.query(recordSql, args)).rows[0];
  const retry = (await db.query(recordSql, args)).rows[0];
  assert.equal(rep.id, retry.id);
  assert.equal(
    (await db.query("select * from public.exercise_reps")).rows.length,
    1,
  );
  await asUser(stranger);
  assert.equal(
    (await db.query("select * from public.exercise_reps")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select public.review_care_rep($1,'correct',null,'Looks good')", [
      rep.id,
    ]),
  );
  await asUser(therapist);
  await db.query(
    "select public.review_care_rep($1,'correct',null,'Good control')",
    [rep.id],
  );
  await assert.rejects(
    db.query(
      "select public.review_care_rep($1,'incorrect','tempo','Changed again')",
      [rep.id],
    ),
  );
  await asUser(patient);
  const reviewed = (
    await db.query("select * from public.exercise_reps where id=$1", [rep.id])
  ).rows[0];
  assert.equal(reviewed.label, "correct");
  assert.equal(reviewed.exercise_day.valueOf(), rep.exercise_day.valueOf());
  assert.equal(
    (await db.query("select * from public.rep_reviews")).rows.length,
    1,
  );
  await db.exec("reset role; set role service_role");
  await db.query("select public.create_care_dataset('test-v1')");
  assert.equal(
    (await db.query("select * from public.dataset_examples")).rows.length,
    1,
  );
  await asUser(patient);
  await db.exec("select public.set_care_consent(false,false)");
  await assert.rejects(
    db.query("select public.attach_care_clip($1,$2)", [
      rep.id,
      patient + "/" + rep.id + "/test.webm",
    ]),
  );
  await db.exec("reset role; set role service_role");
  assert.equal(
    (await db.query("select * from public.dataset_examples")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select training_consent from public.exercise_reps"))
      .rows[0].training_consent,
    false,
  );
  // Custom exercises: owner-only creation, queue claim and finish, prescription gate, visibility.
  const demoFrames = JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({ t: i * 100, points: [] })),
  );
  const createSql = `insert into public.custom_exercises(therapist_id,name,view,demo_frames)
    values($1,'Elbow curl','front',$2::jsonb) returning id`;
  await asUser(patient);
  await assert.rejects(db.query(createSql, [patient, demoFrames]));
  await asUser(therapist);
  await assert.rejects(
    db.query(
      `insert into public.custom_exercises(therapist_id,name,view,demo_frames,status,model)
      values($1,'Sneaky','front',$2::jsonb,'ready','{}')`,
      [therapist, demoFrames],
    ),
  );
  await assert.rejects(
    db.query(
      `insert into public.custom_exercises(therapist_id,name,view,demo_frames,demo_start_ms,demo_end_ms)
      values($1,'Too long','front',$2::jsonb,0,90000)`,
      [therapist, demoFrames],
    ),
  );
  const custom = (await db.query(createSql, [therapist, demoFrames])).rows[0].id;
  const prescribeCustom = `insert into public.exercise_prescriptions(therapist_id,patient_id,exercise,custom_exercise_id,daily_target,starts_on,ends_on)
    values($1,$2,'custom',$3,8,current_date,current_date+7) returning id`;
  await assert.rejects(db.query(prescribeCustom, [therapist, patient, custom]));
  await assert.rejects(db.query("select * from public.claim_custom_exercise()"));
  await db.exec("reset role; set role service_role");
  const claimed = (await db.query("select * from public.claim_custom_exercise()")).rows;
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].status, "training");
  assert.equal(
    (await db.query("select * from public.claim_custom_exercise()")).rows.length,
    0,
  );
  await db.query(
    "select public.finish_custom_exercise($1,'{\"kind\":\"template\"}'::jsonb,'template-1.0.0',null)",
    [custom],
  );
  await asUser(patient);
  assert.equal(
    (await db.query("select * from public.custom_exercises")).rows.length,
    0,
  );
  await asUser(therapist);
  const customPlan = (await db.query(prescribeCustom, [therapist, patient, custom])).rows[0].id;
  await assert.rejects(
    db.query(
      `insert into public.exercise_prescriptions(therapist_id,patient_id,exercise,daily_target,starts_on,ends_on)
      values($1,$2,'custom',8,current_date,current_date+7)`,
      [therapist, patient],
    ),
  );
  await asUser(patient);
  assert.equal(
    (await db.query("select status from public.custom_exercises")).rows[0].status,
    "ready",
  );
  await asUser(stranger);
  assert.equal(
    (await db.query("select * from public.custom_exercises")).rows.length,
    0,
  );
  await asUser(patient);
  await db.exec("select public.set_care_consent(false,false)");
  const customSession = (
    await db.query(
      `insert into public.exercise_sessions(patient_id,prescription_id,timezone,review_consent,training_consent)
    values($1,$2,'UTC',false,false) returning id`,
      [patient, customPlan],
    )
  ).rows[0].id;
  await db.exec("reset role; set role service_role");
  const customRep = (
    await db.query(
      "select (public.record_care_rep($1,$2,$3,'custom',$4::jsonb,$5::jsonb)).*",
      [
        patient,
        customSession,
        "00000000-0000-4000-8000-000000000098",
        JSON.stringify({ ...evaluation, model_version: "template-1.0.0" }),
        JSON.stringify(frames),
      ],
    )
  ).rows[0];
  assert.equal(customRep.exercise, "custom");
  // Admins: account management only, plus their own patient and therapist use.
  const admin = "00000000-0000-4000-8000-000000000004";
  await db.exec("reset role");
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
     values($1,'ada@example.com','{"full_name":"Ada Admin","role":"therapist"}','{"provider":"google"}')`,
    [admin],
  );
  const adaProfile = (await db.query("select * from public.care_profiles where id=$1", [admin])).rows[0];
  assert.equal(adaProfile.display_name, "Ada Admin");
  assert.equal(adaProfile.role, "patient");
  assert.equal(adaProfile.is_admin, false);
  await asUser(stranger);
  await assert.rejects(db.query("select * from public.admin_list_accounts()"));
  await assert.rejects(db.query("select public.admin_set_role($1,'therapist')", [stranger]));
  await assert.rejects(db.query("select public.bootstrap_admin($1)", [stranger]));
  await db.exec("reset role; set role service_role");
  await db.query("select public.bootstrap_admin($1)", [admin]);
  await asUser(admin);
  const accounts = (await db.query("select * from public.admin_list_accounts()")).rows;
  assert.equal(accounts.length, 4);
  assert.equal(accounts.find((a) => a.id === admin).provider, "google");
  assert.equal(accounts.find((a) => a.id === admin).email, "ada@example.com");
  // Managing accounts gives no access to clinical records.
  assert.equal((await db.query("select * from public.exercise_reps")).rows.length, 0);
  await db.query("select public.admin_set_role($1,'therapist')", [stranger]);
  await db.query("select public.admin_assign($1,$2)", [stranger, patient]);
  await assert.rejects(db.query("select public.admin_assign($1,$1)", [stranger]));
  await asUser(stranger);
  assert.equal(
    (await db.query("select * from public.care_profiles where id=$1", [patient])).rows.length,
    1,
  );
  await asUser(admin);
  await db.query("select public.admin_unassign($1,$2)", [stranger, patient]);
  await asUser(stranger);
  assert.equal(
    (await db.query("select * from public.care_profiles where id=$1", [patient])).rows.length,
    0,
  );
  await asUser(admin);
  await db.query("select public.admin_set_admin($1,true)", [stranger]);
  await db.query("select public.admin_set_admin($1,false)", [admin]);
  await asUser(stranger);
  await assert.rejects(db.query("select public.admin_set_admin($1,false)", [stranger]));
  await db.query("select public.admin_set_admin($1,true)", [admin]);
  // An admin with a therapist role can still be a patient of another therapist.
  await asUser(admin);
  await db.query("select public.admin_set_role($1,'therapist')", [admin]);
  await db.query("select public.admin_assign($1,$2)", [therapist, admin]);
  await db.query("select public.admin_assign($1,$2)", [admin, patient]);
  await db.exec("select public.set_care_consent(false,false)");
  await asUser(therapist);
  const adaPlan = (
    await db.query(
      `insert into public.exercise_prescriptions(therapist_id,patient_id,exercise,daily_target,starts_on,ends_on)
      values($1,$2,'squat',5,current_date,current_date+7) returning id`,
      [therapist, admin],
    )
  ).rows[0].id;
  await asUser(admin);
  await db.query(
    `insert into public.exercise_sessions(patient_id,prescription_id,timezone,review_consent,training_consent)
    values($1,$2,'UTC',false,false)`,
    [admin, adaPlan],
  );
  // ...and act as a therapist only for the patient assigned to them.
  assert.ok((await db.query("select * from public.exercise_reps where patient_id=$1", [patient])).rows.length > 0);
  console.log(
    "Care database checks passed: migrations, RLS, roles, retries, review correction, consent revocation, custom exercises, demo trims, and admin accounts. No training ran.",
  );
} finally {
  await db.close();
}
