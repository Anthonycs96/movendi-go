import type { BusinessModuleManifest } from "@/core/modules/types";

export const restaurantManifest: BusinessModuleManifest = {
  id: "restaurant",
  industry: "restaurant",
  name: "Restaurante",
  description: "Salón, carta, pedidos, cocina y caja.",
  defaultPath: "dashboard",
  navigation: [
    { id: "restaurant-dashboard", label: "Resumen", description: "Pulso del local", path: "dashboard", icon: "dashboard", group: "overview", permission: "dashboard:read" },
    { id: "restaurant-floor", label: "Salón", description: "Mesas y atenciones", path: "floor", icon: "floor", group: "operations", permission: "restaurant:floor:read" },
    { id: "restaurant-orders", label: "Pedidos", description: "Salón y delivery", path: "orders", icon: "orders", group: "operations", permission: "restaurant:orders:read" },
    { id: "restaurant-kitchen", label: "Cocina", description: "Comandas en curso", path: "kitchen", icon: "kitchen", group: "operations", permission: "restaurant:kitchen:read" },
    { id: "restaurant-clients", label: "Clientes", description: "CRM y frecuencia", path: "clients", icon: "customers", group: "operations", permission: "customers:read" },
    { id: "restaurant-menu", label: "Carta", description: "Platos y categorías", path: "menu", icon: "menu", group: "commerce", permission: "restaurant:menu:read" },
    { id: "restaurant-inventory", label: "Inventario", description: "Stock, compras y recetas", path: "inventory", icon: "inventory", group: "commerce", permission: "inventory:read" },
    { id: "restaurant-promotions", label: "Promociones", description: "Descuentos y campañas", path: "promotions", icon: "discount", group: "commerce", permission: "restaurant:promotions:read" },
    { id: "restaurant-checkout", label: "Caja y ventas", description: "Cobros y arqueo", path: "checkout", icon: "cash", group: "commerce", permission: "restaurant:cash:read" },
    { id: "restaurant-reports", label: "Reportes", description: "Ventas y rentabilidad", path: "reports", icon: "reports", group: "commerce", permission: "restaurant:reports:read" },
    { id: "restaurant-settings", label: "Configuración", description: "Salones y permisos", path: "settings", icon: "settings", group: "system", permission: "settings:write" },
  ],
};
