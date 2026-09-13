import assert from "node:assert/strict";
import test from "node:test";
import { InventoryError } from "../../domain/stock-movement";
import { InventoryConcurrencyError, type InventoryMovementRecord, type InventoryRepository, type InventoryScope, type InventoryStockItem } from "../ports/inventory-repository";
import { applyInventoryMovementUseCase, type InventoryMovementInput } from "./apply-inventory-movement";

const scope: InventoryScope = { tenantId: "tenant", branchId: "branch", actorId: "actor" };
const input: InventoryMovementInput = { itemId: "item", type: "CONSUMPTION", direction: "OUT", quantity: 1, originType: "MANUAL", idempotencyKey: "movement-key" };

function memoryRepository() {
  let item: InventoryStockItem = { id: "item", branchId: scope.branchId, name: "Última unidad", unit: "UND", stock: 1, unitCostCents: 100, trackStock: true };
  const records: InventoryMovementRecord[] = [];
  const repository: InventoryRepository = {
    async findMovementByKey(key) { return records.find((entry) => entry.idempotencyKey === key) ?? null; },
    async findActiveItem(id) { return id === item.id ? { ...item } : null; },
    async updateStockIfUnchanged(previous, stockAfter, unitCostCents) {
      if (previous.stock !== item.stock) return false;
      item = { ...item, stock: stockAfter, unitCostCents };
      return true;
    },
    async recordMovement(draft) {
      const record = { ...draft, ...scope, id: `movement-${records.length}`, createdAt: new Date() };
      records.push(record);
      return record;
    },
  };
  return { repository, records, stock: () => item.stock };
}

test("dos consumidores de la última unidad no crean dos movimientos", async () => {
  const memory = memoryRepository();
  const result = await Promise.allSettled([
    applyInventoryMovementUseCase(memory.repository, scope, input),
    applyInventoryMovementUseCase(memory.repository, scope, { ...input, idempotencyKey: "other" }),
  ]);
  assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
  const failure = result.find((entry) => entry.status === "rejected");
  assert.ok(failure?.status === "rejected" && failure.reason instanceof InventoryConcurrencyError);
  assert.equal(memory.stock(), 0);
  assert.equal(memory.records.length, 1);
});

test("replay mantiene el resultado y no consume nuevamente; clave incompatible se rechaza", async () => {
  const memory = memoryRepository();
  const first = await applyInventoryMovementUseCase(memory.repository, scope, input);
  assert.deepEqual(await applyInventoryMovementUseCase(memory.repository, scope, input), first);
  for (const change of [{ quantity: 2 }, { direction: "IN" as const }, { type: "LOSS" }, { itemId: "another" }]) {
    await assert.rejects(applyInventoryMovementUseCase(memory.repository, scope, { ...input, ...change }), (error) => error instanceof InventoryError && error.code === "IDEMPOTENCY_CONFLICT");
  }
  assert.equal(memory.records.length, 1);
  assert.equal(memory.stock(), 0);
});

test("artículo inexistente y fallo técnico conservan su significado", async () => {
  const memory = memoryRepository();
  await assert.rejects(applyInventoryMovementUseCase(memory.repository, scope, { ...input, itemId: "missing" }), (error) => error instanceof InventoryError && error.code === "INVENTORY_ITEM_NOT_FOUND");
  const failure = new Error("Persistencia no disponible");
  memory.repository.findActiveItem = async () => { throw failure; };
  await assert.rejects(applyInventoryMovementUseCase(memory.repository, scope, input), (error) => error === failure);
  assert.equal(memory.records.length, 0);
});
