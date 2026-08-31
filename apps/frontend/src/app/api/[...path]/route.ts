import { NextRequest } from "next/server";
import { backendFetch } from "@/shared/lib/backend-fetch";

type Context = { params: Promise<{ path: string[] }> };
const apiOrigin = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, apiOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await backendFetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
