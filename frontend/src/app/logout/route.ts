import { sameHostRedirect } from "@/lib/same-host-redirect";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 turns the POST into a GET on /login.
  return sameHostRedirect("/login", 303);
}
