import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Uploads } from "@/features/uploads/uploads";

export default async function UploadsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <main>
      <h1>Files</h1>
      <p>
        <Link href="/dashboard">Back</Link>
      </p>
      <Uploads userId={data.claims.sub} />
    </main>
  );
}
