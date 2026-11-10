import type { ReactNode } from "react";
import { Icon } from "@/features/ui/icons";
import { Empty, Stat, modelStat } from "./app-shell";
import { CustomExerciseForm, trainingStatusLabel, type ExerciseSubmission } from "./custom-exercise-form";
import type { PoseFrame } from "./engine";
import type { CustomExercise, exerciseInfo } from "./movement";
import { PoseReplay } from "./pose-replay";
import { demoPatient } from "./demo-data";
import type { Overview, Prescription, Rep } from "./types";

type Info = (item: Parameters<typeof exerciseInfo>[0]) => ReturnType<typeof exerciseInfo>;

export function PlansPage({
  therapistPatients,
  therapistPlans,
  info,
  children,
}: {
  therapistPatients: NonNullable<Overview["patients"]>;
  therapistPlans: Prescription[];
  info: Info;
  // The prescription form, which keeps its save logic in PhysioApp.
  children: ReactNode;
}) {
  return (
    <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">The right plan for each person</span>
        <h1>Patients &amp; plans</h1>
        <p>See what each patient is working on and prescribe what comes next.</p>
      </div>
    </div>
    <div className="patient-plans">
      {therapistPatients.length === 0 ? (
        <div className="panel">
          <Empty
            title="No assigned patients yet."
            text="An administrator links patients to your account. They appear here once assigned."
          />
        </div>
      ) : (
        therapistPatients.map((p) => {
          const theirs = therapistPlans.filter((plan) => plan.patient_id === p.patient_id);
          return (
            <article className="panel patient-plan-card" key={p.patient_id}>
              <div className="section-heading">
                <h2>{p.care_profiles.display_name}</h2>
                <span className="muted">
                  {theirs.length} active plan{theirs.length === 1 ? "" : "s"}
                </span>
              </div>
              {theirs.length ? (
                <ul className="plan-list">
                  {theirs.map((plan) => (
                    <li key={plan.id}>
                      <strong>{info(plan).name}</strong>
                      <span className="muted">
                        {plan.daily_target} reps a day · {plan.starts_on} to {plan.ends_on}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No active plans. Prescribe one below.</p>
              )}
            </article>
          );
        })
      )}
    </div>
    <div className="panel prescription-panel">
      <h2>Prescribe an exercise</h2>
      <p className="muted">
        Set a daily target for a patient already assigned to you.
      </p>
      {children}
    </div>
    </>
  );
}

export function ExercisesPage({
  customs,
  busy,
  demo,
  submitExercise,
}: {
  customs: CustomExercise[];
  busy: boolean;
  demo: boolean;
  submitExercise: (form: ExerciseSubmission) => Promise<boolean>;
}) {
  return (
    <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">Movements made for your patients</span>
        <h1>Add exercise</h1>
        <p>Add a movement from a demo video. Once its model is ready, prescribe it like any other exercise.</p>
      </div>
    </div>
    <div className="panel custom-panel">
      {customs.length > 0 && (
        <h2 className="custom-subhead">Saved exercises</h2>
      )}
      {customs.length > 0 && (
        <ul className="custom-list">
          {customs.map((c) => (
            <li key={c.id}>
              <span className={"badge status-" + c.status}>
                {trainingStatusLabel(c.status)}
              </span>
              <div>
                <strong>{c.name}</strong>
                <small>
                  {c.status === "failed"
                    ? c.status_detail || "The demo could not be used. Record it again."
                    : c.status === "ready" && c.model
                      ? `${c.model.demoReps} demo reps · ${c.view === "front" ? "facing camera" : "side-on"} · ${c.model_version}`
                      : "The trainer will pick this up shortly."}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="custom-subhead">Add an exercise</h2>
      <p className="muted">
        Upload or record a demo, trim it to the reps you want, then save.
      </p>
      <CustomExerciseForm busy={busy} demo={demo} onSubmit={submitExercise} />
    </div>
    </>
  );
}

export function QueuePage({
  demo,
  setNotice,
  load,
  loading,
  queue,
  overview,
  customs,
  selected,
  busy,
  inspect,
  info,
  pose,
  clip,
  saveReview,
  label,
  setLabel,
  errorType,
  setErrorType,
  feedback,
  setFeedback,
}: {
  demo: boolean;
  setNotice: (notice: string) => void;
  load: () => Promise<void>;
  loading: boolean;
  queue: Rep[];
  overview: Overview | null;
  customs: CustomExercise[];
  selected: Rep | null;
  busy: boolean;
  inspect: (rep: Rep) => Promise<void>;
  info: Info;
  pose: PoseFrame[];
  clip: string | undefined;
  saveReview: (event: React.FormEvent) => Promise<void>;
  label: "correct" | "incorrect";
  setLabel: (label: "correct" | "incorrect") => void;
  errorType: string;
  setErrorType: (errorType: string) => void;
  feedback: string;
  setFeedback: (feedback: string) => void;
}) {
  return (
    <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">
          A human eye makes the difference
        </span>
        <h1>Care, with a closer look</h1>
        <p>
          Review uncertain movements and help your patients move
          forward.
        </p>
      </div>
      <button
        className="secondary"
        onClick={() =>
          demo ? setNotice("Demo queue is up to date.") : void load()
        }
        disabled={loading}
      >
        <Icon name="refresh" /> Refresh queue
      </button>
    </div>
    <div className="stats-grid">
      <Stat
        label="Awaiting your review"
        value={String(queue.length)}
        detail="Uncertain repetitions"
        color="peach"
      />
      <Stat
        label="Patients in your care"
        value={demo ? "1" : String(overview?.patients?.length ?? 0)}
        detail="Only your assigned patients"
        color="sage"
      />
      <Stat
        label="Exercise models"
        {...modelStat(customs)}
        color="cream"
      />
    </div>
    <div className="review-layout">
      <div className="panel">
        <div className="section-heading">
          <h2>
            Review queue{" "}
            <span className="subtle-count">{queue.length}</span>
          </h2>
          <span className="muted">Oldest first</span>
        </div>
        {!queue.length ? (
          <Empty
            title="All caught up."
            text="Uncertain repetitions from your assigned patients will appear here."
          />
        ) : (
          queue.map((rep) => (
            <button
              className={
                "queue-item " +
                (selected?.id === rep.id ? "queue-selected" : "")
              }
              key={rep.id}
              disabled={busy}
              onClick={() => void inspect(rep)}
            >
              <span className="exercise-symbol">
                <Icon name={rep.exercise === "squat" ? "down" : "up"} />
              </span>
              <span>
                <strong>
                  {demo
                    ? demoPatient.display_name
                    : (overview?.patients?.find(
                        (p) => p.patient_id === rep.patient_id,
                      )?.care_profiles.display_name ?? "Patient")}
                </strong>
                <small>
                  {info(rep).name} ·{" "}
                  {Math.round(rep.confidence * 100)}% confidence
                </small>
              </span>
              <span className="queue-time">
                {rep.exercise_day}
                <br />
                Review
              </span>
            </button>
          ))
        )}
      </div>
      <div className="panel">
        {selected ? (
          <>
            <div className="section-heading">
              <h2>{info(selected).short}</h2>
              <span className="badge inconclusive">
                Needs your review
              </span>
            </div>
            <PoseReplay frames={pose} videoUrl={clip} />
            <p className="review-reason">
              <strong>Why it was flagged:</strong> {selected.feedback}{" "}
              <span className="muted">
                {Math.round(selected.confidence * 100)}% confidence ·{" "}
                {selected.model_version} · {selected.exercise_day}
              </span>
            </p>
            {!clip && (
              <p className="muted">
                {demo
                  ? "Simulated reps have no video. Turn on the camera in a patient session to record one."
                  : "This patient has not shared video for this rep, so only the recorded pose is shown."}
              </p>
            )}
            <form onSubmit={saveReview} className="review-form">
              <fieldset>
                <legend>Your assessment</legend>
                <label>
                  <input
                    type="radio"
                    name="label"
                    checked={label === "correct"}
                    onChange={() => setLabel("correct")}
                  />
                  Correct
                </label>
                <label>
                  <input
                    type="radio"
                    name="label"
                    checked={label === "incorrect"}
                    onChange={() => setLabel("incorrect")}
                  />
                  Needs adjustment
                </label>
              </fieldset>
              {label === "incorrect" && (
                <label>
                  Error type
                  <select
                    value={errorType}
                    onChange={(e) => setErrorType(e.target.value)}
                  >
                    <option value="range_of_motion">
                      Range of motion
                    </option>
                    <option value="tempo">Movement tempo</option>
                    <option value="uneven_movement">
                      Uneven movement
                    </option>
                    <option value="other">Other</option>
                  </select>
                </label>
              )}
              <label>
                Feedback for your patient
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="A clear cue for their next repetition…"
                  required
                  maxLength={2000}
                  rows={3}
                />
              </label>
              <p className="muted">
                A correct label counts toward the original exercise
                day. Training requires separate consent.
              </p>
              <button
                className="primary"
                disabled={busy || !feedback.trim()}
              >
                Save review & send feedback
              </button>
            </form>
          </>
        ) : (
          <Empty
            title="A little context. Better care."
            text="Select a repetition to inspect its pose replay and leave feedback."
          />
        )}
      </div>
    </div>
    </>
  );
}
