import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { AppError } from "./errors";

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MINUTES ?? 15) * 60_000;
const BLOCK_MS = Number(process.env.LOGIN_RATE_BLOCK_MINUTES ?? 15) * 60_000;
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX_ATTEMPTS ?? 5);

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "direct";
}

export function loginThrottleKey(request: Request, email: string, businessSlug: string) {
  return createHash("sha256").update(`${clientAddress(request)}|${email}|${businessSlug}`).digest("hex");
}

export async function assertLoginAllowed(keyHash: string) {
  const throttle = await prisma.loginThrottle.findUnique({ where: { keyHash } });
  if (!throttle?.blockedUntil || throttle.blockedUntil <= new Date()) return;
  const retryAfterSeconds = Math.max(1, Math.ceil((throttle.blockedUntil.getTime() - Date.now()) / 1000));
  throw new AppError("LOGIN_RATE_LIMITED", 429, "Demasiados intentos. Espera unos minutos antes de volver a ingresar.", { retryAfterSeconds });
}

export async function recordLoginFailure(keyHash: string) {
  const now = new Date();
  const throttle = await prisma.loginThrottle.findUnique({ where: { keyHash } });
  const outsideWindow = !throttle || now.getTime() - throttle.windowStartedAt.getTime() >= WINDOW_MS;
  const attempts = outsideWindow ? 1 : throttle.attempts + 1;
  const blockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null;
  await prisma.loginThrottle.upsert({
    where: { keyHash },
    create: { keyHash, attempts, windowStartedAt: now, blockedUntil },
    update: { attempts, windowStartedAt: outsideWindow ? now : throttle.windowStartedAt, blockedUntil },
  });
}

export async function clearLoginFailures(keyHash: string) {
  await prisma.loginThrottle.deleteMany({ where: { keyHash } });
}
