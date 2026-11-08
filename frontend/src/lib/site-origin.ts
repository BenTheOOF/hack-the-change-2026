// The public address the browser is on, for the Google sign-in return URL.
//
// Supabase sends the person back to this address, and the PKCE code verifier
// cookie only exists on the host where they clicked "Continue with Google", so
// the browser's own Origin header (always sent with a server action) comes
// first. SITE_URL in the root .env is a fallback for requests without one; the
// proxy's Host and X-Forwarded-Proto headers come last. `request.url` is never
// used: behind a proxy it names the internal address (localhost:3000).
export function siteOrigin(head: Headers): string {
  const origin = head.get("origin");
  if (origin && origin !== "null") return origin;
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = head.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto =
    head.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (local ? "http" : "https");
  return `${proto}://${host}`;
}
