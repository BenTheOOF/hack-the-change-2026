import Link from "next/link";

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
