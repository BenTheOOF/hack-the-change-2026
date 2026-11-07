import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Hackathon starter</h1>
      <p>
        <Link href="/signup">Sign up</Link> · <Link href="/login">Log in</Link> · <Link href="/dashboard">Dashboard</Link>
      </p>
    </main>
  );
}
