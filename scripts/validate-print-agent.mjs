import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const token = randomBytes(32).toString("base64url");
let printerId = null;
let jobId = null;

try {
  const branch = await prisma.branch.findFirst({ select: { id: true, tenantId: true, memberships: { where: { active: true }, take: 1, select: { userId: true } } } });
  if (!branch || !branch.memberships[0]) throw new Error("No existe una sede con usuario para validar el agente.");
  const printer = await prisma.printDevice.create({ data: { tenantId: branch.tenantId, branchId: branch.id, name: `agent-validation-${Date.now()}`, tokenHash: createHash("sha256").update(token).digest("hex"), tokenHint: token.slice(-6) } });
  printerId = printer.id;
  const response = await fetch("https://backend-production-e144.up.railway.app/api/print-agent/heartbeat", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  const payload = await response.json();
  const connected = response.ok && payload?.ok === true && payload?.printer?.id === printer.id;
  if (!connected) throw new Error("El agente no pudo autenticarse en producción.");
  const job = await prisma.restaurantPrintJob.create({ data: { tenantId: branch.tenantId, branchId: branch.id, orderId: null, createdById: branch.memberships[0].userId, printerId: printer.id, type: "TEST", payload: JSON.stringify({ items: [{ name: "VALIDACIÓN AGENTE", quantity: 1, notes: null }] }) } });
  jobId = job.id;
  const nextResponse = await fetch("https://backend-production-e144.up.railway.app/api/print-agent/jobs/next", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  const nextPayload = await nextResponse.json();
  if (!nextResponse.ok || nextPayload?.job?.id !== job.id) throw new Error("El agente no recibió su trabajo asignado.");
  const ackResponse = await fetch(`https://backend-production-e144.up.railway.app/api/print-agent/jobs/${job.id}/status`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "PRINTED" }) });
  const printed = await prisma.restaurantPrintJob.findUnique({ where: { id: job.id }, select: { status: true, printedAt: true } });
  if (!ackResponse.ok || printed?.status !== "PRINTED" || !printed.printedAt) throw new Error("El agente no confirmó la impresión.");
  console.log(JSON.stringify({ authenticated: true, heartbeat: true, printerMatched: true, jobClaimed: true, acknowledgment: true }));
} finally {
  if (jobId) await prisma.restaurantPrintJob.deleteMany({ where: { id: jobId, type: "TEST" } });
  if (printerId) await prisma.printDevice.deleteMany({ where: { id: printerId, name: { startsWith: "agent-validation-" } } });
  await prisma.$disconnect();
}
