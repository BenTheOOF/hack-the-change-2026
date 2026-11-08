"use server";

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
