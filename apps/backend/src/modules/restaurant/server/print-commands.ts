import "server-only";
import { z } from "zod";
import type { TenantScope } from "@/core/auth/types";
import { parseInput } from "@/core/validation/parse-input";
import { changePrintDelivery, listPrintJobs } from "@/modules/printing/server/service";

const attemptSchema = z.object({ attempt: z.number().int().min(0) });
const stationSchema = z.object({ stationId: z.string().trim().min(8).max(100) });
const statusSchema = stationSchema.extend({ attempt: z.number().int().positive(), status: z.enum(["PRINTED", "FAILED", "UNKNOWN"]), confirmed: z.boolean().optional(), error: z.string().trim().max(300).optional() });

export async function handleRestaurantPrintCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [, id, action] = segments;
  if (method === "GET") {
    const jobs = await listPrintJobs({ ...scope, printerId: id });
    return { jobs: jobs.map((job) => ({ id: job.id, printerId: job.printerId, preparationAreaId: job.preparationAreaId, type: job.type, status: job.status, claimable: job.claimable, automatic: job.automatic, copies: job.copies, attempts: job.attempts, lastError: job.lastError, stationId: job.stationId, leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null, printedAt: job.printedAt?.toISOString() ?? null, createdAt: job.createdAt.toISOString(), order: { code: job.order?.code ?? "PRUEBA", source: job.order?.source ?? "TEST", notes: job.order?.notes ?? null, tableName: job.order?.table?.name ?? null }, createdBy: job.createdBy.name, payload: (() => { try { return JSON.parse(job.payload); } catch { return { items: [] }; } })() })) };
  }
  if (!id) return null;
  if (method === "POST" && action === "claim") {
    const input = parseInput(stationSchema, body);
    return { ok: true, ...await changePrintDelivery(scope, id, { kind: "claim", stationId: input.stationId, leaseMs: 600_000 }) };
  }
  if (method === "PATCH" && action === "status") {
    const input = parseInput(statusSchema, body);
    await changePrintDelivery(scope, id, { kind: "complete", ...input });
    return { ok: true, message: input.status === "PRINTED" ? "Comanda marcada como impresa." : "Resultado de impresión registrado." };
  }
  if (method === "POST" && action === "confirm-delivery") {
    const input = parseInput(attemptSchema.extend({ printed: z.boolean() }), body);
    await changePrintDelivery(scope, id, { kind: "confirm", ...input });
    return { ok: true };
  }
  if (method === "POST" && action === "retry") {
    const input = parseInput(attemptSchema, body);
    await changePrintDelivery(scope, id, { kind: "retry", ...input });
    return { ok: true, message: "Comanda enviada nuevamente a la estación de impresión." };
  }
  return null;
}
