import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Uploads } from "@/features/uploads/uploads";

export default async function UploadsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <main className="simple-page">
      <p>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
      <div className="panel">
        <h1>Files</h1>
        <Uploads userId={data.claims.sub} />
      </div>
    </main>
  );
}
