import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { withInventoryTransaction } from "@/modules/inventory/server/service";
import { AppError } from "./errors";

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MINUTES ?? 15) * 60_000;
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX_ATTEMPTS ?? 5);

// Account-wide: changing business or spoofing a forwarded IP cannot reset the limit.
export function loginThrottleKey(email: string) {
  return createHash("sha256").update(`account:${email.trim().toLowerCase()}`).digest("hex");
}

export async function assertLoginAllowed(keyHash: string) {
  await withInventoryTransaction(async (tx) => {
    const now = new Date();
    await tx.loginThrottle.upsert({ where: { keyHash }, create: { keyHash, attempts: 0, windowStartedAt: now }, update: {} });
    await tx.loginThrottle.updateMany({ where: { keyHash, windowStartedAt: { lte: new Date(now.getTime() - WINDOW_MS) } }, data: { attempts: 0, windowStartedAt: now, blockedUntil: null } });
    const reserved = await tx.loginThrottle.updateMany({ where: { keyHash, attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
    if (!reserved.count) throw new AppError("LOGIN_RATE_LIMITED", 429, "Demasiados intentos. Espera unos minutos antes de volver a ingresar.");
  });
}

// Attempts are reserved before checking the password, including concurrent requests.
export async function clearLoginFailures(keyHash: string) {
  await prisma.loginThrottle.deleteMany({ where: { keyHash } });
}
