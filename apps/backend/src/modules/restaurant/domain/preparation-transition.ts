export class PreparationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export type PreparationLine = { id: string; name: string; status: string; preparationAreaKey: string | null };
export type PreparationChange = { status: string; itemIds?: string[] };
export function selectPreparationLines(lines: PreparationLine[], change: PreparationChange, policy: { allowCancellation: boolean; statuses: Array<{ key: string; active: boolean; allowedNext: string[] }> }) {
  const selected = change.itemIds ? lines.filter((line) => change.itemIds!.includes(line.id)) : lines.filter((line) => line.status !== "SERVED");
  if (!selected.length || (change.itemIds && selected.length !== new Set(change.itemIds).size)) throw new PreparationError("INVALID_TICKET_ITEMS", "Los productos seleccionados no pertenecen a esta comanda.");
  if (change.status === "CANCELLED" && change.itemIds) throw new PreparationError("CANCEL_WHOLE_ORDER", "Anula el pedido completo desde Pedidos para conciliar insumos e importes.");
  if (change.status === "CANCELLED" && !policy.allowCancellation) throw new PreparationError("KITCHEN_CANCELLATION_DISABLED", "La cancelación desde cocina está deshabilitada.");
  if (!change.itemIds && change.status !== "CANCELLED" && new Set(selected.map((line) => line.preparationAreaKey)).size > 1) throw new PreparationError("SELECT_PREPARATION_AREA", "Selecciona los productos del área que estás preparando.");
  for (const line of selected) {
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
  if (active.some((status) => ["PREPARING", "READY", "SERVED"].includes(status))) return "PREPARING";
  return "QUEUED";
}

