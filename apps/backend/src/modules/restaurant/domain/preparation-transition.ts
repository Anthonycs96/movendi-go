export class PreparationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export type PreparationLine = { id: string; name: string; status: string; stockModeSnapshot?: string; preparationAreaKey: string | null };
export type PreparationChange = { status: string; itemIds?: string[]; confirmed?: boolean };
export function selectPreparationLines(lines: PreparationLine[], change: PreparationChange, policy: { allowCancellation: boolean; statuses: Array<{ key: string; active: boolean; allowedNext: string[] }> }) {
  const selected = change.itemIds ? lines.filter((line) => change.itemIds!.includes(line.id)) : lines.filter((line) => change.status === "SERVED" ? line.status === "READY" : line.status !== "SERVED");
  if (!selected.length || (change.itemIds && selected.length !== new Set(change.itemIds).size)) throw new PreparationError("INVALID_TICKET_ITEMS", "Los productos seleccionados no pertenecen a esta comanda.");
  if (change.status === "CANCELLED" && change.itemIds) throw new PreparationError("CANCEL_WHOLE_ORDER", "Anula el pedido completo desde Pedidos para conciliar insumos e importes.");
  if (change.status === "CANCELLED" && !policy.allowCancellation) throw new PreparationError("KITCHEN_CANCELLATION_DISABLED", "La cancelación desde cocina está deshabilitada.");
  if (!change.itemIds && !["CANCELLED", "SERVED"].includes(change.status) && new Set(selected.map((line) => line.preparationAreaKey)).size > 1) throw new PreparationError("SELECT_PREPARATION_AREA", "Selecciona los productos del área que estás preparando.");
  if (change.status === "READY" && change.confirmed && new Set(selected.map(line => line.preparationAreaKey)).size > 1) throw new PreparationError("SELECT_PREPARATION_AREA", "Marca únicamente los productos de esta área.");
  for (const line of selected) {
    if (line.status === change.status && change.status !== "CANCELLED") continue;
    if (change.status === "SERVED") {
      if (line.status !== "READY") throw new PreparationError("ITEM_NOT_READY", "Solo puedes servir productos listos.");
      continue;
    }
    if (change.status === "READY" && (change.confirmed || line.stockModeSnapshot === "RESALE") && ["PENDING", "QUEUED", "PREPARING"].includes(line.status)) continue;
    if ((change.status === "PREPARING" && !["PENDING", "QUEUED"].includes(line.status)) || (change.status === "READY" && line.status !== "PREPARING")) throw new PreparationError("INVALID_KITCHEN_TRANSITION", "Avanza de pendiente a preparando y luego a listo. Para completar el área usa Marcar todos listos.");
    const current = line.status === "PENDING" ? "QUEUED" : line.status;
    const allowed = policy.statuses.find((status) => status.active && status.key === current)?.allowedNext ?? [];
    if (!allowed.includes(change.status)) throw new PreparationError("INVALID_KITCHEN_TRANSITION", `No se puede cambiar ${line.name} de ${current} a ${change.status}.`);
  }
  return selected;
}

export function aggregatePreparationStatus(statuses: string[]) {
  const active = statuses.filter((status) => status !== "CANCELLED");
  if (!active.length) return "CANCELLED";
  if (active.every((status) => status === "HELD")) return "HELD";
  if (active.every((status) => status === "SERVED")) return "SERVED";
  if (active.every((status) => ["READY", "SERVED"].includes(status))) return "READY";
  if (active.some((status) => ["READY", "SERVED"].includes(status))) return "PARTIALLY_READY";
  if (active.some((status) => status === "PREPARING")) return "PREPARING";
  return "QUEUED";
}

