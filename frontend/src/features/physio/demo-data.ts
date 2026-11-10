import type { Account, Assignment } from "./admin-console";
import { demoFrame } from "./engine";
import type { CustomExercise } from "./movement";
import type { Prescription, Profile, Rep, Review } from "./types";

export const demoPatient: Profile = {
  id: "demo-patient",
  display_name: "Alex Morgan",
  role: "patient",
  review_consent: false,
  training_consent: false,
};
export const demoTherapist: Profile = {
  ...demoPatient,
  id: "demo-therapist",
  display_name: "Taylor Chen",
  role: "therapist",
};
export const demoPlans: Prescription[] = [
  {
    id: "demo-squat",
    patient_id: demoPatient.id,
    exercise: "squat",
    daily_target: 10,
    instructions: "",
    confidence_threshold: 0.8,
    starts_on: "2020-01-01",
    ends_on: "2099-12-31",
  },
  {
    id: "demo-shoulder",
    patient_id: demoPatient.id,
    exercise: "shoulder_abduction",
    daily_target: 12,
    instructions: "",
    confidence_threshold: 0.8,
    starts_on: "2020-01-01",
    ends_on: "2099-12-31",
  },
];
// Demo data is a per-browser convenience: it survives refreshes until the
// viewer clears it. Clips live in the on-device clip store, keyed by rep id.
// ponytail: localStorage caps at a few MB; a long demo may stop saving new reps.
export const DEMO_KEY = "physiotrace-demo-v1";
// Demo admin console: sample accounts kept in the saved demo state.
export const demoAccounts: Account[] = [
  { id: "demo-admin", email: "you@example.com", display_name: "Demo Admin", role: "therapist", is_admin: true, provider: "google", created_at: "2026-11-01T09:00:00Z" },
  { id: "demo-therapist", email: "taylor@example.com", display_name: "Taylor Chen", role: "therapist", is_admin: false, provider: "email", created_at: "2026-11-02T09:00:00Z" },
  { id: "demo-patient", email: "alex@example.com", display_name: "Alex Morgan", role: "patient", is_admin: false, provider: "email", created_at: "2026-11-03T09:00:00Z" },
  { id: "demo-sam", email: "sam@example.com", display_name: "Sam Rivera", role: "patient", is_admin: false, provider: "google", created_at: "2026-11-04T09:00:00Z" },
  { id: "demo-jordan", email: "jordan@example.com", display_name: "Jordan Lee", role: "patient", is_admin: false, provider: "email", created_at: "2026-11-05T09:00:00Z" },
];
export const demoAssignments: Assignment[] = [
  { therapist_id: "demo-therapist", patient_id: "demo-patient" },
];
export type DemoState = {
  accounts?: Account[];
  assignments?: Assignment[];
  customs?: CustomExercise[];
  // Demo prescriptions of custom exercises, shown in the patient's plan.
  extraPlans?: Prescription[];
  reps: Rep[];
  reviews: Review[];
  consent: { review_consent: boolean; training_consent: boolean };
};
// Demo videos live in the on-device clip store under this prefix.
export const demoVideoKey = (id: string) => "demo-video:" + id;
export const sampleFrames = [175, 165, 130, 95, 120, 165, 175].map((a, i) =>
  demoFrame("squat", a, i * 300, 0.5),
);
