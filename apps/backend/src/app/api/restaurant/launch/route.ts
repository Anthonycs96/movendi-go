import { withSerializableTransaction } from "@/core/database/transactions";
import { z } from "zod";
import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { launchData, updateLaunch, updateTicket } from "@/modules/restaurant/server/launch";

async function scope(write = false) {
  const session = await requireSession(write ? "restaurant:configuration:write" : "restaurant:configuration:read");
  if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Solo restaurantes.");
  assertRestaurantModule(session, "settings");
  if (write) await assertTenantWriteEntitlement(session.tenantId);
  return { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId };
}
export async function GET() { try { return Response.json(await launchData(await scope()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request) {
  try { const current = await scope(true); return Response.json(await updateLaunch(current, await request.json())); } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const current = await scope(true);
    const data = z.object({ subject: z.string().trim().min(5).max(160), details: z.string().trim().min(10).max(4000), priority: z.enum(["NORMAL", "HIGH", "CRITICAL"]) }).parse(await request.json());
    const ticket = await withSerializableTransaction(async (tx) => {
      const ticket = await tx.restaurantSupportTicket.create({ data: { tenantId: current.tenantId, branchId: current.branchId, createdById: current.actorId, ...data } });
      await tx.auditLog.create({ data: { tenantId: current.tenantId, branchId: current.branchId, userId: current.actorId, action: "SUPPORT_CREATE", entityType: "RestaurantSupportTicket", entityId: ticket.id } }); return ticket;
    });
    return Response.json({ ok: true, id: ticket.id, message: "Incidencia registrada en la bandeja de soporte de Movendi." });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { const current = await scope(true); return Response.json(await updateTicket(current.actorId, await request.json(), { tenantId: current.tenantId, branchId: current.branchId })); } catch (error) { return errorResponse(error); }
}
