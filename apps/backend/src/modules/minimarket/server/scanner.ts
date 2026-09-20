import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, RetailScannerConnection } from "@prisma/client";
import type { AuthSession, TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { getSessionById } from "@/core/auth/session";
import { withSerializableTransaction } from "@/core/database/transactions";
import { assertMinimarketAccess } from "./access";
import { assertRetailCash } from "./cash-access";
import { scoped } from "./service";

const secret = z.string().regex(/^[a-zA-Z0-9_-]{32,100}$/);
const id = z.string().min(1).max(120);
const credentials = { connectionId: id, receiverToken: secret };
const cartSummarySchema = z.object({ units: z.number().finite().min(0).max(1e9), totalCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/), verified: z.boolean() });
export const scannerReceiverSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), cashSessionId: id, receiverToken: secret, pairingToken: secret, cartIntentId: id }),
  z.object({ action: z.literal("poll"), ...credentials, cartIntentId: id, accepting: z.boolean(), cartSummary: cartSummarySchema.nullable().optional() }),
  z.object({ action: z.literal("ack"), ...credentials, sequence: z.number().int().positive(), status: z.enum(["ADDED", "REJECTED"]), message: z.string().max(200) }),
  z.object({ action: z.literal("disconnect"), ...credentials }),
  z.object({ action: z.literal("reset"), cashSessionId: id }),
]);
export const scannerSenderSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pair"), connectionId: id, pairingToken: secret, senderToken: secret }),
  z.object({ action: z.literal("status"), connectionId: id, senderToken: secret, requestId: z.string().uuid().optional() }),
  z.object({ action: z.literal("scan"), connectionId: id, senderToken: secret, requestId: z.string().uuid(), barcode: z.string().trim().min(1).max(80) }),
]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const stopped = () => new AppError("SCANNER_DISCONNECTED", 410, "El vínculo terminó. Vuelve a vincular el celular desde la PC.");
const scopeOf = (session: AuthSession): TenantScope => ({ tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions });

async function active(tx: Prisma.TransactionClient, connection: RetailScannerConnection | null, session?: AuthSession) {
  if (!connection || connection.expiresAt <= new Date()) throw stopped();
  const owner = session ?? await getSessionById(connection.ownerSessionId);
  if (!owner || owner.sessionId !== connection.ownerSessionId || owner.tenantId !== connection.tenantId || owner.branchId !== connection.branchId || owner.userId !== connection.actorId || owner.mustChangePassword) throw stopped();
  assertMinimarketAccess(owner, "pos");
  const cash = await assertRetailCash(tx, scopeOf(owner), connection.cashSessionId);
  return { connection, cash, owner };
}
function ready(connection: RetailScannerConnection) { return connection.accepting && connection.receiverSeenAt.getTime() > Date.now() - 10_000; }
function view(connection: RetailScannerConnection, cash: { registerName: string }, owner: AuthSession) {
  const pcOnline = connection.receiverSeenAt.getTime() > Date.now() - 10_000;
  // Never use this display snapshot to authorize or price a sale, or expose stale totals.
  const cartSummary = pcOnline && connection.cartSummary ? cartSummarySchema.parse(JSON.parse(connection.cartSummary)) : null;
  return { connectionId: connection.id, registerName: cash.registerName, cashierName: owner.userName, branchName: owner.branchName, tenantName: owner.tenantName, accepting: ready(connection), cartSummary, paired: !!connection.senderHash, phoneOnline: !!connection.senderSeenAt && connection.senderSeenAt.getTime() > Date.now() - 15_000, expiresAt: connection.expiresAt.toISOString(), pairExpiresAt: connection.pairExpiresAt.toISOString() };
}

export async function receiverScanner(session: AuthSession, input: z.infer<typeof scannerReceiverSchema>) {
  assertMinimarketAccess(session, "pos");
  const scope = scopeOf(session);
  return withSerializableTransaction(async (tx) => {
    if (input.action === "reset") {
      await assertRetailCash(tx, scope, input.cashSessionId);
      await tx.retailScannerConnection.deleteMany({ where: { ...scoped(scope), cashSessionId: input.cashSessionId } });
      return { disconnected: true };
    }
    if (input.action === "connect") {
      const cash = await assertRetailCash(tx, scope, input.cashSessionId);
      const existing = await tx.retailScannerConnection.findUnique({ where: { cashSessionId: cash.id } });
      if (existing && existing.expiresAt > new Date()) {
        if (existing.receiverHash === hash(input.receiverToken) && existing.ownerSessionId === session.sessionId) return view(existing, cash, session);
        throw new AppError("SCANNER_IN_USE", 409, "Esta caja ya tiene una PC vinculada. Desconecta el escáner en esa PC antes de vincular otra.");
      }
      if (existing) await tx.retailScannerConnection.delete({ where: { id: existing.id } });
      const connection = await tx.retailScannerConnection.create({ data: { ...scoped(scope), actorId: scope.actorId, ownerSessionId: session.sessionId, cashSessionId: cash.id, receiverHash: hash(input.receiverToken), pairingHash: hash(input.pairingToken), cartIntentId: input.cartIntentId, receiverSeenAt: new Date(), pairExpiresAt: new Date(Date.now() + 5 * 60_000), expiresAt: new Date(Math.min(session.expiresAt.getTime(), Date.now() + 12 * 3_600_000)) } });
      return view(connection, cash, session);
    }
    const current = await tx.retailScannerConnection.findFirst({ where: { id: input.connectionId, ...scoped(scope), actorId: scope.actorId, ownerSessionId: session.sessionId, receiverHash: hash(input.receiverToken) } });
    if (!current) throw stopped();
    if (input.action === "disconnect") { await tx.retailScannerConnection.delete({ where: { id: current.id } }); return { disconnected: true }; }
    const { cash } = await active(tx, current, session);
    if (input.action === "ack") {
      await tx.retailScanEvent.updateMany({ where: { connectionId: current.id, sequence: input.sequence, status: "PENDING" }, data: { status: input.status, message: input.message } });
      return { acknowledged: true };
    }
    const connection = await tx.retailScannerConnection.update({ where: { id: current.id }, data: { receiverSeenAt: new Date(), accepting: input.accepting, cartIntentId: input.cartIntentId, cartSummary: input.cartSummary ? JSON.stringify(input.cartSummary) : null } });
    // The PC's durable cursor distinguishes an already added scan from a stale, unconsumed scan.
    const events = input.accepting ? await tx.retailScanEvent.findMany({ where: { connectionId: current.id, status: "PENDING" }, orderBy: { sequence: "asc" }, take: 20 }) : [];
    return { ...view(connection, cash, session), events: events.map(({ sequence, barcode, cartIntentId }) => ({ sequence, barcode, cartIntentId })) };
  });
}

export async function senderScanner(input: z.infer<typeof scannerSenderSchema>) {
  return withSerializableTransaction(async (tx) => {
    const current = await tx.retailScannerConnection.findUnique({ where: { id: input.connectionId } });
    if (!current) throw stopped();
    if (input.action === "pair") {
      if (current.pairingHash !== hash(input.pairingToken) || (current.senderHash !== hash(input.senderToken) && (current.senderHash || current.pairExpiresAt <= new Date()))) throw new AppError("PAIRING_EXPIRED", 403, "Este QR ya fue usado o venció. Genera otro vínculo desde la PC.");
    } else if (current.senderHash !== hash(input.senderToken)) throw stopped();
    const { cash, owner } = await active(tx, current);
    const connection = await tx.retailScannerConnection.update({ where: { id: current.id }, data: { senderSeenAt: new Date(), ...(input.action === "pair" ? { senderHash: hash(input.senderToken) } : {}) } });
    if (input.action === "scan") {
      const existing = await tx.retailScanEvent.findUnique({ where: { connectionId_requestId: { connectionId: current.id, requestId: input.requestId } } });
      if (existing) {
        if (existing.barcode !== input.barcode) throw new AppError("SCAN_CONFLICT", 409, "La lectura pendiente pertenece a otro código.");
        return { ...view(connection, cash, owner), event: { status: existing.status, message: existing.message } };
      }
      if (!ready(current)) throw new AppError("SCANNER_PAUSED", 409, "La PC no está recibiendo: vuelve a la venta y comprueba la conexión.");
      if (await tx.retailScanEvent.count({ where: { connectionId: current.id, status: "PENDING" } }) >= 20) throw new AppError("SCANNER_QUEUE_FULL", 409, "Espera a que la PC confirme las lecturas pendientes.");
      const event = await tx.retailScanEvent.create({ data: { connectionId: current.id, requestId: input.requestId, barcode: input.barcode, cartIntentId: current.cartIntentId } });
      return { ...view(connection, cash, owner), event: { status: event.status, message: event.message } };
    }
    const event = input.action === "status" && input.requestId ? await tx.retailScanEvent.findUnique({ where: { connectionId_requestId: { connectionId: current.id, requestId: input.requestId } } }) : null;
    return { ...view(connection, cash, owner), event: event ? { status: event.status, message: event.message } : null };
  });
}
