import { retailReports } from "./reports";
import { managesCash } from "./cash-access";
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
  const data: MinimarketData = { scope: { ...where, actorId: scope.actorId }, report: null, promotions: [], cashSessions: [], suppliers: [], payables: [], transfers: [], transferBranches: [], fiscal: await retailFiscalSettings(prisma, scope), fiscalConnection: section === "settings" ? await getSunatConnectionStatus(scope.tenantId) : null, today: await businessDate(prisma, scope), currency: tenant.currency, paymentMethods: JSON.parse(tenant.paymentMethods), products: [], sales: [], purchases: [], movements: [], customers: [], cash: null, cashHistory: [], cashMovements: [], page: Math.floor(page), pages: 1, totalRows: 0, summary: null };
  if (["catalog", "pos", "inventory", "purchases"].includes(section)) {
    const filter = { ...where, ...(section === "pos" ? { item: { active: true } } : {}), ...(q ? { OR: [{ item: { name: { contains: q } } }, { item: { sku: { contains: q } } }, { presentations: { some: { OR: [{ barcode: q }, { sku: { contains: q } }] } } }] } : {}) };
    const [products, count] = await Promise.all([prisma.retailProduct.findMany({ where: filter, include: { item: true, presentations: { orderBy: { name: "asc" } }, lots: { where: { stock: { gt: 0 } }, orderBy: { expiresOn: "asc" } } }, orderBy: { item: { name: "asc" } }, take, skip }), prisma.retailProduct.count({ where: filter })]);
    const costs = hasPermission(scope.permissions, "inventory:read") || hasPermission(scope.permissions, "minimarket:reports:read");
    data.products = products.map((p) => ({ id: p.id, itemId: p.itemId, name: p.item.name, sku: p.item.sku, category: p.category, taxCategory: p.taxCategory, unit: p.item.unit, stock: p.item.stock, minimumStock: p.item.minimumStock, unitCostCents: costs ? p.item.unitCostCents : null, active: p.item.active, trackExpiry: p.trackExpiry, expiryAlertDays: p.expiryAlertDays, presentations: p.presentations.map(({ id, name, sku, barcode, factor, priceCents, weighted, active }) => ({ id, name, sku, barcode, factor, priceCents, weighted, active })), lots: p.lots.map(({ id, code, expiresOn, stock }) => ({ id, code, expiresOn, stock })) }));
    data.totalRows = count;
  }
  if (section === "pos" || section === "checkout" || (section === "purchases" && hasPermission(scope.permissions, "minimarket:payables:write")) || (section === "sales" && hasPermission(scope.permissions, "minimarket:refunds:write"))) {
    const cashWhere = { ...where, ...(managesCash(scope) ? {} : { openedById: scope.actorId }) };
    const sessions = await prisma.cashSession.findMany({ where: { ...cashWhere, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    data.cashSessions = sessions.map((c) => ({ id: c.id, registerName: c.registerName, openedById: c.openedById, openingCents: c.openingCents, expectedCents: c.expectedCents, openedAt: c.openedAt.toISOString() }));
    const cash = query.get("cash") ? sessions.find((c) => c.id === query.get("cash")) : sessions.find((c) => c.openedById === scope.actorId);
    data.cash = cash ? { id: cash.id, openingCents: cash.openingCents, expectedCents: cash.expectedCents, openedAt: cash.openedAt.toISOString() } : null;
    if (section === "checkout") {
      data.cashHistory = (await prisma.cashSession.findMany({ where: cashWhere, orderBy: { openedAt: "desc" }, take })).map((c) => ({ id: c.id, registerName: c.registerName, status: c.status, openingCents: c.openingCents, expectedCents: c.expectedCents, countedCents: c.countedCents, openedAt: c.openedAt.toISOString() }));
      data.cashMovements = (await prisma.cashMovement.findMany({ where: { ...where, ...(cash ? { cashSessionId: cash.id } : { cashSession: cashWhere }) }, orderBy: { createdAt: "desc" }, take: 100 })).map((m) => ({ id: m.id, type: m.type, amountCents: m.amountCents, reason: m.reason, createdAt: m.createdAt.toISOString() }));
    }
  }
  if (section === "clients" || (section === "pos" && hasPermission(scope.permissions, "customers:read"))) {
    const filter = { tenantId: scope.tenantId, active: true, ...(q && section === "clients" ? { name: { contains: q } } : {}) };
    data.customers = await prisma.customer.findMany({ where: filter, select: { id: true, name: true, dni: true, phone: true, email: true }, orderBy: { name: "asc" }, take, ...(section === "clients" ? { skip } : {}) });
    if (section === "clients") data.totalRows = await prisma.customer.count({ where: filter });
  }
  if (section === "purchases") data.purchases = (await prisma.inventoryPurchase.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 })).map((p) => ({ id: p.id, code: p.code, supplierName: p.supplierName, documentNumber: p.documentNumber, totalCents: p.totalCents, createdAt: p.createdAt.toISOString() }));
  if (section === "inventory") data.movements = (await prisma.inventoryMovement.findMany({ where, include: { item: { select: { name: true } }, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 })).map((m) => ({ id: m.id, name: m.item.name, type: m.type, direction: m.direction, quantity: m.quantity, stockBefore: m.stockBefore, actorName: m.actor?.name ?? "Sistema", reference: m.reference ?? m.originId, stockAfter: m.stockAfter, notes: m.notes, createdAt: m.createdAt.toISOString() }));
  if (["sales", "reports", "dashboard"].includes(section)) {
    const days = query.get("period") === "7d" ? 7 : query.get("period") === "90d" ? 90 : 30;
    const since = query.get("period") === "all" ? new Date(0) : new Date(Date.now() - days * 86_400_000);
    const filter = { ...where, retailSaleId: { not: null }, createdAt: { gte: since }, ...(section !== "sales" ? { commercialSnapshot: { contains: `"currency":"${tenant.currency}"` } } : {}), ...(q ? { code: { contains: q } } : {}) };
    const [sales, totalRows] = await Promise.all([prisma.sale.findMany({ where: filter, include: { retailSale: { include: { lines: true } }, fiscalJobs: { orderBy: { createdAt: "asc" as const } }, payments: true }, orderBy: { createdAt: "desc" }, take, skip }), prisma.sale.count({ where: filter })]);
    data.sales = sales.map((sale) => ({ id: sale.id, code: sale.code, fiscalJobs: sale.fiscalJobs.map((job) => { const response = job.response ? JSON.parse(job.response) as Record<string, unknown> : {}; const url = (value: unknown) => typeof value === "string" && value.startsWith("https://") ? value : null; return { id: job.id, kind: job.kind, series: job.series, number: job.number, status: job.status, environment: job.environment, lastError: job.lastError, pdfUrl: url(response.enlace_del_pdf), xmlUrl: url(response.enlace_del_xml), cdrUrl: url(response.enlace_del_cdr) }; }), currency: (JSON.parse(sale.commercialSnapshot!) as { currency: string }).currency, status: sale.status, totalCents: sale.totalCents, refundedCents: sale.retailSale!.lines.reduce((sum, l) => sum + l.refundedCents, 0), createdAt: sale.createdAt.toISOString(), paymentMethod: sale.paymentMethod, lines: sale.retailSale!.lines.map(({ id, name, quantity, returnedQuantity, unitPriceCents, totalCents, discountCents, promotionName, refundedCents }) => ({ id, name, quantity, returnedQuantity, unitPriceCents, totalCents, discountCents, promotionName, refundedCents })), payments: sale.payments.map(({ method, amountCents }) => ({ method, amountCents })) }));
    data.totalRows = totalRows;
    if (section !== "sales") {
      const [gross, returns, products] = await Promise.all([
        prisma.sale.aggregate({ where: filter, _sum: { totalCents: true } }),
        prisma.retailSaleLine.aggregate({ where: { retailSale: { ...where, sale: filter } }, _sum: { refundedCents: true } }),
        prisma.inventoryItem.findMany({ where: { ...where, active: true, retailProduct: { isNot: null } }, select: { stock: true, minimumStock: true } }),
      ]);
      data.report = await retailReports(scope, filter, since, tenant.currency, data.today);
      data.summary = { salesCents: gross._sum.totalCents ?? 0, refundedCents: returns._sum.refundedCents ?? 0, count: totalRows, lowStock: products.filter((p) => p.stock <= p.minimumStock).length, expiringLots: data.report.expiringCount };
    }
  }
  if (section === "inventory") {
    data.transferBranches = await prisma.branch.findMany({ where: { tenantId: scope.tenantId, active: true, id: { not: scope.branchId } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const transfers = await prisma.retailTransfer.findMany({ where: { tenantId: scope.tenantId, OR: [{ sourceBranchId: scope.branchId }, { destinationBranchId: scope.branchId }] }, include: { source: { select: { name: true } }, destination: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
    data.transfers = transfers.map((row) => ({ id: row.id, sourceBranchId: row.sourceBranchId, destinationBranchId: row.destinationBranchId, sourceName: row.source.name, destinationName: row.destination.name, status: row.status, notes: row.notes, createdAt: row.createdAt.toISOString(), lines: JSON.parse(row.lines) }));
  }
  if (section === "purchases") {
    data.suppliers = (await prisma.inventorySupplier.findMany({ where, include: { purchases: { orderBy: { createdAt: "desc" }, take: 10, select: { code: true, totalCents: true, createdAt: true } } }, orderBy: { name: "asc" }, take: 200 })).map((row) => ({ id: row.id, documentType: row.documentType, documentNumber: row.documentNumber, name: row.name, phone: row.phone, email: row.email, address: row.address, contact: row.contact, active: row.active, purchases: row.purchases.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })) }));
    if (hasPermission(scope.permissions, "minimarket:payables:read") || hasPermission(scope.permissions, "minimarket:payables:write")) {
      const payables = await prisma.inventoryPayable.findMany({ where, include: { supplier: { select: { name: true } }, purchase: { select: { code: true } }, payments: { orderBy: { createdAt: "desc" } } }, orderBy: { dueOn: "asc" }, take: 100 });
      data.payables = payables.map((row) => ({ id: row.id, supplierName: row.supplier.name, purchaseCode: row.purchase.code, currency: row.currency, totalCents: row.totalCents, paidCents: row.paidCents, dueOn: row.dueOn, status: row.paidCents === row.totalCents ? "PAID" : row.dueOn < data.today ? "OVERDUE" : row.paidCents ? "PARTIAL" : "PENDING", payments: row.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, method: p.method, reference: p.reference, createdAt: p.createdAt.toISOString() })) }));
    }
  }
  if (section === "catalog" && hasPermission(scope.permissions, "minimarket:promotions:write")) data.promotions = (await prisma.promotion.findMany({ where: { ...where, scope: "RETAIL" }, orderBy: [{ priority: "desc" }, { name: "asc" }], take: 200 })).map((p) => ({ id: p.id, name: p.name, kind: p.kind, value: p.value, retailProductId: p.retailProductId, retailPresentationId: p.retailPresentationId, priority: p.priority, minQuantity: p.minQuantity, startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, active: p.active }));
  data.pages = Math.max(1, Math.ceil(data.totalRows / take));
  return data;
}
