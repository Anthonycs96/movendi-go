export type IndustryId = "barbershop" | "restaurant" | "transport" | "minimarket";

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  timezone: string;
  isPrimary: boolean;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  industry: IndustryId;
  plan: "Starter" | "Growth" | "Scale";
  currency: "PEN";
  enabledModules: string[];
  branches: Branch[];
}

export interface TenantScope {
  tenantId: string;
  branchId: string;
  actorId: string;
}

export interface SessionActor {
  id: string;
  name: string;
  email: string;
  roleName: string;
  permissions: string[];
}
