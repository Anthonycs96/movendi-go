export interface AuthSession {
  sessionId: string;
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantShortName: string;
  tenantType: "BARBERSHOP" | "RESTAURANT" | "TRANSPORT";
  tenantLocale: string;
  tenantCurrency: string;
  tenantTimezone: string;
  branchId: string;
  branchName: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
  enabledModules: string[];
  platformRole: string | null;
  mustChangePassword: boolean;
  expiresAt: Date;
}

export interface TenantScope {
  tenantId: string;
  branchId: string;
  actorId: string;
  permissions: string[];
}
