import { NextRequest } from "next/server";
import { backendFetch } from "@/shared/lib/backend-fetch";

type Context = { params: Promise<{ path: string[] }> };
const apiOrigin = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

async function proxy(request: NextRequest, context: Context) {
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    let rejected = request.headers.get("sec-fetch-site") === "cross-site";
    try { if (origin && new URL(origin).host !== host) rejected = true; } catch { rejected = true; }
    if (rejected) return Response.json({ error: { code: "ORIGIN_REJECTED", message: "La solicitud debe enviarse desde la aplicación." } }, { status: 403 });
  }
  const { path } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, apiOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");
  // The upstream request has its own authority; do not carry the public host
  // into Next's URL reconstruction or its same-origin validation.
  for (const name of ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"]) headers.delete(name);
  headers.set("accept-encoding", "identity");
  // Browser origin was checked above. This server-to-server request has no
  // browser origin; TLS termination may give the upstream a different scheme.
  headers.delete("origin");
  headers.delete("sec-fetch-site");

  const upstream = await backendFetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });

  // Native fetch decodes compressed responses. Forwarding their original encoding
  // or length would make clients decompress plain JSON a second time.
  const responseHeaders = new Headers(upstream.headers);
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection"]) responseHeaders.delete(name);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
