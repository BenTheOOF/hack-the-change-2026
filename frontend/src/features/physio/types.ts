import type { Evaluation, Exercise, PoseFrame } from "./engine";

export type Profile = {
  id: string;
  display_name: string;
  role: "patient" | "therapist";
  review_consent: boolean;
  training_consent: boolean;
};
export type Prescription = {
  id: string;
  patient_id: string;
  exercise: Exercise;
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
  frames?: PoseFrame[];
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
};
