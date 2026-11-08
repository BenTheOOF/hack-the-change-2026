import { NextResponse } from "next/server";

// A redirect with a relative Location header. The browser resolves it against
// the address it is already on, so the person stays on the host whose cookies
// were just set (www or not, any domain), and the internal address Next.js
// listens on behind a proxy (localhost:3000) never leaks into the URL.
// Cookies set through next/headers are added to this response by Next.js.
export function sameHostRedirect(path: string, status = 307) {
  return new NextResponse(null, { status, headers: { Location: path } });
}
