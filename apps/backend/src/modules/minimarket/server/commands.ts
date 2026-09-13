import { queueSaleDocument, deliverFiscalJob } from "@/modules/invoicing/server/outbox";
import { saveSunatCredentials, sunatCredentialSchema, testSunatConnection } from "@/modules/invoicing/server/connection";
import { retailFiscalSettings, saveRetailFiscalSettings, fiscalSettingsSchema } from "./fiscal";
import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { prisma } from "@/core/database/prisma";
import { parseInput as parse } from "@/core/validation/parse-input";
import { openCashSession, closeCashSession, registerCashMovement } from "@/modules/cash/server/service";
import { checkoutRetail, retailOperation, scoped } from "./service";
import { receivePurchase, countStock } from "./stock";
import { refundRetail } from "./refunds";
import { cents, key, taxCategory, productSchema, presentationSchema, checkoutSchema, purchaseSchema, countSchema, refundSchema } from "./schemas";

export async function handleMinimarketCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id, action] = segments;
  if (segments.length > 3) throw new AppError("NOT_FOUND", 404, "Operación no encontrada.");
  if (resource === "fiscal" && method === "POST") {
    if (id === "credentials" && !action) return saveSunatCredentials(scope, parse(sunatCredentialSchema, body));
    if (id === "test" && !action) return testSunatConnection(scope, (await retailFiscalSettings(prisma, scope)).environment);
    if (id === "settings" && !action) { const input = parse(fiscalSettingsSchema.extend({ idempotencyKey: key }), body); return retailOperation(scope, "FISCAL_SETTINGS", input, (tx) => saveRetailFiscalSettings(tx, scope, fiscalSettingsSchema.parse(input))); }
  }
  if (resource === "fiscal-jobs" && method === "POST" && id && !action) return deliverFiscalJob(scope, id, true);
  if (resource === "sales" && method === "POST" && id && action === "electronic-document") {
    const input = parse(z.object({ idempotencyKey: key, kind: z.enum(["BOLETA", "FACTURA"]) }), body);
    return retailOperation(scope, "FISCAL_SALE", { ...input, saleId: id }, async (tx) => {
      const claimed = await tx.sale.updateMany({ where: { id, ...scoped(scope), retailSaleId: { not: null }, status: "PAID" }, data: { status: "PAID" } });
      if (!claimed.count) throw new AppError("SALE_NOT_PAID", 409, "Selecciona una venta pagada sin devoluciones.");
      const job = await queueSaleDocument(tx, scope, id, input.kind, await retailFiscalSettings(tx, scope));
      return { id: job.id, status: job.status };
    });
  }
  if (resource === "sales" && method === "GET" && id && !action) {
    const sale = await prisma.sale.findFirst({ where: { id, ...scoped(scope), retailSaleId: { not: null } }, select: {
      id: true, code: true, status: true, createdAt: true, totalCents: true, cashReceivedCents: true, changeCents: true,
      payments: { select: { method: true, amountCents: true, reference: true } },
      retailSale: { select: { lines: { select: { id: true, name: true, quantity: true, unitPriceCents: true, totalCents: true, returnedQuantity: true, refundedCents: true } } } },
    } });
    if (!sale) throw new AppError("NOT_FOUND", 404, "Venta no encontrada.");
    return sale;
  }
  if (method === "POST" && resource === "sales" && !id) return checkoutRetail(scope, parse(checkoutSchema, body));
  if (method === "POST" && resource === "sales" && id && action === "refund") return refundRetail(scope, id, parse(refundSchema, body));
  if (method === "POST" && resource === "purchases" && !id) return receivePurchase(scope, parse(purchaseSchema, body));
  if (method === "POST" && resource === "counts" && !id) return countStock(scope, parse(countSchema, body));
  if (method === "POST" && resource === "products" && !id) {
    const input = parse(productSchema.extend({ idempotencyKey: key }), body);
    return retailOperation(scope, "PRODUCT_CREATE", input, async (tx) => {
      if (input.unit === "UND" && input.presentations.some((p) => p.weighted || !Number.isInteger(p.factor))) throw new AppError("INVALID_UNIT", 400, "Los artículos por unidad requieren factores y cantidades enteros.");
      try {
        const item = await tx.inventoryItem.create({ data: { ...scoped(scope), name: input.name, sku: input.sku, unit: input.unit, kind: "RETAIL", minimumStock: input.minimumStock, trackStock: true } });
        const product = await tx.retailProduct.create({ data: { ...scoped(scope), itemId: item.id, category: input.category, taxCategory: input.taxCategory, trackExpiry: input.trackExpiry, presentations: { create: input.presentations.map((p) => ({ ...p, barcode: p.barcode || null, ...scoped(scope) })) } } });
        return { id: product.id };
      } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("DUPLICATE_PRODUCT", 409, "El SKU, código de barras o nombre de presentación ya existe en esta sucursal."); throw error; }
    });
  }
  if (resource === "products" && method === "PATCH" && id && !action) {
    const input = parse(z.object({ idempotencyKey: key, name: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(120), taxCategory: taxCategory.optional(), minimumStock: z.number().min(0).max(1_000_000), active: z.boolean() }), body);
    return retailOperation(scope, "PRODUCT_EDIT", { ...input, id }, async (tx) => {
      const product = await tx.retailProduct.findFirst({ where: { id, ...scoped(scope) } });
      if (!product) throw new AppError("NOT_FOUND", 404, "Producto no encontrado.");
      await tx.retailProduct.update({ where: { id }, data: { category: input.category, taxCategory: input.taxCategory } });
      await tx.inventoryItem.update({ where: { id: product.itemId }, data: { name: input.name, minimumStock: input.minimumStock, active: input.active } });
      return { id };
    });
  }
  if (resource === "presentations" && method === "POST" && !id) {
    const input = parse(presentationSchema.extend({ idempotencyKey: key, productId: z.string().min(1) }), body);
    return retailOperation(scope, "PRESENTATION_CREATE", input, async (tx) => {
      const product = await tx.retailProduct.findFirst({ where: { id: input.productId, ...scoped(scope) }, include: { item: true } });
      if (!product) throw new AppError("NOT_FOUND", 404, "Producto no encontrado.");
      if (product.item.unit === "UND" && (input.weighted || !Number.isInteger(input.factor))) throw new AppError("INVALID_UNIT", 400, "Usa un factor entero para artículos por unidad.");
      const { idempotencyKey: ignored, ...data } = input; void ignored;
      return tx.retailPresentation.create({ data: { ...data, ...scoped(scope), barcode: input.barcode || null } });
    });
  }
  if (resource === "presentations" && method === "PATCH" && id && !action) {
    const input = parse(z.object({ idempotencyKey: key, priceCents: cents, active: z.boolean() }), body);
    return retailOperation(scope, "PRESENTATION_EDIT", { ...input, id }, async (tx) => {
      const result = await tx.retailPresentation.updateMany({ where: { id, ...scoped(scope) }, data: { priceCents: input.priceCents, active: input.active } });
      if (result.count !== 1) throw new AppError("NOT_FOUND", 404, "Presentación no encontrada.");
      return { id };
    });
  }
  if (resource === "cash" && method === "POST") {
    if (!id) {
      const input = parse(z.object({ idempotencyKey: key, openingCents: cents, registerName: z.string().trim().min(1).max(80).default("Caja principal") }), body);
      return retailOperation(scope, "CASH_OPEN", input, (tx) => openCashSession(tx, scope, input));
    }
    if (action === "close") {
      const input = parse(z.object({ idempotencyKey: key, countedCents: cents, expectedCents: cents, notes: z.string().trim().max(500).optional() }), body);
      return retailOperation(scope, "CASH_CLOSE", { ...input, id }, (tx) => closeCashSession(tx, scope, { ...input, id, policy: { toleranceCents: 0, canApprove: hasPermission(scope.permissions, "minimarket:cash:approve") } }));
    }
    if (action === "movement") {
      const input = parse(z.object({ idempotencyKey: key, type: z.enum(["IN", "OUT"]), amountCents: cents.refine((n) => n > 0), reason: z.string().trim().min(5).max(200) }), body);
      return retailOperation(scope, "CASH_MOVEMENT", { ...input, id }, (tx) => registerCashMovement(tx, scope, { ...input, cashSessionId: id }));
    }
  }
  if (resource === "customers" && method === "POST" && !id) {
    const input = parse(z.object({ idempotencyKey: key, name: z.string().trim().min(2).max(120), dni: z.string().regex(/^(\d{8}|\d{11})?$/).optional(), phone: z.string().trim().max(30).optional(), email: z.string().email().or(z.literal("")).optional() }), body);
    return retailOperation(scope, "CUSTOMER_CREATE", input, async (tx) => { const customer = await tx.customer.create({ data: { tenantId: scope.tenantId, name: input.name, dni: input.dni || null, documentType: input.dni?.length === 11 ? "RUC" : input.dni?.length === 8 ? "DNI" : "NONE", phone: input.phone || null, email: input.email || null } }); return { id: customer.id }; });
  }
  throw new AppError("NOT_FOUND", 404, "Operación de Minimarket no encontrada.");
}
