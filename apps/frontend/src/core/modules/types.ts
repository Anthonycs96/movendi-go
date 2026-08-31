import type { IndustryId } from "@/core/tenancy/types";
import type { Permission } from "@/core/rbac/permissions";

export type IconKey =
  | "dashboard"
  | "calendar"
  | "scissors"
  | "team"
  | "customers"
  | "cash"
  | "floor"
  | "menu"
  | "orders"
  | "kitchen"
  | "settings"
  | "route"
  | "truck"
  | "driver"
  | "shield"
  | "fuel"
  | "wrench"
  | "tire"
  | "reports"
  | "discount"
  | "inventory";

export interface NavigationItem {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: IconKey;
  group: "overview" | "operations" | "commerce" | "system";
  permission?: Permission;
}

export interface BusinessModuleManifest {
  id: string;
  industry: IndustryId;
  name: string;
  description: string;
  navigation: NavigationItem[];
  defaultPath: string;
}
