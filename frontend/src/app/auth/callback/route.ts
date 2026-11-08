import type { NextRequest } from "next/server";
import { sameHostRedirect } from "@/lib/same-host-redirect";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after Google sign-in. Exchange the one-time code for a
// session cookie, then open the care plan on the same host, where the cookie lives.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  let message =
    params.get("error_description") ??
    params.get("error") ??
    "Google sign-in did not finish. Please try again.";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return sameHostRedirect("/dashboard");
    message = error.message;
  }
  return sameHostRedirect(`/login?error=${encodeURIComponent(message)}`);
}
