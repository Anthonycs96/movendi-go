import { retailFiscalSettings } from "./fiscal";
import { getSunatConnectionStatus } from "@/modules/invoicing/server/connection";
import "server-only";
import type { MinimarketData } from "@movendi/contracts";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { prisma } from "@/core/database/prisma";
import { scoped, businessDate } from "./service";

export async function getMinimarketData(scope: TenantScope, section: string, query: URLSearchParams): Promise<MinimarketData> {
  const where = scoped(scope);
  const page = Math.min(100_000, Math.max(1, Number(query.get("page")) || 1));
  const q = (query.get("q") ?? "").trim().slice(0, 120);
  const take = 30, skip = (Math.floor(page) - 1) * take;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { currency: true, paymentMethods: true } });
  const data: MinimarketData = { fiscal: await retailFiscalSettings(prisma, scope), fiscalConnection: section === "settings" ? await getSunatConnectionStatus(scope.tenantId) : null, today: await businessDate(prisma, scope), currency: tenant.currency, paymentMethods: JSON.parse(tenant.paymentMethods), products: [], sales: [], purchases: [], movements: [], customers: [], cash: null, cashHistory: [], cashMovements: [], page: Math.floor(page), pages: 1, totalRows: 0, summary: null };
  if (["catalog", "pos", "inventory", "purchases"].includes(section)) {
    const filter = { ...where, ...(section === "pos" ? { item: { active: true } } : {}), ...(q ? { OR: [{ item: { name: { contains: q } } }, { item: { sku: { contains: q } } }, { presentations: { some: { barcode: q } } }] } : {}) };
    const [products, count] = await Promise.all([prisma.retailProduct.findMany({ where: filter, include: { item: true, presentations: { orderBy: { name: "asc" } }, lots: { where: { stock: { gt: 0 } }, orderBy: { expiresOn: "asc" } } }, orderBy: { item: { name: "asc" } }, take, skip }), prisma.retailProduct.count({ where: filter })]);
    const costs = hasPermission(scope.permissions, "inventory:read") || hasPermission(scope.permissions, "minimarket:reports:read");
    data.products = products.map((p) => ({ id: p.id, itemId: p.itemId, name: p.item.name, sku: p.item.sku, category: p.category, taxCategory: p.taxCategory, unit: p.item.unit, stock: p.item.stock, minimumStock: p.item.minimumStock, unitCostCents: costs ? p.item.unitCostCents : null, active: p.item.active, trackExpiry: p.trackExpiry, presentations: p.presentations.map(({ id, name, barcode, factor, priceCents, weighted, active }) => ({ id, name, barcode, factor, priceCents, weighted, active })), lots: p.lots.map(({ id, code, expiresOn, stock }) => ({ id, code, expiresOn, stock })) }));
    data.totalRows = count;
  }
  if (section === "pos" || section === "checkout" || (section === "sales" && hasPermission(scope.permissions, "minimarket:refunds:write"))) {
    const cash = await prisma.cashSession.findFirst({ where: { ...where, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    data.cash = cash ? { id: cash.id, openingCents: cash.openingCents, expectedCents: cash.expectedCents, openedAt: cash.openedAt.toISOString() } : null;
    if (section === "checkout") {
      data.cashHistory = (await prisma.cashSession.findMany({ where, orderBy: { openedAt: "desc" }, take })).map((c) => ({ id: c.id, registerName: c.registerName, status: c.status, openingCents: c.openingCents, expectedCents: c.expectedCents, countedCents: c.countedCents, openedAt: c.openedAt.toISOString() }));
      data.cashMovements = (await prisma.cashMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 })).map((m) => ({ id: m.id, type: m.type, amountCents: m.amountCents, reason: m.reason, createdAt: m.createdAt.toISOString() }));
    }
  }
  if (section === "clients" || (section === "pos" && hasPermission(scope.permissions, "customers:read"))) {
    const filter = { tenantId: scope.tenantId, active: true, ...(q && section === "clients" ? { name: { contains: q } } : {}) };
    data.customers = await prisma.customer.findMany({ where: filter, select: { id: true, name: true, dni: true, phone: true, email: true }, orderBy: { name: "asc" }, take, ...(section === "clients" ? { skip } : {}) });
    if (section === "clients") data.totalRows = await prisma.customer.count({ where: filter });
  }
  if (section === "purchases") data.purchases = (await prisma.inventoryPurchase.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 })).map((p) => ({ id: p.id, code: p.code, supplierName: p.supplierName, documentNumber: p.documentNumber, totalCents: p.totalCents, createdAt: p.createdAt.toISOString() }));
  if (section === "inventory") data.movements = (await prisma.inventoryMovement.findMany({ where, include: { item: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 })).map((m) => ({ id: m.id, name: m.item.name, type: m.type, direction: m.direction, quantity: m.quantity, stockAfter: m.stockAfter, notes: m.notes, createdAt: m.createdAt.toISOString() }));
  if (["sales", "reports", "dashboard"].includes(section)) {
    const days = query.get("period") === "7d" ? 7 : query.get("period") === "90d" ? 90 : 30;
    const since = query.get("period") === "all" ? new Date(0) : new Date(Date.now() - days * 86_400_000);
    const filter = { ...where, retailSaleId: { not: null }, createdAt: { gte: since }, ...(section !== "sales" ? { commercialSnapshot: { contains: `"currency":"${tenant.currency}"` } } : {}), ...(q ? { code: { contains: q } } : {}) };
    const [sales, totalRows] = await Promise.all([prisma.sale.findMany({ where: filter, include: { retailSale: { include: { lines: true } }, fiscalJobs: { orderBy: { createdAt: "asc" as const } }, payments: true }, orderBy: { createdAt: "desc" }, take, skip }), prisma.sale.count({ where: filter })]);
    data.sales = sales.map((sale) => ({ id: sale.id, code: sale.code, fiscalJobs: sale.fiscalJobs.map((job) => { const response = job.response ? JSON.parse(job.response) as Record<string, unknown> : {}; const url = (value: unknown) => typeof value === "string" && value.startsWith("https://") ? value : null; return { id: job.id, kind: job.kind, series: job.series, number: job.number, status: job.status, environment: job.environment, lastError: job.lastError, pdfUrl: url(response.enlace_del_pdf), xmlUrl: url(response.enlace_del_xml), cdrUrl: url(response.enlace_del_cdr) }; }), currency: (JSON.parse(sale.commercialSnapshot!) as { currency: string }).currency, status: sale.status, totalCents: sale.totalCents, refundedCents: sale.retailSale!.lines.reduce((sum, l) => sum + l.refundedCents, 0), createdAt: sale.createdAt.toISOString(), paymentMethod: sale.paymentMethod, lines: sale.retailSale!.lines.map(({ id, name, quantity, returnedQuantity, unitPriceCents, totalCents, refundedCents }) => ({ id, name, quantity, returnedQuantity, unitPriceCents, totalCents, refundedCents })), payments: sale.payments.map(({ method, amountCents }) => ({ method, amountCents })) }));
    data.totalRows = totalRows;
    if (section !== "sales") {
      const [gross, returns, products, expiring] = await Promise.all([
        prisma.sale.aggregate({ where: filter, _sum: { totalCents: true } }),
        prisma.retailSaleLine.aggregate({ where: { retailSale: { ...where, sale: filter } }, _sum: { refundedCents: true } }),
        prisma.inventoryItem.findMany({ where: { ...where, active: true, retailProduct: { isNot: null } }, select: { stock: true, minimumStock: true } }),
        prisma.retailLot.count({ where: { product: where, stock: { gt: 0 }, expiresOn: { lte: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) } } }),
      ]);
      data.summary = { salesCents: gross._sum.totalCents ?? 0, refundedCents: returns._sum.refundedCents ?? 0, count: totalRows, lowStock: products.filter((p) => p.stock <= p.minimumStock).length, expiringLots: expiring };
    }
  }
  data.pages = Math.max(1, Math.ceil(data.totalRows / take));
  return data;
}
