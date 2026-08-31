import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const validRequestId = /^[a-zA-Z0-9._:-]{8,64}$/;

export function proxy(request: NextRequest) {
  const candidate = request.headers.get("x-request-id") ?? "";
  const requestId = validRequestId.test(candidate) ? candidate : randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = { matcher: "/api/:path*" };
