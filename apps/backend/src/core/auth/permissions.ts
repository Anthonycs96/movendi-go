export function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const legacyPermissionImplications: Record<string, readonly string[]> = {
  "restaurant:kitchen:read": ["restaurant:printing:read"],
  "restaurant:kitchen:write": ["restaurant:printing:read", "restaurant:printing:write"],
  "restaurant:read": [
    "restaurant:menu:read",
    "restaurant:promotions:read",
    "restaurant:reports:read",
    "restaurant:printing:read",
    "restaurant:configuration:read",
    "restaurant:sunat:read",
  ],
  "restaurant:write": [
    "restaurant:menu:read",
    "restaurant:menu:write",
    "restaurant:promotions:read",
    "restaurant:promotions:write",
    "restaurant:sunat:read",
    "restaurant:sunat:write",
  ],
  "settings:write": [
    "restaurant:configuration:read",
    "restaurant:configuration:write",
    "restaurant:printing:read",
    "restaurant:printing:write",
  ],
};

export function hasPermission(permissions: string[], required?: string): boolean {
  if (!required || permissions.includes("*") || permissions.includes(required)) return true;
  if (required.endsWith(":read") && permissions.includes(`${required.slice(0, -5)}:write`)) return true;
  return permissions.some((permission) => legacyPermissionImplications[permission]?.includes(required));
}
