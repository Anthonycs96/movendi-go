import { createHash, randomUUID } from "node:crypto";

export function operationCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export function inventoryCountCode(branchId: string, idempotencyKey?: string) {
  return idempotencyKey
    ? `CNT-${createHash("sha256").update(`${branchId}:${idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`
    : operationCode("CNT");
}
