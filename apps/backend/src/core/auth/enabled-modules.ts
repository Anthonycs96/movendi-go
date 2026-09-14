/** Reports are a core restaurant section; role permissions still govern access. */
export function effectiveModules(tenantType: string, modules: string[]): string[] {
  // An empty list is the existing convention for all modules enabled.
  if (tenantType !== "RESTAURANT" || !modules.length || modules.includes("reports")) return modules;
  return [...modules, "reports"];
}
