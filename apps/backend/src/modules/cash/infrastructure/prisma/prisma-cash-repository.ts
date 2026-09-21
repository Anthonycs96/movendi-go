import { Prisma } from "@prisma/client";
import { CashError, CashConcurrencyError, type CashRepository, type CashScope, type CashMovementInput, type OpenCashInput } from "../../public";

export class PrismaCashRepository implements CashRepository {
  private readonly scope: { tenantId: string; branchId: string };
  constructor(private readonly tx: Prisma.TransactionClient, private readonly actor: CashScope) { this.scope = { tenantId: actor.tenantId, branchId: actor.branchId }; }
  findSession(id: string) { return this.tx.cashSession.findFirst({ where: { id, ...this.scope } }); }
  async findOpenSession(registerSlot?: string) {
    if (!registerSlot) return this.tx.cashSession.findFirst({ where: { ...this.scope, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    const sessions = await this.tx.cashSession.findMany({ where: { ...this.scope, status: "OPEN" } });
    // Old shifts used the shared OPEN slot. Preserve their identity until closure.
    return sessions.find((session) => session.activeSlot === registerSlot || `REGISTER:${session.registerName.normalize("NFKC").trim().toLocaleLowerCase("es-PE")}` === registerSlot) ?? null;
  }
  async createSession(input: OpenCashInput) {
    if (!await this.tx.branch.findFirst({ where: { id: this.scope.branchId, tenantId: this.scope.tenantId }, select: { id: true } })) throw new CashError("NOT_FOUND", "La sucursal no pertenece a esta empresa.");
    try { return await this.tx.cashSession.create({ data: { ...this.scope, id: input.requestId, cashRegisterId: input.cashRegisterId, openedById: this.actor.actorId, openingCents: input.openingCents, expectedCents: input.openingCents, registerName: input.registerName, openingNote: input.notes || null, activeSlot: input.registerSlot ?? "OPEN" } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CashConcurrencyError("Otra apertura ocupó la caja durante la operación.");
      throw error;
    }
  }
  async closeIfUnchanged(id: string, expectedCents: number, countedCents: number, notes?: string) {
    const updated = await this.tx.cashSession.updateMany({ where: { id, ...this.scope, status: "OPEN", expectedCents }, data: { status: "CLOSED", activeSlot: null, countedCents, closingNote: notes || null, closedById: this.actor.actorId, closedAt: new Date() } });
    return updated.count === 1;
  }
  async adjustOpenBalance(id: string, deltaCents: number) {
    const updated = await this.tx.cashSession.updateMany({ where: { id, ...this.scope, status: "OPEN", expectedCents: deltaCents <= 0 ? { gte: -deltaCents } : { lte: 2_147_483_647 - deltaCents } }, data: { expectedCents: { increment: deltaCents } } });
    return updated.count === 1;
  }
  findMovement(id: string) { return this.tx.cashMovement.findFirst({ where: { id, ...this.scope } }); }
  createMovement(input: CashMovementInput) { return this.tx.cashMovement.create({ data: { ...this.scope, id: input.requestId, cashSessionId: input.cashSessionId, createdById: this.actor.actorId, type: input.type, amountCents: input.amountCents, reason: input.reason, notes: input.notes || null } }); }
}
