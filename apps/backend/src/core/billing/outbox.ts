import "server-only";
import { prisma } from "@/core/database/prisma";
import { logEvent } from "@/core/observability/logging";

export type EmailProviderName = "log" | "webhook" | "disabled";

export function emailConfiguration() {
  const production = process.env.NODE_ENV === "production";
  const provider = (process.env.EMAIL_PROVIDER?.toLowerCase() || (production ? "disabled" : "log")) as EmailProviderName;
  return {
    provider,
    configured: provider === "log" ? !production || process.env.ALLOW_LOG_EMAIL === "true" : provider === "webhook" ? Boolean(process.env.EMAIL_WEBHOOK_URL) : false,
  };
}

async function deliverEmail(message: { id: string; recipient: string; template: string; subject: string; payload: string }) {
  const configuration = emailConfiguration();
  if (!configuration.configured) throw new Error("El proveedor de correo no está configurado.");
  if (configuration.provider === "log") {
    logEvent("info", "email_outbox_delivered", { outboxId: message.id, recipient: message.recipient, template: message.template });
    return;
  }
  const response = await fetch(process.env.EMAIL_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ id: message.id, to: message.recipient, template: message.template, subject: message.subject, data: JSON.parse(message.payload) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`El proveedor de correo respondió ${response.status}.`);
}

export async function processEmailOutbox(now = new Date(), limit = 20) {
  const queued = await prisma.emailOutbox.findMany({ where: { status: "QUEUED", availableAt: { lte: now }, attempts: { lt: 5 } }, orderBy: { createdAt: "asc" }, take: limit });
  let sent = 0;
  let failed = 0;
  for (const message of queued) {
    const claimed = await prisma.emailOutbox.updateMany({ where: { id: message.id, status: "QUEUED" }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      await deliverEmail(message);
      await prisma.emailOutbox.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      sent += 1;
    } catch (error) {
      const attempts = message.attempts + 1;
      const terminal = attempts >= 5;
      await prisma.emailOutbox.update({ where: { id: message.id }, data: { status: terminal ? "FAILED" : "QUEUED", availableAt: new Date(Date.now() + Math.min(3600, 30 * (2 ** attempts)) * 1000), lastError: error instanceof Error ? error.message.slice(0, 500) : "Error desconocido" } });
      failed += 1;
    }
  }
  return { selected: queued.length, sent, failed };
}
