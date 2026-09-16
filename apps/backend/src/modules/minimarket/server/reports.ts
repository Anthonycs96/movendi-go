import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { prisma } from "@/core/database/prisma";
import { scoped } from "./service";

export async function retailReports(scope: TenantScope, salesFilter: Prisma.SaleWhereInput, since: Date, currency: string, today: string) {
  const where = scoped(scope);
  const [sales, products, lots, purchases, payables, restocked] = await Promise.all([
    prisma.sale.findMany({ where: salesFilter, include: { cashier: { select: { name: true } }, cashSession: { select: { registerName: true } }, branch: { select: { name: true } }, payments: true, retailSale: { include: { lines: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 10001 }),
    prisma.inventoryItem.findMany({ where: { ...where, active: true, retailProduct: { isNot: null } }, select: { id: true, name: true, stock: true, minimumStock: true, unit: true } }),
    prisma.retailLot.findMany({ where: { product: where, stock: { gt: 0 } }, include: { product: { include: { item: { select: { name: true } } } } }, orderBy: { expiresOn: "asc" } }),
    prisma.inventoryPurchase.aggregate({ where: { ...where, createdAt: { gte: since } }, _sum: { totalCents: true }, _count: true }),
    prisma.inventoryPayable.groupBy({ by: ["currency"], where, _sum: { totalCents: true, paidCents: true }, _count: true }),
    prisma.inventoryMovement.aggregate({ where: { ...where, type: "RETURN", originType: "RETAIL_REFUND", sale: salesFilter }, _sum: { totalCostCents: true } }),
  ]);
  const truncated = sales.length > 10000, selected = sales.slice(0, 10000);
  const cashier = new Map<string, { name: string; salesCents: number; refundedCents: number; count: number }>(), cash = new Map<string, { name: string; salesCents: number; refundedCents: number; count: number }>(), branch = new Map<string, { name: string; salesCents: number; refundedCents: number; count: number }>();
  const payments = new Map<string, { name: string; salesCents: number; refundedCents: number }>(), top = new Map<string, { name: string; quantity: number; netCents: number }>();
  let costCents = 0, unknownCosts = 0, netCents = 0;
  for (const sale of selected) {
    const lines = sale.retailSale!.lines, refunded = lines.reduce((sum, line) => sum + line.refundedCents, 0); netCents += sale.totalCents - refunded;
    for (const [map, id, name] of [[cashier, sale.cashierId, sale.cashier?.name ?? "Sin cajero"], [cash, sale.cashSessionId, sale.cashSession?.registerName ?? "Sin caja"], [branch, sale.branchId, sale.branch.name]] as const) {
      const value = map.get(id ?? "unknown") ?? { name, salesCents: 0, refundedCents: 0, count: 0 }; value.salesCents += sale.totalCents; value.refundedCents += refunded; value.count++; map.set(id ?? "unknown", value);
    }
    for (const payment of sale.payments) { const value = payments.get(payment.method) ?? { name: payment.method, salesCents: 0, refundedCents: 0 }; value.salesCents += payment.amountCents; payments.set(payment.method, value); }
    for (const payment of JSON.parse(sale.retailSale!.refundedPayments) as Array<{ method: string; amountCents: number }>) { const value = payments.get(payment.method) ?? { name: payment.method, salesCents: 0, refundedCents: 0 }; value.refundedCents += payment.amountCents; payments.set(payment.method, value); }
    for (const line of lines) {
      costCents += Math.round(line.quantity * line.factor * line.unitCostCents); if (!line.unitCostCents) unknownCosts++;
      const value = top.get(line.presentationId) ?? { name: line.name, quantity: 0, netCents: 0 }; value.quantity += line.quantity - line.returnedQuantity; value.netCents += line.totalCents - line.refundedCents; top.set(line.presentationId, value);
    }
  }
  const expiry = lots.filter((lot) => lot.expiresOn <= new Date(Date.parse(today + "T00:00:00Z") + lot.product.expiryAlertDays * 86400000).toISOString().slice(0, 10));
  return { truncated, analyzedSales: selected.length, currency, costCents: unknownCosts || truncated ? null : costCents - (restocked._sum.totalCostCents ?? 0), marginCents: unknownCosts || truncated ? null : netCents - costCents + (restocked._sum.totalCostCents ?? 0), unknownCostLines: unknownCosts,
    byCashier: [...cashier.values()], byCash: [...cash.values()], byBranch: [...branch.values()], byPayment: [...payments.values()], topProducts: [...top.values()].sort((a, b) => b.netCents - a.netCents).slice(0, 20),
    lowStock: products.filter((p) => p.stock <= p.minimumStock).slice(0, 100), noStockCount: products.filter((p) => p.stock === 0).length,
    expiringCount: expiry.length, expiring: expiry.slice(0, 100).map((lot) => ({ name: lot.product.item.name, code: lot.code, stock: lot.stock, expiresOn: lot.expiresOn, alertDays: lot.product.expiryAlertDays })),
    purchases: { count: purchases._count, totalCents: purchases._sum.totalCents ?? 0, currencyVerified: false },
    payables: payables.map((p) => ({ currency: p.currency, count: p._count, balanceCents: (p._sum.totalCents ?? 0) - (p._sum.paidCents ?? 0) })),
  };
}
