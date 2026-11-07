"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function credentials(form: FormData) {
  return { email: String(form.get("email")), password: String(form.get("password")) };
}

export async function logIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(form));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(credentials(form));
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  // No session means email confirmation is still switched on in Supabase.
  if (!data.session) redirect("/login?error=Check%20your%20email%20to%20confirm%20your%20account");
  redirect("/dashboard");
}
