import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the session cookie on every request and sends signed-out visitors away from /dashboard.
// Redirects use request.url: Next.js turns same-origin proxy redirects into
// relative ones, so they stay on whatever host the browser is on.
export async function updateSession(request: NextRequest) {
  // When /auth/callback is missing from Supabase's Redirect URLs, Supabase sends
  // the person to the Site URL with the sign-in code instead. Finish the sign-in
  // rather than leaving them signed out on the home page.
  const { pathname, search, searchParams } = request.nextUrl;
  if (searchParams.has("code") && !pathname.startsWith("/auth/")) {
    return NextResponse.redirect(new URL("/auth/callback" + search, request.url));
  }
  let response = NextResponse.next({ request });
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(
        new URL(
          "/login?error=Connect%20Supabase%20to%20open%20your%20saved%20care%20plan",
          request.url,
        ),
      );
    }
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && request.nextUrl.pathname.startsWith("/dashboard")) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Keep any cookies the refresh just set.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
