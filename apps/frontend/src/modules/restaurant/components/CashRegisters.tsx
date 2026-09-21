"use client";
import { Card, DataTable, Field, Input, OperationForm, Select, StatusBadge } from "@/shared/components/ui";
import { useRestaurantResource } from "./useRestaurantResource";
export type CashRegisterOption = { id: string; name: string; active: boolean; sessions: Array<{ id: string; openedAt: string; openedBy: { name: string } }> };
export function CashRegisters({ canWrite }: { canWrite: boolean }) {
  const { data, error } = useRestaurantResource<{ registers: CashRegisterOption[] }>("/api/operations/restaurant/cash-registers");
  return <Card className="table-card"><div className="management-heading"><div><h2>Cajas de esta sucursal</h2><p>Configura los puntos de cobro. Cada caja tiene su propio turno e historial.</p></div>{canWrite ? <OperationForm title="Nueva caja" triggerLabel="Nueva caja" endpoint="/api/operations/restaurant/cash-registers" transform={form => ({ name: form.get("name"), active: true })}><Field label="Nombre de caja"><Input name="name" required minLength={2} maxLength={80} placeholder="Ej. Caja terraza" /></Field></OperationForm> : null}</div>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Cargando cajas…</p> : <DataTable rows={data.registers} rowKey={row => row.id} columns={[
      { key: "name", header: "Caja", cell: row => row.name },
      { key: "state", header: "Estado", cell: row => <StatusBadge tone={row.sessions.length ? "warning" : row.active ? "success" : "neutral"}>{row.sessions.length ? `Abierta · ${row.sessions[0].openedBy.name}` : row.active ? "Disponible" : "Inactiva"}</StatusBadge> },
      { key: "actions", header: "Administrar", cell: row => canWrite && !row.sessions.length ? <OperationForm title="Editar caja" triggerLabel="Editar caja" endpoint={`/api/operations/restaurant/cash-registers/${row.id}`} method="PATCH" transform={form => ({ name: form.get("name"), active: form.get("active") === "true" })}><Field label="Nombre de caja"><Input name="name" defaultValue={row.name} required minLength={2} maxLength={80} /></Field><Field label="Estado"><Select name="active" defaultValue={String(row.active)}><option value="true">Activa</option><option value="false">Inactiva</option></Select></Field><p>El historial se conserva al desactivar una caja.</p></OperationForm> : row.sessions.length ? "Cierra el turno para editar" : null },
    ]} />}
  </Card>;
}
