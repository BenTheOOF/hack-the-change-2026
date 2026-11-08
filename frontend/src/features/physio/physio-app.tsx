"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import {
  EXERCISES,
  demoFrame,
  type Evaluation,
  type PoseFrame,
} from "./engine";
import { LiveSession } from "./live-session";
import { PoseReplay } from "./pose-replay";
import type { Overview, Prescription, Profile, Rep, Review } from "./types";

const localDay = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
const demoPatient: Profile = {
  id: "demo-patient",
  display_name: "Alex Morgan",
  role: "patient",
  review_consent: false,
  training_consent: false,
};
const demoTherapist: Profile = {
  ...demoPatient,
  id: "demo-therapist",
  display_name: "Taylor Chen",
  role: "therapist",
};
const demoPlans: Prescription[] = [
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
const sampleFrames = [175, 165, 130, 95, 120, 165, 175].map((a, i) =>
  demoFrame("squat", a, i * 300, 0.5),
);

export function PhysioApp({ demo = false }: { demo?: boolean }) {
  const token = useRef("");
  const [role, setRole] = useState<Profile["role"]>("patient");
  const [overview, setOverview] = useState<Overview | null>(
    demo ? { profile: demoPatient, prescriptions: demoPlans } : null,
  );
  const [reps, setReps] = useState<Rep[]>([]),
    [reviews, setReviews] = useState<Review[]>([]);
  const [history, setHistory] = useState<Rep[]>([]),
    [moreHistory, setMoreHistory] = useState(false);
  const [page, setPage] = useState("today"),
    [loading, setLoading] = useState(!demo),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [session, setSession] = useState<{
    id: string;
    plan: Prescription;
  } | null>(null);
  const [selected, setSelected] = useState<Rep | null>(null),
    [pose, setPose] = useState<PoseFrame[]>([]),
    [clip, setClip] = useState<string>();
  const [label, setLabel] = useState<"correct" | "incorrect">("correct"),
    [errorType, setErrorType] = useState("range_of_motion"),
    [feedback, setFeedback] = useState("");
  const [consent, setConsent] = useState({
    review_consent: false,
    training_consent: false,
  });
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentDraft, setConsentDraft] = useState(consent);
  const profile = overview?.profile;
  const queue = demo
    ? reps.filter((r) => r.label === "inconclusive")
    : (overview?.queue ?? []);
  const plans = overview?.prescriptions ?? [];
  const todayReps = reps.filter((r) => r.exercise_day === localDay());
  const accepted = todayReps.filter((r) => r.label === "correct").length;
  const pending = todayReps.filter((r) => r.label === "inconclusive").length;
  const target = plans.reduce((sum, p) => sum + p.daily_target, 0);

  const request = useCallback(
    async (path: string, method = "GET", body?: object) =>
      apiFetch("/physio" + path, token.current, {
        method,
        ...(body
          ? {
              body: JSON.stringify(body),
              headers: { "Content-Type": "application/json" },
            }
          : {}),
      }),
    [],
  );

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setError("");
    try {
      const data: Overview = await request("/overview?day=" + localDay());
      setOverview(data);
      setRole(data.profile.role);
      setReps(data.reps ?? []);
      setReviews(data.feedback ?? []);
      setConsent({
        review_consent: data.profile.review_consent,
        training_consent: data.profile.training_consent,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your care plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [demo, request]);

  useEffect(() => {
    if (demo) return;
    const supabase = createClient();
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data.session) {
          window.location.assign("/login");
          return;
        }
        token.current = data.session.access_token;
        void load();
      })
      .catch(() => {
        setError("Your session could not be checked. Please sign in again.");
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        token.current = session?.access_token ?? "";
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [demo, load]);

  async function guarded(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function switchDemo(next: Profile["role"]) {
    setRole(next);
    setSelected(null);
    setPage("today");
    setOverview({
      profile:
        next === "patient" ? { ...demoPatient, ...consent } : demoTherapist,
      prescriptions: demoPlans,
    });
    if (next === "therapist" && !reps.some((r) => r.label === "inconclusive"))
      setReps((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          session_id: "demo-session",
          prescription_id: "demo-squat",
          patient_id: demoPatient.id,
          exercise: "squat",
          exercise_day: localDay(),
          created_at: new Date().toISOString(),
          label: "inconclusive",
          error_type: "tracking",
          confidence: 0.5,
          feedback: "Tracking was uncertain.",
          model_version: "rules-1.0.0",
          frames: sampleFrames,
        },
      ]);
  }
  async function start(plan: Prescription) {
    await guarded(async () => {
      const data = demo
        ? [{ id: crypto.randomUUID() }]
        : await request("/sessions", "POST", {
            prescription_id: plan.id,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...consent,
          });
      setSession({ id: data[0].id, plan });
    });
  }
  async function record(
    frames: PoseFrame[],
    evaluation: Evaluation,
    video?: Blob,
  ): Promise<Evaluation> {
    if (!session) throw new Error("Start an exercise session first.");
    const rep: Rep = demo
      ? {
          ...evaluation,
          id: crypto.randomUUID(),
          session_id: session.id,
          patient_id: demoPatient.id,
          prescription_id: session.plan.id,
          exercise: session.plan.exercise,
          exercise_day: localDay(),
          created_at: new Date().toISOString(),
          frames,
        }
      : await request("/sessions/" + session.id + "/reps", "POST", {
          client_rep_id: crypto.randomUUID(),
          frames,
        });
    setReps((current) => [rep, ...current.filter((r) => r.id !== rep.id)]);
    if (
      !demo &&
      rep.label === "inconclusive" &&
      consent.review_consent &&
      video
    ) {
      try {
        await apiFetch("/physio/reps/" + rep.id + "/clip", token.current, {
          method: "PUT",
          headers: { "Content-Type": video.type },
          body: video,
        });
      } catch (e) {
        setError(
          "The pose rep was saved, but its clip was not uploaded. " +
            (e instanceof Error ? e.message : ""),
        );
      }
    }
    return rep;
  }
  async function endSession() {
    await guarded(async () => {
      if (!demo && session)
        await request("/sessions/" + session.id + "/finish", "POST");
      setSession(null);
      setNotice("Session complete. Every comfortable repetition is progress.");
      if (!demo) await load();
    });
  }
  async function inspect(rep: Rep) {
    await guarded(async () => {
      setSelected(null);
      setPose([]);
      setClip(undefined);
      setFeedback("");
      setLabel("correct");
      setPose(
        demo
          ? (rep.frames ?? sampleFrames)
          : (await request("/reps/" + rep.id + "/pose")).frames,
      );
      setSelected(rep);
      if (!demo && rep.clip_path) {
        try {
          setClip((await request("/reps/" + rep.id + "/clip")).url);
        } catch {
          setNotice(
            "The private clip is unavailable. The recorded pose is ready to review.",
          );
        }
      }
    });
  }
  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await guarded(async () => {
      const body = {
        label,
        error_type: label === "incorrect" ? errorType : null,
        feedback: feedback.trim(),
      };
      const review: Review = demo
        ? {
            ...body,
            id: crypto.randomUUID(),
            rep_id: selected.id,
            patient_id: selected.patient_id,
            created_at: new Date().toISOString(),
          }
        : await request("/reps/" + selected.id + "/review", "POST", body);
      setReviews((current) => [review, ...current]);
      setReps((current) =>
        current.map((r) => (r.id === selected.id ? { ...r, ...body } : r)),
      );
      setSelected(null);
      setNotice("Review saved. The patient can see your feedback.");
      if (!demo) await load();
    });
  }
  async function saveConsent() {
    await guarded(async () => {
      if (!demo) await request("/consent", "PATCH", consentDraft);
      setOverview((current) =>
        current
          ? { ...current, profile: { ...current.profile, ...consentDraft } }
          : current,
      );
      setConsent(consentDraft);
      setConsentOpen(false);
      setNotice("Your privacy choices have been saved.");
    });
  }
  async function openPage(next: string) {
    setPage(next);
    setSelected(null);
    setError("");
    if (next === "history")
      await guarded(async () => {
        const data: Rep[] = demo ? reps : await request("/history");
        setHistory(data);
        setMoreHistory(data.length === 50);
      });
    if (next === "feedback" && !demo) await load();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32">
              <path d="M3 17h6l4-10 6 19 4-12h6" />
            </svg>
          </span>
          <span>
            physio<span className="brand-light">trace</span>
            <small>SMALL MOVES. REAL PROGRESS.</small>
          </span>
        </Link>
        <span className="nav-label">
          {role === "patient" ? "YOUR RECOVERY" : "YOUR PRACTICE"}
        </span>
        <nav aria-label="Main navigation">
          <button
            className={"nav-item " + (page === "today" ? "selected" : "")}
            onClick={() => void openPage("today")}
          >
            <span>◫</span>
            {role === "patient" ? "Today’s plan" : "Review queue"}
          </button>
          {role === "patient" && (
            <>
              <button
                className={"nav-item " + (page === "history" ? "selected" : "")}
                onClick={() => void openPage("history")}
              >
                <span>◷</span>Session history
              </button>
              <button
                className={
                  "nav-item " + (page === "feedback" ? "selected" : "")
                }
                onClick={() => void openPage("feedback")}
              >
                <span>☷</span>Therapist feedback
                {reviews.length > 0 && (
                  <span className="nav-number">{reviews.length}</span>
                )}
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span>⌁</span>
            <strong>Your space is private.</strong>
            <p>
              Movement is processed on your device. You choose what to share.
            </p>
            {role === "patient" && (
              <button
                onClick={() => {
                  setConsentOpen(true);
                  setConsentDraft({
                    review_consent: profile?.review_consent ?? false,
                    training_consent: profile?.training_consent ?? false,
                  });
                }}
              >
                Privacy choices ↗
              </button>
            )}
          </div>
          <div className="user-card">
            <span className="avatar">
              {profile?.display_name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("") || "PT"}
            </span>
            <div>
              <strong>{profile?.display_name || "Your account"}</strong>
              <small>
                {role === "patient" ? "Patient" : "Physical therapist"}
                {demo ? " · Demo" : ""}
              </small>
            </div>
            {!demo && (
              <form action="/logout" method="post">
                <button className="text-button" aria-label="Log out">
                  ↪
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Your care / </span>
            {session
              ? "Live session"
              : role === "therapist"
                ? "Therapist workspace"
                : "Overview"}
          </div>
          <div className="topbar-right">
            {role === "patient" && (
              <button
                className="topbar-privacy"
                onClick={() => {
                  setConsentDraft(consent);
                  setConsentOpen(true);
                }}
              >
                Privacy choices
              </button>
            )}
            {demo && (
              <>
                <span className="demo-badge">INTERACTIVE DEMO</span>
                <div className="role-switch" aria-label="Demo role">
                  <button
                    disabled={!!session}
                    className={role === "patient" ? "active" : ""}
                    onClick={() => switchDemo("patient")}
                  >
                    Patient
                  </button>
                  <button
                    disabled={!!session}
                    className={role === "therapist" ? "active" : ""}
                    onClick={() => switchDemo("therapist")}
                  >
                    Therapist
                  </button>
                </div>
              </>
            )}
            <span className="date-label">
              {new Date().toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </header>
        <main className="workspace">
          {demo && (
            <div className="demo-strip">
              A space to explore PhysioTrace. Sample data stays in memory and
              resets on refresh.{" "}
              <Link href="/signup">Create your account ↗</Link>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              {!demo && (
                <button className="text-button" onClick={() => void load()}>
                  Retry
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {loading && !profile ? (
            <div className="empty-state">
              <h2>Opening your care plan…</h2>
            </div>
          ) : session ? (
            <LiveSession
              key={session.id}
              plan={session.plan}
              demo={demo}
              uploadConsent={consent.review_consent}
              todayCount={
                todayReps.filter(
                  (r) =>
                    r.prescription_id === session.plan.id &&
                    r.label === "correct",
                ).length
              }
              onRep={record}
              onClose={endSession}
            />
          ) : role === "therapist" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A HUMAN EYE MAKES THE DIFFERENCE
                  </span>
                  <h1>Care, with a closer look.</h1>
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
                  ↻ Refresh queue
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
                  label="Model updates"
                  value="Offline"
                  detail="Labels never trigger training"
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
                          {rep.exercise === "squat" ? "↧" : "↟"}
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
                            {EXERCISES[rep.exercise].name} ·{" "}
                            {Math.round(rep.confidence * 100)}% confidence
                          </small>
                        </span>
                        <span className="queue-time">
                          {rep.exercise_day}
                          <br />
                          Review →
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="panel">
                  {selected ? (
                    <>
                      <div className="section-heading">
                        <h2>{EXERCISES[selected.exercise].short}</h2>
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
                      <p className="muted">
                        Recorded keypoints are available even when the patient
                        has not shared video.
                      </p>
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
                          Save review & send feedback →
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
              <div className="panel prescription-panel">
                <h2>Prescribe an exercise</h2>
                <p className="muted">
                  Set a daily target for a patient already assigned to you.
                </p>
                <PrescriptionForm
                  patients={
                    demo
                      ? [
                          {
                            patient_id: demoPatient.id,
                            care_profiles: demoPatient,
                          },
                        ]
                      : (overview?.patients ?? [])
                  }
                  busy={busy}
                  onSubmit={(body) =>
                    guarded(async () => {
                      if (!demo) await request("/prescriptions", "POST", body);
                      setNotice(
                        demo
                          ? "Demo prescription previewed. Sign in to save a real care plan."
                          : "The prescription is ready in your patient’s plan.",
                      );
                    })
                  }
                />
              </div>
            </>
          ) : page === "today" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A LITTLE BETTER, EVERY DAY</span>
                  <h1>
                    Your pace. Your progress
                    <span className="accent-dot">.</span>
                  </h1>
                  <p>
                    Welcome back
                    {profile ? ", " + profile.display_name.split(" ")[0] : ""}.
                    Let’s make room for a little movement.
                  </p>
                </div>
                <span className="care-pill">
                  <span className="status-dot" /> Guided by your therapist
                </span>
              </div>
              <div className="stats-grid">
                <Stat
                  label="Today’s accepted reps"
                  value={String(accepted).padStart(2, "0")}
                  suffix={"/ " + target}
                  detail={
                    target
                      ? Math.round(Math.min(1, accepted / target) * 100) +
                        "% of your daily plan"
                      : "Your plan is ready when assigned"
                  }
                  color="sage"
                />
                <Stat
                  label="Exercises in your plan"
                  value={String(plans.length).padStart(2, "0")}
                  detail="Move at a comfortable pace"
                  color="cream"
                />
                <Stat
                  label="Waiting for a closer look"
                  value={String(pending).padStart(2, "0")}
                  detail="Your therapist reviews uncertain reps"
                  color="peach"
                />
              </div>
              <div className="patient-grid">
                <section>
                  <div className="section-heading">
                    <h2>Your movement plan</h2>
                    <span className="muted">
                      Today · {plans.length} exercises
                    </span>
                  </div>
                  {!plans.length ? (
                    <div className="panel">
                      <Empty
                        title="Your recovery starts with a plan."
                        text="Your assigned therapist can prescribe exercises and a daily target. Refresh once your plan is ready."
                      />
                      <button className="secondary" onClick={() => void load()}>
                        Refresh plan
                      </button>
                    </div>
                  ) : (
                    plans.map((plan, i) => {
                      const count = todayReps.filter(
                        (r) =>
                          r.prescription_id === plan.id &&
                          r.label === "correct",
                      ).length;
                      return (
                        <article className="exercise-card" key={plan.id}>
                          <div
                            className={
                              "exercise-art " +
                              (i % 2 ? "art-peach" : "art-sage")
                            }
                          >
                            <MovementIllustration exercise={plan.exercise} />
                            <span className="art-number">0{i + 1}</span>
                          </div>
                          <div className="exercise-content">
                            <span className="eyebrow">
                              {EXERCISES[plan.exercise].focus}
                            </span>
                            <h3>{EXERCISES[plan.exercise].name}</h3>
                            <p>
                              {plan.instructions ||
                                (plan.exercise === "squat"
                                  ? "Build a steady foundation, one controlled movement at a time."
                                  : "Find a little more freedom in every comfortable reach.")}
                            </p>
                            <div className="exercise-progress">
                              <span>
                                {count}{" "}
                                <span className="muted">
                                  / {plan.daily_target} reps
                                </span>
                              </span>
                              <span>
                                {count >= plan.daily_target
                                  ? "Daily target reached ✓"
                                  : "Daily target"}
                              </span>
                            </div>
                            <div className="progress-track">
                              <span
                                style={{
                                  width:
                                    Math.min(
                                      100,
                                      (count / plan.daily_target) * 100,
                                    ) + "%",
                                }}
                              />
                            </div>
                            <button
                              className={
                                (i % 2 ? "secondary" : "primary") +
                                " start-exercise"
                              }
                              disabled={busy}
                              onClick={() => void start(plan)}
                            >
                              {count >= plan.daily_target
                                ? "Practice again"
                                : "Start exercise"}
                              <span>↗</span>
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </section>
                <aside>
                  <div className="panel note-panel">
                    <span className="eyebrow">A NOTE FOR YOUR JOURNEY</span>
                    <span className="note-flower">✳</span>
                    <h2>
                      Progress doesn’t
                      <br />
                      have to be perfect.
                    </h2>
                    <p>
                      Some days feel easier than others. Showing up, moving
                      comfortably, and listening to your body all count.
                    </p>
                    <div className="divider" />
                    <span className="muted">Small moves. Real progress.</span>
                  </div>
                  <div className="panel feedback-preview">
                    <div className="section-heading">
                      <h3>From your therapist</h3>
                    </div>
                    {reviews.length ? (
                      <>
                        <p>“{reviews[0].feedback}”</p>
                        <button
                          className="text-button"
                          onClick={() => void openPage("feedback")}
                        >
                          See all feedback →
                        </button>
                      </>
                    ) : (
                      <p className="muted">
                        Your therapist’s cues and reviewed repetitions will
                        appear here.
                      </p>
                    )}
                  </div>
                </aside>
              </div>
              <div className="safety-inline">
                <span>ⓘ</span>
                <p>
                  <strong>Move with care.</strong> Stop if you feel pain.
                  PhysioTrace supports your therapist’s care and does not
                  replace it.
                </p>
              </div>
            </>
          ) : page === "history" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY STEP FORWARD</span>
                  <h1>Your movement history.</h1>
                  <p>
                    Accepted reps, adjustments, and movements waiting for
                    review.
                  </p>
                </div>
              </div>
              <div className="panel">
                {!history.length ? (
                  <Empty
                    title="Your first rep is a fresh start."
                    text="Complete an exercise to see your history here."
                  />
                ) : (
                  <RepList reps={history} />
                )}
                {moreHistory && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void guarded(async () => {
                        const next: Rep[] = await request(
                          "/history?offset=" + history.length,
                        );
                        setHistory((current) => [...current, ...next]);
                        setMoreHistory(next.length === 50);
                      })
                    }
                  >
                    Load more
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CARE THAT STAYS CONNECTED</span>
                  <h1>A little guidance goes a long way.</h1>
                  <p>Personal feedback from your physical therapist.</p>
                </div>
              </div>
              <div className="feedback-feed">
                {reviews.length ? (
                  reviews.map((review) => (
                    <article className="panel" key={review.id}>
                      <div className="section-heading">
                        <span className={"badge " + review.label}>
                          {review.label === "correct"
                            ? "Rep accepted"
                            : "Movement cue"}
                        </span>
                        <span className="muted">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h3>{review.feedback}</h3>
                      <p className="muted">
                        {review.label === "correct"
                          ? "This review counts toward the original exercise day."
                          : "Use this cue during your next comfortable repetition."}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="panel">
                    <Empty
                      title="You’re connected to your care."
                      text="After your therapist reviews an uncertain rep, their feedback will appear here."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>PHYSIOTRACE</span>
          <span>Made for the way you recover.</span>
          <span>Private by default</span>
        </footer>
      </div>
      {consentOpen && (
        <div className="modal-backdrop">
          <section
            onKeyDown={(e) => {
              if (e.key === "Escape") setConsentOpen(false);
              if (e.key === "Tab") {
                const items = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled)",
                );
                const first = items[0],
                  last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                }
                if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
            className="panel consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <button
              autoFocus
              className="close-modal"
              aria-label="Close privacy choices"
              onClick={() => setConsentOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">YOUR MOVEMENT. YOUR CHOICE.</span>
            <h2 id="consent-title">A little clarity on privacy.</h2>
            <p>
              Camera video stays on this device by default. Pose keypoints and
              rep results are saved as care records when you sign in.
            </p>
            <label className="consent-choice">
              <input
                type="checkbox"
                checked={consentDraft.review_consent}
                onChange={(e) =>
                  setConsentDraft((c) => ({
                    ...c,
                    review_consent: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>Share uncertain clips with my therapist</strong>
                <small>
                  Only flagged clips may upload. Turning this off hides shared
                  clips; an existing signed link can last up to 60 seconds.
                </small>
              </span>
            </label>
            <label className="consent-choice">
              <input
                type="checkbox"
                checked={consentDraft.training_consent}
                onChange={(e) =>
                  setConsentDraft((c) => ({
                    ...c,
                    training_consent: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>
                  Allow reviewed pose data in future training datasets
                </strong>
                <small>
                  This is separate from care and clip sharing. Revoking it
                  removes your samples from future manifests. Training never
                  runs automatically.
                </small>
              </span>
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void saveConsent()}
            >
              Save my choices →
            </button>
            <p className="muted">New choices apply to your next session.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  detail,
  color,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  color: string;
}) {
  return (
    <div className={"stat-card " + color}>
      <span className="stat-label">{label}</span>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-flower">✳</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function RepList({ reps }: { reps: Rep[] }) {
  return (
    <div className="rep-list">
      {reps.map((rep) => (
        <div className="rep-row" key={rep.id}>
          <span className="exercise-symbol">
            {rep.exercise === "squat" ? "↧" : "↟"}
          </span>
          <div>
            <strong>{EXERCISES[rep.exercise].name}</strong>
            <small>
              {rep.exercise_day} · {Math.round(rep.confidence * 100)}%
              confidence
            </small>
            <p>{rep.feedback}</p>
          </div>
          <span className={"badge " + rep.label}>
            {rep.label === "correct"
              ? "Accepted"
              : rep.label === "incorrect"
                ? "Adjustment"
                : "Pending review"}
          </span>
        </div>
      ))}
    </div>
  );
}
function MovementIllustration({
  exercise,
}: {
  exercise: Prescription["exercise"];
}) {
  return (
    <svg viewBox="0 0 240 200" aria-label={EXERCISES[exercise].name} role="img">
      <ellipse
        cx="123"
        cy="176"
        rx="75"
        ry="9"
        fill="currentColor"
        opacity=".08"
      />
      <path
        d="M42 166h154"
        stroke="currentColor"
        opacity=".15"
        strokeDasharray="3 5"
      />
      <circle
        cx={exercise === "squat" ? 135 : 120}
        cy={exercise === "squat" ? 42 : 38}
        r="13"
        fill="#f0ae8c"
      />
      {exercise === "squat" ? (
        <>
          <path
            d="M130 61l-28 49 38 21-22 34"
            fill="none"
            stroke="#426255"
            strokeWidth="19"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M103 109l-31 20 17 36"
            fill="none"
            stroke="#6d8777"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M126 69l30 22 26-7"
            fill="none"
            stroke="#f0ae8c"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M83 168h21m6 0h25"
            stroke="#293d36"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path
            d="M120 61v58m0 0-22 45m22-45 22 45"
            fill="none"
            stroke="#4d6258"
            strokeWidth="17"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M113 70 76 65 48 60m79 10 37-5 28-5"
            fill="none"
            stroke="#f0ae8c"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M87 168h19m27 0h20"
            stroke="#293d36"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M50 90q-6-14 0-28m140 28q6-14 0-28"
            stroke="#b97a5a"
            strokeWidth="2"
            fill="none"
            strokeDasharray="4 4"
          />
        </>
      )}
      <circle cx="191" cy="35" r="20" fill="#fff" opacity=".55" />
      <path
        d="m183 35 6 6 10-12"
        fill="none"
        stroke="#52735f"
        strokeWidth="2"
      />
    </svg>
  );
}
function PrescriptionForm({
  patients,
  busy,
  onSubmit,
}: {
  patients: NonNullable<Overview["patients"]>;
  busy: boolean;
  onSubmit: (body: object) => Promise<void>;
}) {
  return (
    <form
      className="prescription-form"
      onSubmit={(event) => {
        event.preventDefault();
        const d = new FormData(event.currentTarget);
        void onSubmit({
          patient_id: d.get("patient_id"),
          exercise: d.get("exercise"),
          daily_target: Number(d.get("daily_target")),
          starts_on: d.get("starts_on"),
          ends_on: d.get("ends_on"),
          instructions: d.get("instructions"),
          confidence_threshold: Number(d.get("confidence_threshold")),
        });
      }}
    >
      <label>
        Patient
        <select name="patient_id" required disabled={!patients.length}>
          {patients.map((p) => (
            <option value={p.patient_id} key={p.patient_id}>
              {p.care_profiles.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Exercise
        <select name="exercise">
          <option value="squat">Bodyweight squat</option>
          <option value="shoulder_abduction">Shoulder abduction</option>
        </select>
      </label>
      <label>
        Daily target
        <input
          name="daily_target"
          type="number"
          min={1}
          max={200}
          defaultValue={10}
          required
        />
      </label>
      <label>
        Start date
        <input
          name="starts_on"
          type="date"
          defaultValue={localDay()}
          required
        />
      </label>
      <label>
        End date
        <input name="ends_on" type="date" min={localDay()} required />
      </label>
      <label>
        Confidence threshold
        <input
          name="confidence_threshold"
          type="number"
          min={0.6}
          max={0.99}
          step={0.01}
          defaultValue={0.8}
          required
        />
      </label>
      <label className="full-width">
        Movement cue
        <input
          name="instructions"
          maxLength={2000}
          placeholder="Your prescribed range and setup cue"
        />
      </label>
      <button className="primary" disabled={busy || !patients.length}>
        Save prescription →
      </button>
    </form>
  );
}
