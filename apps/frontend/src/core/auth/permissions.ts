import { can } from "../rbac/permissions";

export function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function hasPermission(permissions: string[], required?: string): boolean {
  return can(permissions, required);
}
