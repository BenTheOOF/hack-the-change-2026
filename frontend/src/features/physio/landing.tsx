import Link from "next/link";

export function Landing() {
  return (
    <div className="landing">
      <header>
        <Link className="brand" href="/">
          <span className="brand-mark">⌁</span>physio
          <span className="brand-light">trace</span>
        </Link>
        <div>
          <Link href="/login">Sign in</Link>
          <Link className="primary" href="/signup">
            Get started ↗
          </Link>
        </div>
      </header>
      <main>
        <span className="eyebrow">SMALL MOVES. REAL PROGRESS.</span>
        <h1>
          Recovery, at
          <br />
          <em>your pace.</em>
        </h1>
        <p>
          A little guidance for every repetition. Practice your prescribed
          exercises with private, on-device movement feedback and your physical
          therapist close by.
        </p>
        <div className="landing-actions">
          <Link className="primary" href="/demo">
            Explore the demo ↗
          </Link>
          <Link className="secondary" href="/login">
            Open my care plan
          </Link>
        </div>
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
      <div className="landing-orbit" aria-hidden="true">
        <div className="orbit-ring" />
        <span className="orbit-flower">✳</span>
        <div className="orbit-note">
          <span className="status-dot" /> One comfortable rep at a time.
        </div>
      </div>
    </div>
  );
}
