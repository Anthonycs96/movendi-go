import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, requireTenantScope } from "@/core/auth/session";
import { hasPermission } from "@/core/auth/permissions";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Este módulo pertenece a Restaurante.");
    assertRestaurantModule(session, "checkout");
    const scope = await requireTenantScope();
    const canOperate = hasPermission(scope.permissions, "restaurant:cash:write");
    const canHistory = hasPermission(scope.permissions, "restaurant:reports:read");
    if (!canOperate && !canHistory) throw new AppError("FORBIDDEN", 403, "No tienes permiso para consultar caja.");
    const id = new URL(request.url).searchParams.get("id");
    const base = { tenantId: scope.tenantId, branchId: scope.branchId };
    const cash = await prisma.cashSession.findFirst({ where: { ...base, ...(id ? { id } : { status: "OPEN" }) }, include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } }, branch: { select: { name: true } } } });
    if (id && !cash) throw new AppError("NOT_FOUND", 404, "Caja no encontrada.");
    if (cash?.status === "CLOSED" && !canHistory) throw new AppError("FORBIDDEN", 403, "Consultar cierres requiere permiso de reportes.");
    if (!cash) return Response.json({ cash: null, operatorName: session.userName, branchName: session.branchName }, { headers: { "Cache-Control": "private, no-store" } });
    const [sales, movementGroups, movements, movementCount, refunds] = await Promise.all([
      prisma.sale.findMany({ where: { ...base, cashSessionId: cash.id, orderId: { not: null } }, select: { totalCents: true, discountCents: true, paymentMethod: true, payments: { select: { method: true, amountCents: true } } } }),
      prisma.cashMovement.groupBy({ by: ["type"], where: { ...base, cashSessionId: cash.id }, _sum: { amountCents: true } }),
      prisma.cashMovement.findMany({ where: { ...base, cashSessionId: cash.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, type: true, reason: true, notes: true, amountCents: true, createdAt: true, createdBy: { select: { name: true } } } }),
      prisma.cashMovement.count({ where: { ...base, cashSessionId: cash.id } }),
      prisma.saleRefund.findMany({ where: { ...base, cashSessionId: cash.id }, select: { totalCents: true, cashCents: true, payments: true } }),
    ]);
    const methods = new Map<string, { method: string; receivedCents: number; refundedCents: number }>();
    const methodRow = (method: string) => { if (!methods.has(method)) methods.set(method, { method, receivedCents: 0, refundedCents: 0 }); return methods.get(method)!; };
    for (const sale of sales) for (const payment of sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amountCents: sale.totalCents }]) methodRow(payment.method).receivedCents += payment.amountCents;
    for (const refund of refunds) {
      const payments: Array<{ method: string; amountCents: number }> = JSON.parse(refund.payments);
      for (const payment of payments) methodRow(payment.method).refundedCents += payment.amountCents;
    }
    const inCents = movementGroups.find((group) => group.type === "IN")?._sum.amountCents ?? 0;
    const allOutCents = movementGroups.find((group) => group.type === "OUT")?._sum.amountCents ?? 0;
    const cashRefundsCents = refunds.reduce((sum, refund) => sum + refund.cashCents, 0);
    const result = { id: cash.id, status: cash.status, registerName: cash.registerName, branchName: cash.branch.name, openedBy: cash.openedBy.name, closedBy: cash.closedBy?.name ?? null, openedAt: cash.openedAt.toISOString(), closedAt: cash.closedAt?.toISOString() ?? null, openingNote: cash.openingNote, closingNote: cash.closingNote, openingCents: cash.openingCents, expectedCents: cash.expectedCents, countedCents: cash.countedCents, differenceCents: cash.countedCents == null ? null : cash.countedCents - cash.expectedCents,
      salesCents: sales.reduce((sum, sale) => sum + sale.totalCents, 0), saleCount: sales.length, discountsCents: sales.reduce((sum, sale) => sum + sale.discountCents, 0), refundsCents: refunds.reduce((sum, refund) => sum + refund.totalCents, 0), cashSalesCents: methods.get("CASH")?.receivedCents ?? 0, inCents, outCents: allOutCents - cashRefundsCents, cashRefundsCents, methods: [...methods.values()], movementCount, movements: movements.map((movement) => ({ ...movement, createdAt: movement.createdAt.toISOString(), createdBy: movement.createdBy.name })) };
    return Response.json({ cash: result, operatorName: session.userName, branchName: session.branchName }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
