// Calls the FastAPI backend with the user's Supabase access token.
// A stuck or stopped API must surface as an error, not an endless loading screen,
// so every call has a timeout (longer for video uploads).
export async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const timeoutMs = init.body instanceof Blob ? 120_000 : 20_000;
  let res: Response;
  try {
    res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error(
        "The PhysioTrace API did not respond. Check that the backend is running (./scripts/dev.sh), then retry.",
      );
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      `Could not reach the PhysioTrace API at ${process.env.NEXT_PUBLIC_API_URL}. Start the backend (./scripts/dev.sh), then retry.`,
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API returned ${res.status}`);
  }
  return res.json();
}
