import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { Chat } from "@/features/ai/chat";
import { Notes } from "@/features/notes/notes";

export default async function DashboardPage() {
  const supabase = await createClient();
  // proxy.ts already checked and refreshed the session. We only forward the token, and the API verifies it.
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");

  let me = "";
  try {
    me = JSON.stringify(await apiFetch("/me", data.session.access_token));
  } catch (e) {
    me = `Could not reach the API: ${e instanceof Error ? e.message : e}`;
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>API says: <code>{me}</code></p>
      <p>
        <Link href="/dashboard/uploads">Files</Link>
      </p>
      <form action="/logout" method="post">
        <button>Log out</button>
      </form>
      <Notes />
      <Chat />
    </main>
  );
}
