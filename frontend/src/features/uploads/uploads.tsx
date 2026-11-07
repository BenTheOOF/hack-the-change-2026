"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Files live at <user id>/<file name> in the private "uploads" bucket.
export function Uploads({ userId }: { userId: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await createClient().storage.from("uploads").list(userId);
    if (error) setError(error.message);
    else setFiles((data ?? []).map((f) => f.name));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload(form: FormData) {
    const file = form.get("file") as File;
    const { error } = await createClient()
      .storage.from("uploads")
      .upload(`${userId}/${file.name}`, file, { upsert: true });
    setError(error?.message ?? "");
    refresh();
  }

  // The bucket is private, so a download link needs a short-lived signed URL.
  async function open(name: string) {
    const { data, error } = await createClient().storage.from("uploads").createSignedUrl(`${userId}/${name}`, 60);
    if (error) setError(error.message);
    else window.open(data.signedUrl);
  }

  return (
    <section>
      <form action={upload}>
        <input name="file" type="file" required />
        <button>Upload</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {files.map((name) => (
          <li key={name}>
            <button onClick={() => open(name)}>{name}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
