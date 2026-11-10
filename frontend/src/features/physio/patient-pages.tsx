import { Icon } from "@/features/ui/icons";
import { Empty, Stat } from "./app-shell";
import { DemoVideo, MovementIllustration } from "./exercise-media";
import { ExerciseSteps } from "./exercise-steps";
import type { CustomExercise, exerciseInfo } from "./movement";
import { RepClip, RepList, type Replay, type ReplaySource } from "./rep-list";
import type { Prescription, Profile, Rep, Review } from "./types";

type Info = (item: Parameters<typeof exerciseInfo>[0]) => ReturnType<typeof exerciseInfo>;

export function TodayPage({
  profile,
  accepted,
  target,
  plans,
  pending,
  load,
  todayReps,
  info,
  demoVideoUrls,
  demoVideoFor,
  busy,
  start,
  reviews,
  openPage,
}: {
  profile: Profile | undefined;
  accepted: number;
  target: number;
  plans: Prescription[];
  pending: number;
  load: () => Promise<void>;
  todayReps: Rep[];
  info: Info;
  demoVideoUrls: Record<string, string>;
  demoVideoFor: (customId: string) => Promise<void>;
  busy: boolean;
  start: (plan: Prescription) => Promise<void>;
  reviews: Review[];
  openPage: (next: string) => Promise<void>;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A little better, every day</span>
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
          value={String(accepted)}
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
          value={String(plans.length)}
          detail="Move at a comfortable pace"
          color="cream"
        />
        <Stat
          label="Waiting for a closer look"
          value={String(pending)}
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
            // Exercises still to do come first; finished ones move to the end.
            plans
              .map((plan) => {
                const count = todayReps.filter(
                  (r) =>
                    r.prescription_id === plan.id &&
                    r.label === "correct",
                ).length;
                return {
                  plan,
                  count,
                  done: count >= plan.daily_target,
                };
              })
              .sort((a, b) => Number(a.done) - Number(b.done))
              .map(({ plan, count, done }, i) => {
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
                        {info(plan).focus}
                      </span>
                      <h3>{info(plan).name}</h3>
                      <p>
                        {plan.instructions ||
                          (plan.exercise === "squat"
                            ? "Build a steady foundation, one controlled movement at a time."
                            : plan.exercise === "custom"
                              ? info(plan).instruction
                              : "Find a little more freedom in every comfortable reach.")}
                      </p>
                      <ExerciseSteps steps={info(plan).steps} />
                      {plan.custom_exercise_id && (
                        <DemoVideo
                          url={demoVideoUrls[plan.custom_exercise_id]}
                          custom={info(plan).custom}
                          onOpen={() =>
                            demoVideoFor(plan.custom_exercise_id!)
                          }
                          name={info(plan).name}
                        />
                      )}
                      <div className="exercise-progress">
                        <span>
                          {count}{" "}
                          <span className="muted">
                            / {plan.daily_target} reps
                          </span>
                        </span>
                        <span>
                          {done
                            ? "Daily target reached"
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
                          (done ? "secondary" : "primary") +
                          " start-exercise"
                        }
                        disabled={busy}
                        onClick={() => void start(plan)}
                      >
                        {done ? "Practice again" : "Start exercise"}
                      </button>
                    </div>
                  </article>
                );
              })
          )}
        </section>
        <aside>
          <div className="panel note-panel">
            <span className="eyebrow">A note for your journey</span>
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
                  See all feedback
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
        <Icon name="info" />
        <p>
          <strong>Move with care.</strong> Stop if you feel pain.
          PhysioTrace supports your therapist’s care and does not
          replace it.
        </p>
      </div>
    </>
  );
}

export function HistoryPage({
  history,
  customs,
  loadRepReplay,
  historyVideos,
  moreHistory,
  busy,
  onLoadMore,
}: {
  history: Rep[];
  customs: CustomExercise[];
  loadRepReplay: (rep: ReplaySource) => Promise<Replay>;
  historyVideos: Set<string>;
  moreHistory: boolean;
  busy: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Every step forward</span>
          <h1>Your movement history</h1>
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
          <RepList
            reps={history}
            customs={customs}
            loadReplay={loadRepReplay}
            videoIds={historyVideos}
          />
        )}
        {moreHistory && (
          <button
            className="secondary"
            disabled={busy}
            onClick={onLoadMore}
          >
            Load more
          </button>
        )}
      </div>
    </>
  );
}

export function FeedbackPage({
  reviews,
  reps,
  loadRepReplay,
}: {
  reviews: Review[];
  reps: Rep[];
  loadRepReplay: (rep: ReplaySource) => Promise<Replay>;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Care that stays connected</span>
          <h1>A little guidance goes a long way</h1>
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
              <RepClip
                load={() =>
                  loadRepReplay(
                    reps.find((r) => r.id === review.rep_id) ?? {
                      id: review.rep_id,
                    },
                  )
                }
              />
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
  );
}
