import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 turns the POST into a GET on /login.
  return NextResponse.redirect(new URL("/login", siteOrigin(request.headers)), 303);
}
