export type Permission = string;

const legacyPermissionImplications: Record<string, readonly string[]> = {
  "restaurant:read": ["restaurant:menu:read", "restaurant:promotions:read", "restaurant:reports:read", "restaurant:printing:read", "restaurant:configuration:read", "restaurant:sunat:read"],
  "restaurant:write": ["restaurant:menu:read", "restaurant:menu:write", "restaurant:promotions:read", "restaurant:promotions:write", "restaurant:sunat:read", "restaurant:sunat:write"],
  "settings:write": ["restaurant:configuration:read", "restaurant:configuration:write", "restaurant:printing:read", "restaurant:printing:write"],
};

export function can(permissions: readonly string[], required?: Permission): boolean {
  if (!required) return true;
  if (permissions.includes("*") || permissions.includes(required)) return true;
  if (required.endsWith(":read") && permissions.includes(`${required.slice(0, -5)}:write`)) return true;
  return permissions.some((permission) => legacyPermissionImplications[permission]?.includes(required));
}
