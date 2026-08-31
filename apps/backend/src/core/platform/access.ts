export type PlatformRole = "SUPER_ADMIN" | "SUPPORT" | "FINANCE" | "ANALYST";
export type PlatformSection = "dashboard" | "businesses" | "plans" | "subscriptions" | "billing" | "users" | "audit" | "catalog" | "settings";

const sectionAccess: Record<PlatformRole, PlatformSection[]> = {
  SUPER_ADMIN: ["dashboard", "businesses", "plans", "subscriptions", "billing", "users", "audit", "catalog", "settings"],
  SUPPORT: ["dashboard", "businesses", "audit", "catalog", "settings"],
  FINANCE: ["dashboard", "plans", "subscriptions", "billing", "audit"],
  ANALYST: ["dashboard", "businesses", "subscriptions", "billing", "audit", "catalog"],
};

export function isPlatformRole(value: string | null): value is PlatformRole {
  return value === "SUPER_ADMIN" || value === "SUPPORT" || value === "FINANCE" || value === "ANALYST";
}

export function canAccessPlatformSection(role: PlatformRole, section: PlatformSection) {
  return sectionAccess[role].includes(section);
}

export function canManagePlatformResource(role: PlatformRole, resource: string) {
  if (role === "SUPER_ADMIN") return true;
  if (role === "SUPPORT") return resource === "businesses";
  if (role === "FINANCE") return resource === "plans" || resource === "subscriptions";
  return false;
}
