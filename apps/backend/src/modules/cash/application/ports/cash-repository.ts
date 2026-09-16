export type CashScope = { tenantId: string; branchId: string; actorId: string };
export type CashSession = { id: string; status: string; openingCents: number; expectedCents: number; registerName: string; openingNote: string | null };
export type OpenCashInput = { requestId?: string; openingCents: number; registerName: string; notes?: string; registerSlot?: string };
export type CashMovement = { id: string; cashSessionId: string; type: string; amountCents: number; reason: string; notes: string | null };
export type CashMovementInput = { requestId?: string; cashSessionId: string; type: "IN" | "OUT"; amountCents: number; reason: string; notes?: string };
export interface CashRepository {
  findSession(id: string): Promise<CashSession | null>;
  findOpenSession(registerSlot?: string): Promise<CashSession | null>;
  createSession(input: OpenCashInput): Promise<CashSession>;
  closeIfUnchanged(id: string, expectedCents: number, countedCents: number, notes?: string): Promise<boolean>;
  adjustOpenBalance(id: string, deltaCents: number): Promise<boolean>;
  findMovement(id: string): Promise<CashMovement | null>;
  createMovement(input: CashMovementInput): Promise<CashMovement>;
}
