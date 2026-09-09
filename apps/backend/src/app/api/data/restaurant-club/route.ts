import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, requireTenantScope } from "@/core/auth/session";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await requireSession("customers:read");
    if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Este club pertenece a Restaurante.");
    assertRestaurantModule(session, "clients");
    const scope = await requireTenantScope("customers:read");
    const id = new URL(request.url).searchParams.get("id");
    const base = { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } };
    if (!id) {
      const rows = await prisma.sale.groupBy({ by: ["customerId"], where: { ...base, customerId: { not: null }, status: "PAID" }, _sum: { totalCents: true }, _count: { id: true }, _max: { createdAt: true } });
      return Response.json({ rows: rows.map((row) => ({ id: row.customerId!, visits: row._count.id, spentCents: row._sum.totalCents ?? 0, lastVisit: row._max.createdAt?.toISOString() ?? null })) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const customer = await prisma.customer.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true, name: true, loyaltyPoints: true, notes: true, segment: true } });
    if (!customer) throw new AppError("NOT_FOUND", 404, "Cliente no encontrado.");
    const [sales, totals] = await Promise.all([
      prisma.sale.findMany({ where: { ...base, customerId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, code: true, createdAt: true, totalCents: true, status: true, loyaltyPointsEarned: true, loyaltyPointsRedeemed: true, loyaltyDiscountCents: true, order: { select: { items: { select: { name: true, quantity: true } } } } } }),
      prisma.sale.aggregate({ where: { ...base, customerId: id, status: "PAID" }, _sum: { totalCents: true }, _count: { id: true } }),
    ]);
    return Response.json({ customer, sales, visits: totals._count.id, spentCents: totals._sum.totalCents ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
