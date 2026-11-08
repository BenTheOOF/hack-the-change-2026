import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after Google sign-in. Exchange the one-time code for a
// session cookie, then open the care plan.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Not url.origin: behind a proxy that is the internal address (localhost:3000).
  const origin = siteOrigin(request.headers);
  const code = url.searchParams.get("code");
  let message =
    url.searchParams.get("error_description") ??
    url.searchParams.get("error") ??
    "Google sign-in did not finish. Please try again.";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/dashboard", origin));
    message = error.message;
  }
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, origin),
  );
}
