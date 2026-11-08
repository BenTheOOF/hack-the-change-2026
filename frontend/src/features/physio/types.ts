import type { Evaluation, Exercise, PoseFrame } from "./engine";
import type { CustomExercise } from "./movement";

export type Profile = {
  id: string;
  display_name: string;
  role: "patient" | "therapist";
  review_consent: boolean;
  training_consent: boolean;
  // Admins manage accounts and can use both the patient and therapist views.
  is_admin?: boolean;
};
export type Prescription = {
  id: string;
  patient_id: string;
  exercise: Exercise;
  custom_exercise_id?: string | null;
  daily_target: number;
  instructions: string;
  confidence_threshold: number;
  starts_on: string;
  ends_on: string;
};
export type Rep = Evaluation & {
  id: string;
  session_id: string;
  prescription_id: string;
  patient_id: string;
  exercise: Exercise;
  exercise_day: string;
  created_at: string;
  clip_path?: string | null;
  // Embedded by the API so custom reps can show their exercise name.
  prescription?: { custom_exercise_id: string | null } | null;
  frames?: PoseFrame[];
  // In-memory object URL for a clip recorded in this browser session.
  local_clip_url?: string;
};
export type Review = {
  id: string;
  rep_id: string;
  patient_id: string;
  label: "correct" | "incorrect";
  error_type: string | null;
  feedback: string;
  created_at: string;
};
export type Overview = {
  profile: Profile;
  prescriptions?: Prescription[];
  reps?: Rep[];
  feedback?: Review[];
  patients?: { patient_id: string; care_profiles: Profile }[];
  queue?: Rep[];
  custom_exercises?: CustomExercise[];
};
