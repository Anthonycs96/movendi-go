import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { expenseSchema, expenseStatusSchema, paymentSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { assertTenantConfigured, getTransportConfiguration, hasStoredTransportConfiguration } from "../configuration";

export const handleFinanceCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "expenses") {
    const input = parse(expenseSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.finance.expenseCategories, input.category, "El concepto de gasto");
    if (await hasStoredTransportConfiguration(scope.tenantId) && input.amount >= configuration.finance.requireReceiptAboveCents && !input.receiptNo) throw new AppError("RECEIPT_REQUIRED", 400, "Este monto requiere número de comprobante según la configuración de la empresa.");
    if (input.tripId) await owned(prisma.transportTrip.findFirst({ where: { id: input.tripId, tenantId: scope.tenantId }, select: { id: true } }), "El viaje");
    const entity = await prisma.transportExpense.create({ data: { tenantId: scope.tenantId, tripId: input.tripId || null, category: input.category, description: input.description, amountCents: input.amount, occurredAt: input.occurredAt, receiptNo: input.receiptNo || null } });
    await audit(scope, "CREATE", "TransportExpense", entity.id);
    return { ok: true, id: entity.id, message: "Gasto registrado para aprobación." };
  }

  if (method === "PATCH" && resource === "expenses" && id && action === "status") {
    const input = parse(expenseStatusSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.finance.expenseStatuses, input.status, "El estado de gasto");
    const expense = await owned(prisma.transportExpense.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true, amountCents: true } }), "El gasto");
    if (input.status === "APPROVED" && await hasStoredTransportConfiguration(scope.tenantId) && expense.amountCents >= configuration.finance.approvalLimitCents) {
      const membership = await prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.actorId, active: true }, select: { role: { select: { key: true } } } });
      if (!membership || !configuration.finance.approvalRoleKeys.includes(membership.role.key)) throw new AppError("APPROVAL_ROLE_REQUIRED", 403, "Este monto solo puede aprobarlo uno de los roles responsables configurados.");
    }
    await prisma.transportExpense.update({ where: { id }, data: { status: input.status } });
    await audit(scope, "STATUS_CHANGE", "TransportExpense", id, input);
    return { ok: true, id, message: "Estado del gasto actualizado." };
  }

  if (method === "POST" && resource === "settlements" && id && action === "calculate") {
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true, freightCents: true } }), "El viaje");
    const aggregate = await prisma.transportExpense.aggregate({ where: { tenantId: scope.tenantId, tripId: id, status: "APPROVED" }, _sum: { amountCents: true } });
    const expenseCents = aggregate._sum.amountCents ?? 0;
    const entity = await prisma.transportSettlement.upsert({ where: { tripId: id }, update: { incomeCents: trip.freightCents, expenseCents, balanceCents: trip.freightCents - expenseCents }, create: { tenantId: scope.tenantId, tripId: id, incomeCents: trip.freightCents, expenseCents, balanceCents: trip.freightCents - expenseCents } });
    await audit(scope, "CALCULATE", "TransportSettlement", entity.id);
    return { ok: true, id: entity.id, message: "Liquidación recalculada y guardada." };
  }

  if (method === "POST" && resource === "settlements" && id && action === "close") {
    const settlement = await owned(prisma.transportSettlement.findFirst({ where: { id, tenantId: scope.tenantId }, include: { trip: { select: { status: true } } } }), "La liquidación");
    if (settlement.status === "CLOSED") throw new AppError("SETTLEMENT_CLOSED", 409, "La liquidación ya está cerrada.");
    if (settlement.trip.status !== "DELIVERED") throw new AppError("TRIP_NOT_DELIVERED", 409, "Solo se puede cerrar un viaje entregado.");
    const pending = await prisma.transportExpense.count({ where: { tenantId: scope.tenantId, tripId: settlement.tripId, status: "PENDING" } });
    if (pending) throw new AppError("PENDING_EXPENSES", 409, "Aprueba o rechaza todos los gastos antes de cerrar.");
    await prisma.transportSettlement.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    await audit(scope, "CLOSE", "TransportSettlement", id, { balanceCents: settlement.balanceCents });
    return { ok: true, id, message: "Liquidación cerrada y persistida." };
  }

  if (method === "POST" && resource === "payments") {
    const input = parse(paymentSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.finance.paymentMethods, input.method, "El medio de pago");
    if (input.tripId) await owned(prisma.transportTrip.findFirst({ where: { id: input.tripId, tenantId: scope.tenantId }, select: { id: true } }), "El viaje");
    const entity = await prisma.transportPayment.create({ data: { tenantId: scope.tenantId, tripId: input.tripId || null, direction: input.direction, partyType: input.partyType, partyId: input.partyId || null, category: input.category, amountCents: input.amount, method: input.method, reference: input.reference || null, paidAt: input.paidAt } });
    await audit(scope, "CREATE", "TransportPayment", entity.id);
    return { ok: true, id: entity.id, message: "Pago contabilizado." };
  }

  return null;
};
