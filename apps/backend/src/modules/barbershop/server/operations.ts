import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withSerializableTransaction } from "@/core/database/transactions";
import { openCashSession, closeCashSession, registerCashMovement } from "@/modules/cash/server/service";
import { assertTransactionalQuota } from "@/core/platform/entitlements";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { parseInput as parse } from "@/core/validation/parse-input";
import { customerSchema, staffSchema, serviceSchema, appointmentSchema, scheduleSchema, blockSchema, checkoutSchema, moneyCents, promotionSchema, paymentMethod } from "./schemas";
import { assertAvailable, assertSkill, instant, lockStaff, scoped, timezoneFor } from "./schedule";
import { checkoutSalon, refundSalon, salonAudit } from "./sales";

const missing = () => new AppError("NOT_FOUND", 404, "Registro no encontrado en esta empresa o sucursal.");
const closed = () => new AppError("APPOINTMENT_CLOSED", 409, "La cita está cerrada y no admite cambios.");

export async function handleBarbershopCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id, action] = segments;
  if (segments.length > 3) throw missing();
  if (resource === "payment-methods" && method === "POST" && !id) {
    const input = parse(z.object({ methods: z.array(paymentMethod).min(1).max(6) }), body);
    return withSerializableTransaction(async (tx) => { await tx.tenant.update({ where: { id: scope.tenantId }, data: { paymentMethods: JSON.stringify([...new Set(input.methods)]) } }); await salonAudit(tx, scope, "CONFIGURE_PAYMENTS", "Tenant", scope.tenantId, input); return { ok: true, id: scope.tenantId, message: "Medios de pago actualizados." }; });
  }
  if (resource === "sales" && method === "POST" && !id) return checkoutSalon(scope, parse(checkoutSchema, body));
  if (resource === "sales" && method === "POST" && id && action === "refund") {
    const input = parse(z.object({ reason: z.string().trim().min(5).max(300), restock: z.boolean().default(false) }), body);
    return refundSalon(scope, id, input.reason, input.restock);
  }
  if (resource === "appointments" && method === "POST" && id && action === "checkout") {
    const input = parse(z.object({ paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "YAPE", "PLIN", "OTHER"]) }), body);
    return checkoutSalon(scope, parse(checkoutSchema, { ...input, appointmentId: id, idempotencyKey: randomUUID() }));
  }
  if (["customers", "staff", "services"].includes(resource) && !action && ((method === "POST" && !id) || (method === "PATCH" && id))) {
    return withSerializableTransaction(async (tx) => {
      let entity: { id: string };
      if (resource === "customers") {
        const input = parse(customerSchema, body);
        if (id && !await tx.customer.findFirst({ where: { id, tenantId: scope.tenantId } })) throw missing();
        const data = { ...input, dni: input.dni || null, documentType: input.dni ? "DNI" : "NONE", phone: input.phone || null, email: input.email || null, notes: input.notes || null };
        entity = id ? await tx.customer.update({ where: { id }, data }) : await tx.customer.create({ data: { ...scoped(scope), ...data } });
      } else if (resource === "staff") {
        const input = parse(staffSchema, body);
        if (id && !await tx.staffMember.findFirst({ where: { id, ...scoped(scope) } })) throw missing();
        if (id && input.active === false && await tx.appointment.count({ where: { staffId: id, ...scoped(scope), status: { in: ["PENDING", "CONFIRMED"] }, endsAt: { gt: new Date() } } })) throw new AppError("PENDING_APPOINTMENTS", 409, "Reprograma o cancela las citas pendientes antes de desactivar al profesional.");
        entity = id ? await tx.staffMember.update({ where: { id }, data: { ...input, scheduleVersion: { increment: 1 } } }) : await tx.staffMember.create({ data: { ...scoped(scope), ...input } });
      } else {
        const input = parse(serviceSchema, body);
        if (id && !await tx.service.findFirst({ where: { id, ...scoped(scope) } })) throw missing();
        if (id && (input.active === false || input.staffIds?.length)) {
          const affected = await tx.appointment.count({ where: { ...scoped(scope), serviceId: id, status: { in: ["PENDING", "CONFIRMED"] }, endsAt: { gt: new Date() }, ...(input.active === false ? {} : { staffId: { notIn: input.staffIds } }) } });
          if (affected) throw new AppError("PENDING_APPOINTMENTS", 409, "Reprograma o cancela las citas afectadas antes de desactivar el servicio o cambiar sus profesionales habilitados.");
        }
        if (input.staffIds && await tx.staffMember.count({ where: { id: { in: [...new Set(input.staffIds)] }, ...scoped(scope), active: true } }) !== new Set(input.staffIds).size) throw missing();
        if (input.supplies && (new Set(input.supplies.map((s) => s.itemId)).size !== input.supplies.length || await tx.inventoryItem.count({ where: { id: { in: input.supplies.map((s) => s.itemId) }, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true } }) !== input.supplies.length)) throw new AppError("INVALID_SUPPLIES", 400, "Revisa los insumos; no deben repetirse ni pertenecer a otra sucursal.");
        const { price, staffIds, supplies, ...values } = input;
        const data = { ...values, priceCents: Math.round(price * 100) };
        entity = id ? await tx.service.update({ where: { id }, data }) : await tx.service.create({ data: { ...scoped(scope), ...data } });
        if (staffIds) { await tx.serviceStaff.deleteMany({ where: { serviceId: entity.id } }); for (const staffId of new Set(staffIds)) await tx.serviceStaff.create({ data: { serviceId: entity.id, staffId } }); }
        if (supplies) { await tx.serviceSupply.deleteMany({ where: { serviceId: entity.id } }); for (const supply of supplies) await tx.serviceSupply.create({ data: { serviceId: entity.id, ...supply } }); }
      }
      await salonAudit(tx, scope, id ? "UPDATE" : "CREATE", resource, entity.id);
      return { ok: true, id: entity.id, message: "Datos guardados correctamente." };
    });
  }
  if (resource === "appointments" && ((method === "POST" && !id) || (method === "PATCH" && id && action === "reschedule"))) {
    const input = id ? parse(appointmentSchema.omit({ customerId: true }), body) : parse(appointmentSchema, body);
    return withSerializableTransaction(async (tx) => {
      const previous = id ? await tx.appointment.findFirst({ where: { id, ...scoped(scope) }, include: { sale: true } }) : null;
      if (id && !previous) throw missing();
      if (previous && (previous.sale || ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(previous.status))) throw closed();
      for (const staffId of [...new Set([input.staffId, ...(previous ? [previous.staffId] : [])])].sort()) await lockStaff(tx, scope, staffId);
      const customerId = previous?.customerId ?? (input as z.infer<typeof appointmentSchema>).customerId;
      if (!await tx.customer.findFirst({ where: { id: customerId, tenantId: scope.tenantId, active: true } })) throw missing();
      const service = await tx.service.findFirst({ where: { id: input.serviceId, ...scoped(scope), active: true } });
      if (!service) throw missing();
      await assertSkill(tx, input.staffId, input.serviceId);
      const timezone = await timezoneFor(tx, scope), startsAt = instant(input.startsAt, timezone), endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60000);
      await assertAvailable(tx, scope, input.staffId, startsAt, endsAt, timezone, id);
      const data = { customerId, staffId: input.staffId, serviceId: input.serviceId, startsAt, endsAt, priceCents: service.priceCents, notes: input.notes || null, status: "PENDING" };
      if (!id) await assertTransactionalQuota(tx, scope.tenantId, "operations");
      const entity = id ? await tx.appointment.update({ where: { id }, data }) : await tx.appointment.create({ data: { ...scoped(scope), ...data } });
      await salonAudit(tx, scope, id ? "RESCHEDULE" : "CREATE", "Appointment", entity.id);
      return { ok: true, id: entity.id, message: id ? "Cita reprogramada." : "Cita guardada correctamente." };
    });
  }
  if (resource === "appointments" && method === "PATCH" && id && action === "status") {
    const input = parse(z.object({ status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]), reason: z.string().trim().max(300).optional() }), body);
    if (input.status === "COMPLETED") throw new AppError("CHECKOUT_REQUIRED", 409, "Completa la cita mediante el cobro.");
    return withSerializableTransaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({ where: { id, ...scoped(scope) }, include: { sale: true } });
      if (!appointment) throw missing();
      await lockStaff(tx, scope, appointment.staffId);
      if (appointment.sale || ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw closed();
      await tx.appointment.update({ where: { id }, data: { status: input.status } });
      await salonAudit(tx, scope, "STATUS_CHANGE", "Appointment", id, input);
      return { ok: true, id, message: "Estado actualizado." };
    });
  }
  if (resource === "schedules" && method === "POST" && !id) {
    const input = parse(scheduleSchema, body);
    if (input.startsAt >= input.endsAt) throw new AppError("INVALID_SCHEDULE", 400, "La hora final debe ser posterior al inicio.");
    return withSerializableTransaction(async (tx) => {
      await lockStaff(tx, scope, input.staffId);
      const entity = await tx.staffSchedule.upsert({ where: { staffId_weekday: { staffId: input.staffId, weekday: input.weekday } }, create: { ...scoped(scope), ...input }, update: input });
      const upcoming = await tx.appointment.findMany({ where: { ...scoped(scope), staffId: input.staffId, startsAt: { gt: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } } });
      const timezone = await timezoneFor(tx, scope);
      for (const a of upcoming) await assertAvailable(tx, scope, a.staffId, a.startsAt, a.endsAt, timezone, a.id);
      await salonAudit(tx, scope, "UPSERT", "StaffSchedule", entity.id);
      return { ok: true, id: entity.id, message: "Horario actualizado." };
    });
  }
  if (resource === "blocks" && method === "POST" && !id) {
    const input = parse(blockSchema, body);
    return withSerializableTransaction(async (tx) => {
      await lockStaff(tx, scope, input.staffId);
      const timezone = await timezoneFor(tx, scope), startsAt = instant(input.startsAt, timezone), endsAt = instant(input.endsAt, timezone);
      if (endsAt <= startsAt || endsAt.getTime() < Date.now()) throw new AppError("INVALID_BLOCK", 400, "Indica un intervalo vigente y una hora final posterior.");
      if (await tx.appointment.count({ where: { ...scoped(scope), staffId: input.staffId, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })) throw new AppError("PENDING_APPOINTMENTS", 409, "Reprograma las citas de ese intervalo antes de bloquearlo.");
      const block = await tx.staffTimeBlock.create({ data: { ...scoped(scope), ...input, startsAt, endsAt } });
      await salonAudit(tx, scope, "CREATE", "StaffTimeBlock", block.id);
      return { ok: true, id: block.id, message: "Horario bloqueado." };
    });
  }
  if (resource === "blocks" && method === "PATCH" && id && !action) return withSerializableTransaction(async (tx) => {
    const block = await tx.staffTimeBlock.findFirst({ where: { id, ...scoped(scope) } }); if (!block) throw missing();
    await lockStaff(tx, scope, block.staffId); await tx.staffTimeBlock.update({ where: { id }, data: { active: false } });
    await salonAudit(tx, scope, "CANCEL", "StaffTimeBlock", id); return { ok: true, id, message: "Bloqueo retirado." };
  });
  if (resource === "products" && method === "POST" && !id) {
    const input = parse(z.object({ itemId: z.string().min(1), priceCents: moneyCents.refine((v) => v > 0), active: z.boolean().default(true) }), body);
    return withSerializableTransaction(async (tx) => {
      if (!await tx.inventoryItem.findFirst({ where: { id: input.itemId, ...scoped(scope), active: true, kind: "PRODUCT" } })) throw new AppError("PRODUCT_REQUIRED", 400, "Crea un artículo de tipo Producto en Inventario para esta sucursal.");
      const product = await tx.salonProduct.upsert({ where: { itemId: input.itemId }, create: { ...scoped(scope), ...input }, update: { priceCents: input.priceCents, active: input.active } });
      await salonAudit(tx, scope, "UPSERT", "SalonProduct", product.id); return { ok: true, id: product.id, message: "Producto de venta actualizado." };
    });
  }
  if (resource === "promotions" && !action && ((method === "POST" && !id) || (method === "PATCH" && id))) {
    const input = parse(promotionSchema, body);
    return withSerializableTransaction(async (tx) => {
      const timezone = await timezoneFor(tx, scope), startsAt = input.startsAt ? instant(input.startsAt, timezone) : null, endsAt = input.endsAt ? instant(input.endsAt, timezone) : null;
      if (startsAt && endsAt && startsAt >= endsAt) throw new AppError("INVALID_PERIOD", 400, "El fin debe ser posterior al inicio.");
      if (id && !await tx.promotion.findFirst({ where: { id, ...scoped(scope), scope: "SALON" } })) throw missing();
      const data = { ...input, startsAt, endsAt, scope: "SALON", automatic: false };
      const p = id ? await tx.promotion.update({ where: { id }, data }) : await tx.promotion.create({ data: { ...scoped(scope), ...data } });
      await salonAudit(tx, scope, "SAVE", "Promotion", p.id); return { ok: true, id: p.id, message: "Promoción guardada." };
    });
  }
  if (resource === "cash" && method === "POST") {
    if (!id) {
      const input = parse(z.object({ openingAmount: z.coerce.number().min(0).max(1000000), idempotencyKey: z.string().min(8).max(120).optional() }), body);
      return withSerializableTransaction(async (tx) => { const result = await openCashSession(tx, scope, { openingCents: Math.round(input.openingAmount * 100), registerName: "Caja principal", idempotencyKey: input.idempotencyKey }); await salonAudit(tx, scope, "OPEN", "CashSession", result.session.id); return { ok: true, id: result.session.id, message: "Caja abierta." }; });
    }
    if (action === "close") {
      const input = parse(z.object({ countedAmount: z.coerce.number().min(0).max(1000000), expectedCents: moneyCents.optional(), notes: z.string().trim().max(500).optional() }), body);
      return withSerializableTransaction(async (tx) => { const result = await closeCashSession(tx, scope, { id, countedCents: Math.round(input.countedAmount * 100), expectedCents: input.expectedCents, notes: input.notes }); await salonAudit(tx, scope, "CLOSE", "CashSession", id, result); return { ok: true, id, message: `Caja cerrada. Diferencia: ${(result.differenceCents / 100).toFixed(2)}.` }; });
    }
    if (action === "movement") {
      const input = parse(z.object({ type: z.enum(["IN", "OUT"]), amountCents: moneyCents.refine((v) => v > 0), reason: z.string().trim().min(5).max(200), idempotencyKey: z.string().min(8).max(120) }), body);
      return withSerializableTransaction(async (tx) => { const result = await registerCashMovement(tx, scope, { ...input, cashSessionId: id }); await salonAudit(tx, scope, "MOVE", "CashSession", id); return { ok: true, id: result.movement.id, message: "Movimiento registrado." }; });
    }
  }
  if (resource === "commissions" && method === "POST" && !id) {
    const input = parse(z.object({ lineIds: z.array(z.string().min(1)).min(1).max(500), reference: z.string().trim().min(5).max(150) }), body);
    return withSerializableTransaction(async (tx) => {
      const rows = await tx.salonSaleLine.findMany({ where: { id: { in: input.lineIds }, commissionPaidAt: null, commissionCents: { gt: 0 }, salonSale: { ...scoped(scope), sale: { status: "PAID" } } } });
      if (rows.length !== new Set(input.lineIds).size) throw new AppError("COMMISSION_CHANGED", 409, "La selección contiene comisiones ya liquidadas o no disponibles.");
      for (const saleId of [...new Set(rows.map((r) => r.salonSaleId))].sort()) await tx.sale.updateMany({ where: { salonSaleId: saleId, status: "PAID" }, data: { status: "PAID" } });
      await tx.salonSaleLine.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { commissionPaidAt: new Date(), commissionPaymentReference: input.reference } });
      await salonAudit(tx, scope, "SETTLE", "SalonCommission", rows[0].id, { ...input, totalCents: rows.reduce((s, r) => s + r.commissionCents, 0) });
      return { ok: true, id: rows[0].id, message: "Pago externo de comisiones registrado. Si salió de caja, registra también el egreso con esta referencia." };
    });
  }
  throw missing();
}
