import Link from "next/link";
import { googleSignIn } from "./actions";

type Props = {
  title: string;
  action: (form: FormData) => Promise<void>;
  error?: string;
  switchText: string;
  switchHref: string;
};

export function AuthForm({
  title,
  action,
  error,
  switchText,
  switchHref,
}: Props) {
  return (
    <main className="auth-page panel">
      <Link className="brand" href="/">
        ⌁ physiotrace
      </Link>
      <h1>{title}</h1>
      {error && <p role="alert">{error}</p>}
      <form action={googleSignIn}>
        <button className="google-button" type="submit">
          <svg viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>
      </form>
      <div className="auth-divider" role="separator">
        <span>or use your email</span>
      </div>
      <form action={action}>
        {title === "Sign up" && (
          <label>
            Your name
            <input
              name="display_name"
              autoComplete="name"
              maxLength={100}
              required
            />
          </label>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete={
              title === "Sign up" ? "new-password" : "current-password"
            }
            minLength={8}
            required
          />
        </label>
        <button className="primary">{title} →</button>
      </form>
      <p>
        <Link href={switchHref}>{switchText}</Link>
      </p>
      <p className="muted">
        New accounts are patients. Therapist access is assigned by a care
        administrator.
      </p>
      <Link href="/demo">Explore without an account ↗</Link>
    </main>
  );
}
