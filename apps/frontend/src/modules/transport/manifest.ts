import type { BusinessModuleManifest } from "@/core/modules/types";

export const transportManifest: BusinessModuleManifest = {
  id: "transport",
  industry: "transport",
  name: "Transporte y logística",
  description: "Operación, flota, jornadas, seguridad y rentabilidad.",
  defaultPath: "dashboard",
  navigation: [
    { id: "transport-dashboard", label: "Centro operativo", description: "Pulso y alertas", path: "dashboard", icon: "dashboard", group: "overview", permission: "dashboard:read" },
    { id: "transport-operations", label: "Operaciones", description: "Plan, viajes y seguimiento", path: "operations", icon: "route", group: "operations", permission: "transport:operations:read" },
    { id: "transport-fleet", label: "Flota", description: "Vehículos y remolques", path: "fleet", icon: "truck", group: "operations", permission: "transport:fleet:read" },
    { id: "transport-drivers", label: "Conductores", description: "Jornadas y descansos", path: "drivers", icon: "driver", group: "operations", permission: "transport:drivers:read" },
    { id: "transport-documents", label: "Documentos", description: "Vigencias y seguridad", path: "documents", icon: "shield", group: "operations", permission: "transport:documents:read" },
    { id: "transport-finance", label: "Finanzas", description: "Gastos y liquidaciones", path: "finance", icon: "cash", group: "commerce", permission: "transport:finance:read" },
    { id: "transport-fuel", label: "Combustible", description: "Cargas y rendimiento", path: "fuel", icon: "fuel", group: "commerce", permission: "transport:fuel:read" },
    { id: "transport-maintenance", label: "Mantenimiento", description: "Órdenes y talleres", path: "maintenance", icon: "wrench", group: "commerce", permission: "transport:maintenance:read" },
    { id: "transport-inventory", label: "Inventario", description: "Repuestos, compras y stock", path: "inventory", icon: "inventory", group: "commerce", permission: "inventory:read" },
    { id: "transport-tires", label: "Neumáticos", description: "Ciclo de vida serializado", path: "tires", icon: "tire", group: "commerce", permission: "transport:tires:read" },
    { id: "transport-reports", label: "Reportes", description: "Rentabilidad y control", path: "reports", icon: "reports", group: "commerce", permission: "transport:finance:read" },
    { id: "transport-settings", label: "Configuración", description: "Maestros, usuarios y permisos", path: "settings", icon: "settings", group: "system", permission: "settings:write" },
  ],
};
