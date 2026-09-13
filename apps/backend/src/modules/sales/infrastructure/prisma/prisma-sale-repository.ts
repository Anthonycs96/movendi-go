import { Prisma } from "@prisma/client";
import type { CommercialSnapshot, RecordSaleInput, SaleOrigin, SaleRepository, SaleScope } from "../../public";
import { SalesError } from "../../public";

export class PrismaSaleRepository implements SaleRepository {
  private readonly scope: SaleScope;
  constructor(private readonly tx: Prisma.TransactionClient, scope: SaleScope) { this.scope = { tenantId: scope.tenantId, branchId: scope.branchId }; }

  async currencyForContext(input: Pick<RecordSaleInput, "customerId" | "cashSessionId" | "origin">) {
    const { tenantId, branchId } = this.scope;
    const branch = await this.tx.branch.findFirst({ where: { id: branchId, tenantId }, select: { tenant: { select: { currency: true } } } });
    if (!branch) return null;
    const origin = input.origin.kind === "ORDER"
      ? await this.tx.restaurantOrder.findFirst({ where: { id: input.origin.id, tenantId, branchId }, select: { id: true } })
      : input.origin.kind === "RETAIL" ? await this.tx.retailSale.findFirst({ where: { id: input.origin.id, tenantId, branchId }, select: { id: true } }) : await this.tx.appointment.findFirst({ where: { id: input.origin.id, tenantId, branchId }, select: { id: true } });
    if (!origin) return null;
    if (input.customerId && !await this.tx.customer.findFirst({ where: { id: input.customerId, tenantId }, select: { id: true } })) return null;
    if (input.cashSessionId && !await this.tx.cashSession.findFirst({ where: { id: input.cashSessionId, tenantId, branchId }, select: { id: true } })) return null;
    return branch.tenant.currency;
  }

  async existsForOrigin(origin: SaleOrigin) {
    return !!await this.tx.sale.findFirst({ where: { ...this.scope, ...(origin.kind === "ORDER" ? { orderId: origin.id } : origin.kind === "RETAIL" ? { retailSaleId: origin.id } : { appointmentId: origin.id }) }, select: { id: true } });
  }

  async create(input: RecordSaleInput, snapshot: CommercialSnapshot) {
    const { origin, detail, payments, ...fields } = input;
    void detail;
    try { return await this.tx.sale.create({ data: {
      ...fields, ...this.scope,
      ...(origin.kind === "ORDER" ? { orderId: origin.id } : origin.kind === "RETAIL" ? { retailSaleId: origin.id } : { appointmentId: origin.id }),
      commercialSnapshot: JSON.stringify(snapshot),
      ...(payments ? { payments: { create: payments.map((payment) => ({ ...payment, ...this.scope })) } } : {}),
    } }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        if (Array.isArray(target) && target.some((field) => field === "orderId" || field === "appointmentId" || field === "retailSaleId")) throw new SalesError("ALREADY_PAID", "El origen de esta venta ya fue cobrado.");
      }
      throw error;
    }
  }
}
