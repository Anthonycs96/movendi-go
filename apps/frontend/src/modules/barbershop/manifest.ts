import type { BusinessModuleManifest } from "@/core/modules/types";

export const barbershopManifest: BusinessModuleManifest = {
  id: "barbershop",
  industry: "barbershop",
  name: "Barbería y Salón",
  description: "Agenda, ventas mixtas, inventario, clientes, caja y comisiones.",
  defaultPath: "dashboard",
  navigation: [
    { id: "barber-dashboard", label: "Resumen", description: "Pulso del negocio", path: "dashboard", icon: "dashboard", group: "overview", permission: "dashboard:read" },
    { id: "barber-appointments", label: "Agenda", description: "Citas y disponibilidad", path: "appointments", icon: "calendar", group: "operations", permission: "barbershop:appointments:read" },
    { id: "barber-clients", label: "Clientes", description: "Historial y preferencias", path: "clients", icon: "customers", group: "operations", permission: "customers:read" },
    { id: "barber-team", label: "Equipo", description: "Barberos y horarios", path: "team", icon: "team", group: "operations", permission: "barbershop:team:read" },
    { id: "barber-services", label: "Servicios", description: "Catálogo y precios", path: "services", icon: "scissors", group: "commerce", permission: "services:read" },
    { id: "barber-inventory", label: "Inventario", description: "Productos, insumos y stock", path: "inventory", icon: "inventory", group: "commerce", permission: "inventory:read" },
    { id: "barber-checkout", label: "Caja y ventas", description: "Cobros y cierre", path: "checkout", icon: "cash", group: "commerce", permission: "barbershop:cash:write" },
    { id: "barber-reports", label: "Reportes y comisiones", description: "Producción, clientes y margen", path: "reports", icon: "reports", group: "commerce", permission: "barbershop:reports:read" },
    { id: "barber-settings", label: "Configuración", description: "Sede y permisos", path: "settings", icon: "settings", group: "system", permission: "settings:write" },
  ],
};
