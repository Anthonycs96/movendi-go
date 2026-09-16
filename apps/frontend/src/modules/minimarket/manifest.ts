import type { BusinessModuleManifest } from "@/core/modules/types";
export const minimarketManifest: BusinessModuleManifest = {
  id: "minimarket", industry: "minimarket", name: "Minimarket", description: "Productos, caja, compras y existencias.", defaultPath: "pos",
  navigation: [
    { id: "mm-pos", label: "Punto de venta", description: "Escanear y cobrar", path: "pos", icon: "cash", group: "operations", permission: "minimarket:sales:write" },
    { id: "mm-dashboard", label: "Resumen", description: "Resultados y alertas", path: "dashboard", icon: "dashboard", group: "overview", permission: "minimarket:reports:read" },
    { id: "mm-catalog", label: "Catálogo", description: "Productos y presentaciones", path: "catalog", icon: "menu", group: "commerce", permission: "minimarket:catalog:read" },
    { id: "mm-stock", label: "Inventario", description: "Stock, lotes y conteos", path: "inventory", icon: "inventory", group: "commerce", permission: "inventory:read" },
    { id: "mm-purchases", label: "Compras", description: "Recepciones de proveedores", path: "purchases", icon: "orders", group: "commerce", permission: "inventory:read" },
    { id: "mm-sales", label: "Ventas", description: "Tickets y devoluciones", path: "sales", icon: "reports", group: "commerce", permission: "minimarket:sales:read" },
    { id: "mm-cash", label: "Caja", description: "Turnos, movimientos y cierre", path: "checkout", icon: "cash", group: "commerce", permission: "minimarket:cash:read" },
    { id: "mm-clients", label: "Clientes", description: "Directorio del negocio", path: "clients", icon: "customers", group: "operations", permission: "customers:read" },
    { id: "mm-reports", label: "Reportes", description: "Ventas netas y alertas", path: "reports", icon: "reports", group: "commerce", permission: "minimarket:reports:read" },
    { id: "mm-settings", label: "Configuración", description: "Empresa, equipo y permisos", path: "settings", icon: "settings", group: "system", permission: "settings:write" },
  ],
};
