// The address people use to reach the app, for auth redirects.
//
// Behind a reverse proxy, `request.url` in a route handler names the address
// Next.js listens on (for example https://localhost:3000), not the public
// domain, so redirects built from it send people to localhost. SITE_URL in the
// root .env wins; otherwise the proxy's Host and X-Forwarded-Proto headers are
// used, which Caddy and most proxies pass through.
export function siteOrigin(head: Headers): string {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = head.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto =
    head.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (local ? "http" : "https");
  return `${proto}://${host}`;
}
