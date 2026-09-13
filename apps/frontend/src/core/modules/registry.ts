import { minimarketManifest } from "@/modules/minimarket/manifest";
import type { BusinessModuleManifest } from "./types";
import type { IndustryId } from "@/core/tenancy/types";
import { barbershopManifest } from "@/modules/barbershop/manifest";
import { restaurantManifest } from "@/modules/restaurant/manifest";
import { transportManifest } from "@/modules/transport/manifest";

const manifests: Record<IndustryId, BusinessModuleManifest> = {
  minimarket: minimarketManifest,
  barbershop: barbershopManifest,
  restaurant: restaurantManifest,
  transport: transportManifest,
};

export function getManifest(industry: IndustryId): BusinessModuleManifest {
  return manifests[industry];
}

export function isValidModulePath(manifest: BusinessModuleManifest, path: string): boolean {
  return manifest.navigation.some((item) => item.path === path);
}
