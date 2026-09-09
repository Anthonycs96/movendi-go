export function isUnsafeCrossOrigin(request: Request, allowedOrigins: string[] = []) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false; // Non-browser API clients still authenticate at the route.
  try {
    const actual = new URL(request.url);
    // Next normalizes loopback names in NextRequest.url. The HTTP authority
    // retains the exact browser/upstream host, including its port.
    const host = request.headers.get("host");
    if (host) actual.host = host;
    const allowed = [actual.origin, ...allowedOrigins.filter(Boolean).map((value) => new URL(value).origin)];
    return !allowed.includes(new URL(origin).origin);
  } catch { return true; }
}
