import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import { withSerializableTransaction } from "@/core/database/transactions";
import { assertTransactionalQuota } from "@/core/platform/entitlements";
import { recordSale, validateSalePayments } from "@/modules/sales/server/service";
import { applyCashEffect } from "@/modules/cash/server/service";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { allocateCents } from "@/modules/invoicing/domain/allocate-cents";
import { assertSkill, scoped } from "./schedule";
import type { SalonCheckout } from "./schemas";

export async function salonAudit(tx: Prisma.TransactionClient, scope: TenantScope, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await tx.auditLog.create({ data: { ...scoped(scope), userId: scope.actorId, action, entityType, entityId, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
}
type Supply = { itemId: string; quantity: number; unitCostCents: number; internal: boolean; tracked: boolean };

export async function checkoutSalon(scope: TenantScope, input: SalonCheckout) {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withSerializableTransaction(async (tx) => {
    // Serialize requests per branch through the same cash ledger used by the other modules.
    const cash = await tx.cashSession.findFirst({ where: { ...scoped(scope), status: "OPEN" }, orderBy: { openedAt: "desc" } });
    const previous = await tx.salonSale.findUnique({ where: { tenantId_branchId_idempotencyKey: { ...scoped(scope), idempotencyKey: input.idempotencyKey } }, include: { sale: true } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se usó con otros datos.");
      if (previous.sale) return { ok: true, id: previous.sale.id, message: "Venta ya registrada.", replayed: true };
    }
    const appointment = input.appointmentId ? await tx.appointment.findFirst({ where: { id: input.appointmentId, ...scoped(scope) }, include: { sale: true } }) : null;
    if (input.appointmentId && !appointment) throw new AppError("NOT_FOUND", 404, "Cita no encontrada.");
    if (appointment?.sale) throw new AppError("ALREADY_PAID", 409, "La cita ya fue cobrada.");
    if (appointment && ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw new AppError("APPOINTMENT_CLOSED", 409, "La cita está cerrada.");
    if (appointment && input.customerId && input.customerId !== appointment.customerId) throw new AppError("CUSTOMER_MISMATCH", 409, "El cliente debe coincidir con la cita.");
    if (!cash) throw new AppError("CASH_CLOSED", 409, "Abre una caja antes de registrar el cobro.");
    if (cash.balanceBasis !== "CASH_ONLY") throw new AppError("CASH_RECONCILIATION_REQUIRED", 409, "Cierra y concilia el turno anterior antes de cobrar.");
    await applyCashEffect(tx, scope, cash.id, 0, { code: "CASH_CLOSED", message: "La caja cambió durante el cobro." });
    const customerId = appointment?.customerId ?? input.customerId ?? null;
    if (customerId && !await tx.customer.findFirst({ where: { id: customerId, tenantId: scope.tenantId, active: true } })) throw new AppError("NOT_FOUND", 404, "Cliente no disponible.");
    // An appointment contributes its booked service once; additional lines are separate services/products.
    const requested = [...(appointment ? [{ serviceId: appointment.serviceId, staffId: appointment.staffId, quantity: 1, productId: undefined }] : []), ...input.lines];
    const lines = [];
    for (let index = 0; index < requested.length; index++) {
      const line = requested[index];
      const staff = line.staffId ? await tx.staffMember.findFirst({ where: { id: line.staffId, ...scoped(scope), active: true } }) : null;
      if ((line.serviceId || line.staffId) && !staff) throw new AppError("STAFF_REQUIRED", 400, "Asigna un profesional activo a cada servicio.");
      const supplies: Supply[] = [];
      let name: string, unitPriceCents: number, itemId: string | null = null, pct = 0, fixed: number | null = null;
      if (line.serviceId) {
        const service = await tx.service.findFirst({ where: { id: line.serviceId, ...scoped(scope), active: true }, include: { supplies: { include: { item: true } } } });
        if (!service) throw new AppError("NOT_FOUND", 404, "Servicio no disponible.");
        await assertSkill(tx, staff!.id, service.id);
        name = service.name; unitPriceCents = appointment && index === 0 ? appointment.priceCents : service.priceCents;
        fixed = service.commissionFixedCents ?? (service.commissionPct !== null ? null : staff!.commissionFixedCents);
        pct = service.commissionPct ?? staff!.commissionPct;
        for (const supply of service.supplies) {
          if (!supply.item.active || supply.item.tenantId !== scope.tenantId || (supply.item.branchId !== null && supply.item.branchId !== scope.branchId)) throw new AppError("SUPPLY_UNAVAILABLE", 409, "Revisa los insumos configurados para el servicio.");
          supplies.push({ itemId: supply.itemId, quantity: supply.quantity * line.quantity, unitCostCents: supply.item.unitCostCents, internal: true, tracked: supply.item.trackStock });
        }
      } else {
        const product = await tx.salonProduct.findFirst({ where: { id: line.productId, ...scoped(scope), active: true, item: { active: true } }, include: { item: true } });
        if (!product) throw new AppError("NOT_FOUND", 404, "Producto no disponible.");
        name = product.item.name; unitPriceCents = product.priceCents; itemId = product.itemId;
        pct = staff?.productCommissionPct ?? 0; fixed = staff?.productCommissionFixedCents ?? null;
        supplies.push({ itemId, quantity: line.quantity, unitCostCents: product.item.unitCostCents, internal: false, tracked: product.item.trackStock });
      }
      lines.push({ id: randomUUID(), serviceId: line.serviceId ?? null, itemId, staffId: staff?.id ?? null, name, staffName: staff?.name ?? null, quantity: line.quantity, unitPriceCents, grossCents: unitPriceCents * line.quantity, pct, fixed, supplies, costCents: supplies.reduce((sum, s) => sum + Math.round(s.quantity * s.unitCostCents), 0) });
    }
    const subtotalCents = lines.reduce((sum, l) => sum + l.grossCents, 0);
    let discountCents = input.discountCents, promotionName = input.discountReason || null;
    if (discountCents && (!hasPermission(scope.permissions, "barbershop:discounts:write") || !input.discountReason?.trim())) throw new AppError("DISCOUNT_AUTHORIZATION", 403, "Aplicar descuentos requiere permiso y motivo.");
    if (input.promotionId) {
      if (discountCents) throw new AppError("DISCOUNT_CONFLICT", 400, "Elige promoción o descuento manual.");
      const now = new Date();
      const promotion = await tx.promotion.findFirst({ where: { id: input.promotionId, ...scoped(scope), scope: "SALON", active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });
      if (!promotion) throw new AppError("PROMOTION_UNAVAILABLE", 409, "La promoción no está vigente.");
      discountCents = promotion.kind === "PERCENT" ? Math.round(subtotalCents * promotion.value / 100) : Math.min(subtotalCents, promotion.value); promotionName = promotion.name;
    }
    if (discountCents >= subtotalCents) throw new AppError("INVALID_DISCOUNT", 400, "El descuento debe ser menor al subtotal.");
    const totalCents = subtotalCents - discountCents;
    const payments = input.payments?.map((p) => ({ ...p, reference: p.reference || null })) ?? [{ method: input.paymentMethod ?? "CASH", amountCents: totalCents, reference: null }];
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { paymentMethods: true } });
    const enabled: string[] = JSON.parse(tenant.paymentMethods);
    if (payments.some((p) => !enabled.includes(p.method))) throw new AppError("PAYMENT_DISABLED", 400, "Un medio de pago no está habilitado en Configuración.");
    const allocation = validateSalePayments(totalCents, payments, input.cashReceivedCents);
    if (!appointment) await assertTransactionalQuota(tx, scope.tenantId, "operations");
    const salon = await tx.salonSale.create({ data: { ...scoped(scope), idempotencyKey: input.idempotencyKey, requestHash } });
    const discounts = allocateCents(discountCents, lines.map((l) => l.grossCents));
    const records = lines.map((l, i) => { const netCents = l.grossCents - discounts[i]; return { id: l.id, salonSaleId: salon.id, serviceId: l.serviceId, itemId: l.itemId, staffId: l.staffId, name: l.name, staffName: l.staffName, quantity: l.quantity, unitPriceCents: l.unitPriceCents, grossCents: l.grossCents, discountCents: discounts[i], netCents, costCents: l.costCents, commissionCents: l.staffId ? Math.min(netCents, l.fixed !== null ? l.fixed * l.quantity : Math.round(netCents * l.pct / 100)) : 0, supplySnapshot: JSON.stringify(l.supplies) }; });
    for (const record of records) await tx.salonSaleLine.create({ data: record });
    const sale = await recordSale(tx, scope, { origin: { kind: "SALON", id: salon.id }, code: `SAL-${randomUUID().slice(0, 12).toUpperCase()}`, customerId, cashierId: scope.actorId, cashSessionId: cash.id, paymentMethod: allocation.paymentMethod, payments, subtotalCents, discountCents, promotionName, totalCents, cashReceivedCents: input.cashReceivedCents ?? null, changeCents: allocation.changeCents, detail: { subtotalCents, chargesCents: 0, lines: records.map((l) => ({ sourceLineId: l.id, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.grossCents, discountCents: l.discountCents })) } });
    if (appointment) { await tx.sale.update({ where: { id: sale.id }, data: { appointmentId: appointment.id } }); await tx.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } }); }
    for (const line of lines) for (const supply of line.supplies) if (supply.tracked) await applyInventoryMovement(tx, scope, { itemId: supply.itemId, type: "SALE_CONSUMPTION", direction: "OUT", quantity: supply.quantity, originType: supply.internal ? "SALON_SERVICE" : "SALON_PRODUCT", originId: line.id, saleId: sale.id, idempotencyKey: `SALON:${sale.id}:${line.id}:${supply.itemId}`, preventNegativeStock: true });
    await applyCashEffect(tx, scope, cash.id, payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amountCents, 0), { code: "CASH_CLOSED", message: "La caja se cerró durante el cobro." });
    await salonAudit(tx, scope, "CHECKOUT", "Sale", sale.id, { appointmentId: appointment?.id, salonSaleId: salon.id });
    return { ok: true, id: sale.id, message: "Venta registrada; inventario, comisiones y caja actualizados.", replayed: false };
  });
}

export async function refundSalon(scope: TenantScope, id: string, reason: string, restock: boolean) {
  return withSerializableTransaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id, ...scoped(scope), salonSaleId: { not: null } }, include: { payments: true, salonSale: { include: { lines: true } }, refund: true } });
    if (!sale) throw new AppError("NOT_FOUND", 404, "Venta no encontrada.");
    if (sale.refund) return { ok: true, id: sale.refund.id, message: "La devolución ya está registrada." };
    if (sale.salonSale!.lines.some((l) => l.commissionPaidAt)) throw new AppError("COMMISSION_ALREADY_PAID", 409, "La venta incluye comisiones liquidadas. Concilia con administración antes de devolverla.");
    const cashCents = sale.payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amountCents, 0);
    const cash = await tx.cashSession.findFirst({ where: { ...scoped(scope), status: "OPEN", balanceBasis: "CASH_ONLY" } });
    if (!cash) throw new AppError("CASH_CLOSED", 409, "Abre caja para registrar la devolución.");
    await applyCashEffect(tx, scope, cash.id, -cashCents);
    const claimed = await tx.sale.updateMany({ where: { id, status: "PAID" }, data: { status: "REFUNDED" } });
    if (!claimed.count) throw new AppError("SALE_CLOSED", 409, "La venta ya cambió de estado.");
    if (restock) for (const line of sale.salonSale!.lines) if (line.itemId && (JSON.parse(line.supplySnapshot) as Supply[]).some((s) => !s.internal && s.tracked)) await applyInventoryMovement(tx, scope, { itemId: line.itemId, type: "SALE_RETURN", direction: "IN", quantity: line.quantity, unitCostCents: Math.round(line.costCents / line.quantity), saleId: id, originType: "SALON_REFUND", originId: id, idempotencyKey: `SALON_RETURN:${id}:${line.id}` });
    const refund = await tx.saleRefund.create({ data: { ...scoped(scope), saleId: id, actorId: scope.actorId, reason, stockDisposition: restock ? "RESTOCK_PRODUCTS" : "NO_RESTOCK", totalCents: sale.totalCents, cashCents, payments: JSON.stringify(sale.payments.map((p) => ({ method: p.method, amountCents: p.amountCents }))), cashSessionId: cash.id } });
    await salonAudit(tx, scope, "REFUND", "Sale", id, { reason, restock, cashCents });
    return { ok: true, id: refund.id, message: "Devolución registrada. Los pagos digitales se devuelven desde su proveedor; los insumos usados no se reponen." };
  });
}
