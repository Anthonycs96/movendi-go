export function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function hasPermission(permissions: string[], required?: string): boolean {
  return !required || permissions.includes("*") || permissions.includes(required);
}
