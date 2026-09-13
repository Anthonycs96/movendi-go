export { applyInventoryMovementUseCase, type InventoryMovementInput } from "./application/use-cases/apply-inventory-movement";
export { InventoryConcurrencyError, type InventoryRepository, type InventoryScope } from "./application/ports/inventory-repository";
export { InventoryError } from "./domain/stock-movement";
export { registerInventoryPurchaseUseCase, type InventoryPurchaseInput } from "./application/use-cases/register-inventory-purchase";
export { registerInventoryCountUseCase, type InventoryCountInput } from "./application/use-cases/register-inventory-count";
export type { InventoryOnHandReservations } from "./application/ports/inventory-count-repository";
