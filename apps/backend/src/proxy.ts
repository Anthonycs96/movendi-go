import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isUnsafeCrossOrigin } from "@/core/auth/request-origin";

const validRequestId = /^[a-zA-Z0-9._:-]{8,64}$/;

export function proxy(request: NextRequest) {
  if (isUnsafeCrossOrigin(request, [process.env.APP_PUBLIC_URL ?? ""])) return NextResponse.json({ error: { code: "ORIGIN_REJECTED", message: "La solicitud debe enviarse desde la aplicación." } }, { status: 403 });
  const candidate = request.headers.get("x-request-id") ?? "";
  const requestId = validRequestId.test(candidate) ? candidate : randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = { matcher: "/api/:path*" };
