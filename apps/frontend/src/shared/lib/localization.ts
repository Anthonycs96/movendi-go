export type SupportedLocale = "es-PE" | "es-ES" | "en-US";

const es: Record<string, string> = {
  AVAILABLE: "Disponible", RESERVED: "Reservada", IN_SERVICE: "En atención", CLEANING: "En limpieza",
  DRAFT: "Borrador", PLACED: "Enviado", QUEUED: "En cola", PREPARING: "Preparando", READY: "Listo", SERVED: "Servido", COMPLETED: "Completado", CANCELLED: "Cancelado",
  PENDING: "Pendiente", DISPATCHED: "En camino", DELIVERED: "Entregado", PAID: "Pagado", OPEN: "Abierta", CLOSED: "Cerrada", ACTIVE: "Activo", INACTIVE: "Inactivo",
  CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", OTHER: "Otro", YAPE: "Yape", PLIN: "Plin",
  DINE_IN: "Consumo en mesa", TAKEAWAY: "Para llevar", DELIVERY: "Delivery",
  KITCHEN: "Cocina", BAR: "Barra", COFFEE: "Café", DESSERTS: "Postres",
  ORDER: "Pedido", CATEGORY: "Categoría", PRODUCT: "Producto", PERCENT: "Porcentaje", FIXED: "Monto fijo", QUANTITY: "Por cantidad",
  CREATE: "Creación", UPDATE: "Actualización", STATUS_CHANGE: "Cambio de estado", CHECKOUT: "Cobro", ADD_ITEMS: "Productos agregados", CLEAN: "Limpieza", SEAT: "Recepción", OPEN_CASH: "Apertura de caja", CLOSE: "Cierre", RESET_PASSWORD: "Restablecimiento de contraseña", UPDATE_PROFILE: "Actualización de perfil", SCAN_QR: "Escaneo de QR", GENERATE_QR: "Generación de QR", RENEW_QR: "Renovación de QR",
  SUCCESS: "Completado", FAILED: "Fallido", PROCESSING: "Procesando", APPROVED: "Aprobado",
};

const en: Record<string, string> = {
  AVAILABLE: "Available", RESERVED: "Reserved", IN_SERVICE: "In service", CLEANING: "Cleaning",
  DRAFT: "Draft", PLACED: "Placed", QUEUED: "Queued", PREPARING: "Preparing", READY: "Ready", SERVED: "Served", COMPLETED: "Completed", CANCELLED: "Cancelled",
  PENDING: "Pending", DISPATCHED: "On the way", DELIVERED: "Delivered", PAID: "Paid", OPEN: "Open", CLOSED: "Closed", ACTIVE: "Active", INACTIVE: "Inactive",
  CASH: "Cash", CARD: "Card", TRANSFER: "Transfer", OTHER: "Other", YAPE: "Yape", PLIN: "Plin",
  DINE_IN: "Dine in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery",
  KITCHEN: "Kitchen", BAR: "Bar", COFFEE: "Coffee", DESSERTS: "Desserts",
};

export function normalizeLocale(locale?: string): SupportedLocale {
  return locale === "en-US" || locale === "es-ES" ? locale : "es-PE";
}

export function localizeCode(value: string | null | undefined, locale?: string): string {
  if (!value) return "—";
  const dictionary = normalizeLocale(locale).startsWith("en") ? en : es;
  return dictionary[value] ?? value.replaceAll("_", " ").toLocaleLowerCase(locale ?? "es-PE").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function localeCurrency(locale?: string) {
  return normalizeLocale(locale) === "en-US" ? "USD" : "PEN";
}
