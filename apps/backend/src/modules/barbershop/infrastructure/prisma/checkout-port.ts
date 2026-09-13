import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import type { TenantScope } from "@/core/auth/types";
import { TransactionConflictError } from "@/core/database/transactions";
import { recordSale } from "@/modules/sales/server/service";
import { applyCashEffect } from "@/modules/cash/server/service";
import type { AppointmentCheckoutPort, AppointmentForCheckout } from "../../application/checkout";

type Sale = Awaited<ReturnType<typeof recordSale>>;
export class PrismaAppointmentCheckout implements AppointmentCheckoutPort<Sale> {
  private origin: Awaited<ReturnType<PrismaAppointmentCheckout["loadAppointment"]>> = null;
  constructor(private readonly tx: Prisma.TransactionClient, private readonly scope: TenantScope, private readonly id: string) {}
  private loadAppointment() { return this.tx.appointment.findFirst({ where: { id: this.id, tenantId: this.scope.tenantId, branchId: this.scope.branchId }, include: { sale: true, service: true } }); }
  async appointment() { this.origin = await this.loadAppointment(); return this.origin ? { ...this.origin, paid: Boolean(this.origin.sale) } : null; }
  cash() { return this.tx.cashSession.findFirst({ where: { tenantId: this.scope.tenantId, branchId: this.scope.branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } }); }
  async claim(appointment: AppointmentForCheckout) {
    const result = await this.tx.appointment.updateMany({ where: { id: appointment.id, tenantId: this.scope.tenantId, branchId: this.scope.branchId, status: appointment.status, updatedAt: this.origin!.updatedAt, sale: null }, data: { status: "COMPLETED" } });
    if (result.count !== 1) throw new TransactionConflictError("La cita cambió durante el cobro.");
  }
  record(appointment: AppointmentForCheckout, cashId: string, paymentMethod: string) {
    return recordSale(this.tx, this.scope, {
      origin: { kind: "APPOINTMENT", id: appointment.id }, customerId: this.origin!.customerId, cashSessionId: cashId,
      code: `VTA-N-${Date.now().toString().slice(-7)}-${randomBytes(4).toString("hex")}`, paymentMethod,
      totalCents: appointment.priceCents, subtotalCents: appointment.priceCents,
      payments: [{ method: paymentMethod, amountCents: appointment.priceCents, reference: null }],
      detail: { subtotalCents: appointment.priceCents, chargesCents: 0, lines: [{ sourceLineId: appointment.id, name: this.origin!.service.name, quantity: 1, unitPriceCents: appointment.priceCents, totalCents: appointment.priceCents }] },
    });
  }
  async applyCash(id: string, delta: number) { await applyCashEffect(this.tx, this.scope, id, delta, { code: "CASH_CLOSED", message: "La caja se cerró durante el cobro. Actualiza la operación." }); }
  async audit(sale: Sale) {
    await this.tx.auditLog.create({ data: { tenantId: this.scope.tenantId, branchId: this.scope.branchId, userId: this.scope.actorId, action: "CHECKOUT", entityType: "Sale", entityId: sale.id, metadata: JSON.stringify({ appointmentId: this.id, balanceBasis: "CASH_ONLY" }) } });
  }
}
