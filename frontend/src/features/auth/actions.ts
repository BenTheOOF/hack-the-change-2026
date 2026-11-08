"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function credentials(form: FormData) {
  return {
    email: String(form.get("email")),
    password: String(form.get("password")),
  };
}

export async function logIn(form: FormData) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    redirect(
      "/login?error=Configure%20Supabase%20in%20the%20root%20.env%20first",
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(form));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(form: FormData) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    redirect(
      "/signup?error=Configure%20Supabase%20in%20the%20root%20.env%20first",
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials(form),
    options: {
      data: {
        display_name: String(form.get("display_name") ?? "")
          .trim()
          .slice(0, 100),
      },
    },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  // No session means email confirmation is still switched on in Supabase.
  if (!data.session)
    redirect(
      "/login?error=Check%20your%20email%20to%20confirm%20your%20account",
    );
  redirect("/dashboard");
}

// Google sign-in through Supabase Auth (PKCE). Supabase sends the user back to
// /auth/callback, which exchanges the code for a session. New Google accounts
// start as patients, like every other sign-up.
export async function googleSignIn() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    redirect(
      "/login?error=Configure%20Supabase%20in%20the%20root%20.env%20first",
    );
  }
  const head = await headers();
  const origin =
    head.get("origin") ??
    `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url)
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? "Google sign-in is not available. Enable the Google provider in Supabase.")}`,
    );
  redirect(data.url);
}
