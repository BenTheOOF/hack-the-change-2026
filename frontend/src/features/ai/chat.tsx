"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function Chat() {
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  async function send(form: FormData) {
    setError("");
    setReply("");
    const { data } = await createClient().auth.getSession();
    // Runs in the browser, so this call also tests CORS.
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ message: String(form.get("message")) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `API returned ${res.status}`);
      setReply(body.reply);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <section>
      <h2>Ask the LLM</h2>
      <form action={send}>
        <input name="message" placeholder="Say something" required />
        <button>Send</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {reply && <p>{reply}</p>}
    </section>
  );
}
