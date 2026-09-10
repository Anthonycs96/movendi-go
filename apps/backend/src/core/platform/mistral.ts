import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
function key() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new AppError("INTEGRATION_KEY_MISSING", 503, "Falta la clave de cifrado de integraciones del servidor.");
  return createHash("sha256").update(secret).digest();
}
export async function getMistralKey() {
  const record = await prisma.platformIntegration.findUnique({ where: { provider: "MISTRAL" } });
  if (!record) return process.env.MISTRAL_API_KEY?.trim() || null;
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(record.iv, "base64")); cipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return Buffer.concat([cipher.update(Buffer.from(record.encryptedToken, "base64")), cipher.final()]).toString("utf8");
}
export async function mistralStatus() {
  const record = await prisma.platformIntegration.findUnique({ where: { provider: "MISTRAL" }, select: { tokenHint: true, lastTestedAt: true, updatedAt: true } });
  return { configured: Boolean(record || process.env.MISTRAL_API_KEY), tokenHint: record?.tokenHint ?? "", lastTestedAt: record?.lastTestedAt ?? null, source: record ? "PLATFORM" : process.env.MISTRAL_API_KEY ? "ENVIRONMENT" : "NONE" };
}
export async function saveMistralKey(token: string, actorId: string) {
  key();
  const response = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new AppError("MISTRAL_AUTH", 400, `Mistral no validó la clave (HTTP ${response.status}). La clave anterior se conserva.`);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const data = { encryptedToken: encrypted.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), tokenHint: `••••${token.slice(-4)}`, updatedById: actorId, lastTestedAt: new Date() };
  await prisma.platformIntegration.upsert({ where: { provider: "MISTRAL" }, create: { provider: "MISTRAL", ...data }, update: data });
  return mistralStatus();
}
