import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import type { InventoryOnHandReservations } from "../public";

export const noOnHandReservations: InventoryOnHandReservations = {
  async quantitiesFor() { return new Map<string, number>(); },
};

/** Supplied by the composition root; inventory does not select industry rules. */
export type InventoryCommandPolicies = {
  validateUnit?: (unit: string) => Promise<void>;
  preventNegativeStock?: () => Promise<boolean>;
  onHandReservations?: (transaction: Prisma.TransactionClient, scope: TenantScope) => InventoryOnHandReservations;
};
