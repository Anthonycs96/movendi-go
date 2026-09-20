import { activePromotions } from "../../server/promotions";
import { promotionalPrice } from "../../domain/promotions";
import { assertRetailCash } from "../../server/cash-access";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { TransactionConflictError } from "@/core/database/transactions";
import { assertTransactionalQuota } from "@/core/platform/entitlements";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { recordSale, validateSalePayments } from "@/modules/sales/server/service";
import { applyCashEffect } from "@/modules/cash/server/service";
import { retailFiscalSettings } from "../../server/fiscal";
import { queueSaleDocument } from "@/modules/invoicing/server/outbox";
import { allocateLots } from "../../domain/retail";
import type { CheckoutInput, CheckoutLine, CheckoutPort } from "../../application/checkout";

export class PrismaCheckoutPort implements CheckoutPort {
  private promotions?: ReturnType<typeof activePromotions>;
  private readonly pricedAt = new Date();
  private readonly where: { tenantId: string; branchId: string };
  constructor(private readonly tx: Prisma.TransactionClient, private readonly scope: TenantScope, private readonly today: string) { this.where = { tenantId: scope.tenantId, branchId: scope.branchId }; }
  checkQuota() { return assertTransactionalQuota(this.tx, this.scope.tenantId, "operations"); }
  async presentation(id: string) {
    const row = await this.tx.retailPresentation.findFirst({ where: { id, ...this.where, active: true, product: { ...this.where, item: { active: true } } }, include: { product: { include: { item: true } } } });
    return row ? { id: row.id, productId: row.productId, itemId: row.product.itemId, name: `${row.product.item.name} · ${row.name}`, factor: row.factor, weighted: row.weighted, priceCents: row.priceCents, unitCostCents: row.product.item.unitCostCents, taxCategory: row.product.taxCategory, unitCode: row.weighted ? (row.product.item.unit === "KG" ? "KGM" : "LTR") : "NIU", trackExpiry: row.product.trackExpiry } : null;
  }
  async price(line: Omit<CheckoutLine, "allocations">) { return { ...line, ...promotionalPrice(line, await (this.promotions ??= activePromotions(this.tx, this.scope, this.pricedAt))) }; }
  async consume(line: Omit<CheckoutLine, "allocations">) {
    if (!line.trackExpiry) return [];
    const lots = await this.tx.retailLot.findMany({ where: { productId: line.productId, product: this.where, stock: { gt: 0 } } });
    const allocations = allocateLots(lots, line.baseQuantity, this.today);
    for (const allocation of allocations) {
      const before = lots.find((lot) => lot.id === allocation.lotId)!;
      const updated = await this.tx.retailLot.updateMany({ where: { id: before.id, stock: before.stock, product: this.where }, data: { stock: Math.round((before.stock - allocation.quantity) * 1e6) / 1e6 } });
      if (updated.count !== 1) throw new TransactionConflictError("El lote cambió durante el cobro.");
    }
    return allocations;
  }
  async validatePayments(totalCents: number, input: CheckoutInput) {
    const tenant = await this.tx.tenant.findUniqueOrThrow({ where: { id: this.scope.tenantId }, select: { paymentMethods: true } });
    const allowed = JSON.parse(tenant.paymentMethods) as string[];
    if (input.payments.some((payment) => !allowed.includes(payment.method))) throw new AppError("PAYMENT_METHOD_DISABLED", 409, "Uno de los métodos de pago está deshabilitado.");
    if (input.payments.some((p) => ["YAPE", "PLIN", "TRANSFER", "OTHER"].includes(p.method) && p.amountCents > 0) && !input.digitalPaymentConfirmed) throw new AppError("PAYMENT_NOT_CONFIRMED", 409, "Confirma que recibiste el pago digital antes de cobrar.");
    return validateSalePayments(totalCents, input.payments, input.cashReceivedCents);
  }
  async record(lines: CheckoutLine[], input: CheckoutInput, totalCents: number, payment: Awaited<ReturnType<CheckoutPort["validatePayments"]>>) {
    await assertRetailCash(this.tx, this.scope, input.cashSessionId);
    const fiscal = await retailFiscalSettings(this.tx, this.scope);
    const customer = input.customerId ? await this.tx.customer.findFirst({ where: { id: input.customerId, tenantId: this.scope.tenantId }, select: { name: true, dni: true } }) : null;
    const retail = await this.tx.retailSale.create({ data: { ...this.where, lines: { create: lines.map((line) => ({ itemId: line.itemId, presentationId: line.id, name: line.name, factor: line.factor, quantity: line.quantity, unitPriceCents: line.priceCents, totalCents: line.totalCents, discountCents: line.discountCents ?? 0, promotionName: line.promotionName, unitCostCents: line.unitCostCents, allocations: JSON.stringify(line.allocations) })) } }, include: { lines: true } });
    const linesById = new Map(lines.map((line) => [line.id, line]));
    const detailLines = retail.lines.map((line) => {
      const presentation = linesById.get(line.presentationId)!;
      return { sourceLineId: line.id, fiscalQuantity: presentation.weighted ? Math.round(line.quantity * line.factor * 1e6) / 1e6 : line.quantity, taxCategory: presentation.taxCategory, unitCode: presentation.unitCode, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, totalCents: line.totalCents + line.discountCents, discountCents: line.discountCents, promotionName: line.promotionName, unitCostCents: Math.round(line.unitCostCents * line.factor) };
    });
    const discountCents = lines.reduce((sum, line) => sum + (line.discountCents ?? 0), 0);
    const subtotalCents = totalCents + discountCents;
    const sale = await recordSale(this.tx, this.scope, {
      origin: { kind: "RETAIL", id: retail.id }, code: `MM-${retail.id}`, customerId: input.customerId ?? null,
      cashSessionId: input.cashSessionId, cashierId: this.scope.actorId, paymentMethod: payment.paymentMethod, payments: input.payments,
      subtotalCents, discountCents, promotionName: lines.map((l) => l.promotionName).filter(Boolean).join(" / ") || null, totalCents, cashReceivedCents: input.cashReceivedCents, changeCents: payment.changeCents,
      detail: { fiscal: { taxRatePct: fiscal.taxRatePct, taxIncluded: true, customerName: customer?.name ?? "CLIENTE VARIOS", customerDocument: customer?.dni ?? "" }, subtotalCents, chargesCents: 0, lines: detailLines },
    });
    for (const line of lines) await applyInventoryMovement(this.tx, this.scope, { itemId: line.itemId, type: "SALE", direction: "OUT", quantity: line.baseQuantity, originType: "RETAIL_SALE", originId: retail.id, saleId: sale.id, preventNegativeStock: true });
    // Even a non-cash sale verifies that the requested shift is still open.
    await applyCashEffect(this.tx, this.scope, input.cashSessionId, payment.cashCents);
    if (input.documentKind && input.documentKind !== "TICKET") await queueSaleDocument(this.tx, this.scope, sale.id, input.documentKind, fiscal);
    return { id: sale.id, code: sale.code, totalCents: sale.totalCents, changeCents: sale.changeCents };
  }
}
