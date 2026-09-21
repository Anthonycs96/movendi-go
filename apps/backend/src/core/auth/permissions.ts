export function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const legacyPermissionImplications: Record<string, readonly string[]> = {
  "inventory:items:create": ["inventory:read"],
  "inventory:items:edit": ["inventory:read"],
  "inventory:purchases:write": ["inventory:read"],
  "inventory:costs:write": ["inventory:read"],
  "inventory:adjust:write": ["inventory:read"],
  "restaurant:products:create": ["restaurant:menu:read"],
  "restaurant:products:edit": ["restaurant:menu:read"],
  "restaurant:prices:write": ["restaurant:menu:read"],
  "restaurant:publish:write": ["restaurant:menu:read"],
  "restaurant:cash:write": ["restaurant:orders:charge", "restaurant:cash:read", "restaurant:cash:open", "restaurant:cash:close", "restaurant:cash:movement"],
  "restaurant:orders:charge": ["restaurant:cash:read", "restaurant:orders:read"],
  "restaurant:cash:open": ["restaurant:cash:read"],
  "restaurant:cash:close": ["restaurant:cash:read"],
  "restaurant:cash:movement": ["restaurant:cash:read"],
  "restaurant:orders:serve": ["restaurant:orders:read"],
  "minimarket:cash:write": ["minimarket:cash:read","minimarket:cash:open","minimarket:cash:close","minimarket:cash:movement"],
  "minimarket:cash:open": ["minimarket:cash:read"],
  "minimarket:cash:close": ["minimarket:cash:read"],
  "minimarket:cash:movement": ["minimarket:cash:read"],
  "restaurant:menu:write": ["restaurant:products:create", "restaurant:products:edit", "restaurant:prices:write", "restaurant:publish:write", "inventory:costs:write"],
  "inventory:write": ["inventory:items:create", "inventory:items:edit", "inventory:purchases:write", "inventory:costs:write", "inventory:adjust:write","minimarket:purchases:write","minimarket:counts:write"],
  "minimarket:catalog:write": ["minimarket:prices:write"],
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
  "restaurant:write": ["restaurant:products:create", "restaurant:products:edit", "restaurant:prices:write", "restaurant:publish:write", "inventory:costs:write",
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
