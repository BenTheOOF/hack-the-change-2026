"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Note = { id: string; body: string; created_at: string };

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    // Subscribe first, then load, so no insert falls in the gap. Rows are de-duplicated by id.
    const add = (rows: Note[]) =>
      setNotes((old) => {
        const seen = new Set(old.map((n) => n.id));
        const merged = [...old, ...rows.filter((r) => !seen.has(r.id))];
        return merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
      });

    const channel = supabase
      .channel("notes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, (p) => add([p.new as Note]))
      .subscribe();
    supabase
      .from("notes")
      .select("id, body, created_at")
      .then(({ data, error }) => (error ? setError(error.message) : add(data ?? [])));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function addNote(form: FormData) {
    const { error } = await createClient().from("notes").insert({ body: String(form.get("body")) });
    if (error) setError(error.message);
  }

  return (
    <section>
      <h2>Notes (live)</h2>
      <form action={addNote}>
        <input name="body" placeholder="Write a note" required />
        <button>Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id}>{n.body}</li>
        ))}
      </ul>
    </section>
  );
}
