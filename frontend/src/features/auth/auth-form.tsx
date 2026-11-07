import Link from "next/link";

type Props = {
  title: string;
  action: (form: FormData) => Promise<void>;
  error?: string;
  switchText: string;
  switchHref: string;
};

export function AuthForm({ title, action, error, switchText, switchHref }: Props) {
  return (
    <main>
      <h1>{title}</h1>
      {error && <p role="alert">{error}</p>}
      <form action={action}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" minLength={6} required />
        <button>{title}</button>
      </form>
      <p>
        <Link href={switchHref}>{switchText}</Link>
      </p>
    </main>
  );
}
