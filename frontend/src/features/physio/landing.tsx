import Link from "next/link";
import { Brand, Icon } from "@/features/ui/icons";

export function Landing() {
  return (
    <div className="landing">
      <header>
        <Brand />
        <nav aria-label="Account">
          <Link href="/login">Sign in</Link>
          <Link className="primary" href="/signup">
            Get started
          </Link>
        </nav>
      </header>
      <main className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">Small moves. Real progress.</span>
          <h1>
            Recovery, at
            <br />
            <em>your pace.</em>
          </h1>
          <p>
            A little guidance for every repetition. Practice your prescribed
            exercises with private, on-device movement feedback and your
            physical therapist close by.
          </p>
          <div className="landing-actions">
            <Link className="primary" href="/demo">
              Explore the demo
            </Link>
            <Link className="secondary" href="/login">
              Open my care plan
            </Link>
          </div>
        </div>
        {/* A still of the live session: camera, tracked pose, and the rep result. */}
        <figure className="landing-figure" aria-hidden="true">
          <div className="camera-stage">
            <svg className="landing-skeleton" viewBox="0 0 400 300">
              <circle className="head" cx="214" cy="66" r="15" />
              <path d="M206 96 168 168l58 18-10 58 26 2M206 96l40 18 40-4" />
              <circle cx="206" cy="96" r="6" />
              <circle cx="168" cy="168" r="6" />
              <circle cx="226" cy="186" r="6" />
              <circle cx="216" cy="244" r="6" />
              <circle cx="246" cy="114" r="6" />
              <circle cx="286" cy="110" r="6" />
            </svg>
            <span className="camera-chip">
              <span className="status-dot" /> On-device pose tracking
            </span>
          </div>
          <div className="feedback-banner tone-correct">
            <span className="feedback-icon">
              <Icon name="check" />
            </span>
            <div>
              <strong>Rep counted. Keep your pace.</strong>
              <p>7 of 10 reps today</p>
            </div>
          </div>
        </figure>
        <div className="landing-details">
          <span>
            01 <strong>Move comfortably.</strong>
            <small>Camera guidance stays on your device.</small>
          </span>
          <span>
            02 <strong>Get a little feedback.</strong>
            <small>Clear cues for your next repetition.</small>
          </span>
          <span>
            03 <strong>Stay connected.</strong>
            <small>Your therapist reviews uncertain reps.</small>
          </span>
        </div>
        <p className="safety-note">
          Stop if you feel pain. PhysioTrace supports physical therapy care and
          does not replace your therapist. The rule-based baseline is a
          prototype, not a clinical assessment.
        </p>
      </main>
    </div>
  );
}
