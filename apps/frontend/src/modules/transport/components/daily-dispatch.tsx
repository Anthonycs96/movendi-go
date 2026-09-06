"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Save, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TransportData } from "@movendi/contracts";
import { Button, Card, Input, Select } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/lib/format";
import { Badge } from "./transport-ui";

const day = (value: Date) => value.toISOString().slice(0, 10);
const localValue = (value: string | null) => value ? new Date(value).toLocaleString("sv-SE").slice(0, 16) : "";

function DispatchRow({ trip, data, visibleFieldIds }: { trip: TransportData["trips"][number]; data: TransportData; visibleFieldIds: Set<string> }) {
  const router = useRouter();
  const definitions = data.customFields.filter((field) => field.active && field.showInDispatch && visibleFieldIds.has(field.id) && (field.scopes.length === 0 || field.scopes.some((scope) => scope.scopeType === "TENANT" || scope.scopeType === "CUSTOMER" && scope.scopeId === trip.customer.id || scope.scopeType === "OPERATION" && scope.scopeId === trip.operationId)));
  const initialFields = Object.fromEntries(trip.customFields.map((field) => [field.definitionId, field.value ?? ""]));
  const [draft, setDraft] = useState({ scheduledStartAt: localValue(trip.scheduledStartAt), scheduledEndAt: localValue(trip.scheduledEndAt), appointmentStartAt: localValue(trip.appointmentStartAt), appointmentEndAt: localValue(trip.appointmentEndAt), appointmentStatus: trip.appointmentStatus, reprogramReason: "", notifyClient: false, priority: trip.priority, notes: trip.notes ?? "", fields: initialFields });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setPending(true); setMessage("");
    const response = await fetch(`/api/operations/transport/trips/${trip.id}/dispatch`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: trip.version, scheduledStartAt: draft.scheduledStartAt, scheduledEndAt: draft.scheduledEndAt, appointmentStartAt: draft.appointmentStartAt || null, appointmentEndAt: draft.appointmentEndAt || null, appointmentStatus: draft.appointmentStatus, reprogramReason: draft.reprogramReason || undefined, notifyClient: draft.notifyClient, priority: draft.priority, notes: draft.notes, customFields: definitions.map((field) => ({ fieldId: field.id, value: draft.fields[field.id] ?? "" })) }) });
    const result = await response.json().catch(() => ({}));
    setPending(false); setMessage(response.ok ? "Guardado" : result.error?.message ?? "No se pudo guardar");
    if (response.ok) router.refresh();
  }
  return <tr>
    <td><strong>{trip.code}</strong><small>{trip.customer.legalName}</small></td>
    <td><strong>{trip.route.origin.name} → {trip.route.destination.name}</strong><small>{trip.operation?.name ?? "Sin operación"}</small></td>
    <td><Input aria-label={`Salida ${trip.code}`} type="datetime-local" value={draft.scheduledStartAt} onChange={(event) => setDraft((current) => ({ ...current, scheduledStartAt: event.target.value }))} /></td>
    <td><Input aria-label={`Llegada ${trip.code}`} type="datetime-local" value={draft.scheduledEndAt} onChange={(event) => setDraft((current) => ({ ...current, scheduledEndAt: event.target.value }))} /></td>
    <td><Input aria-label={`Cita ${trip.code}`} type="datetime-local" value={draft.appointmentStartAt} onChange={(event) => setDraft((current) => ({ ...current, appointmentStartAt: event.target.value, appointmentStatus: event.target.value ? "PENDING" : "NONE" }))} /></td>
    <td><Select aria-label={`Estado cita ${trip.code}`} value={draft.appointmentStatus} onChange={(event) => setDraft((current) => ({ ...current, appointmentStatus: event.target.value }))}><option value="NONE">Sin cita</option><option value="PENDING">Pendiente</option><option value="CONFIRMED">Confirmada</option><option value="REPROGRAMMED">Reprogramada</option><option value="COMPLETED">Atendida</option><option value="CANCELLED">Cancelada</option></Select>{draft.appointmentStatus === "REPROGRAMMED" ? <Input aria-label={`Motivo ${trip.code}`} placeholder="Motivo" value={draft.reprogramReason} onChange={(event) => setDraft((current) => ({ ...current, reprogramReason: event.target.value }))} /> : null}<label><input type="checkbox" checked={draft.notifyClient} onChange={(event) => setDraft((current) => ({ ...current, notifyClient: event.target.checked }))} /> Registrar aviso</label></td>
    {definitions.map((field) => <td key={field.id}>{field.dataType === "BOOLEAN" ? <Select value={String(draft.fields[field.id] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, fields: { ...current.fields, [field.id]: event.target.value } }))}><option value="">—</option><option value="true">Sí</option><option value="false">No</option></Select> : field.dataType === "SELECT" ? <Select value={String(draft.fields[field.id] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, fields: { ...current.fields, [field.id]: event.target.value } }))}><option value="">—</option>{field.options.filter((item) => item.active).map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}</Select> : <Input type={["NUMBER", "MONEY"].includes(field.dataType) ? "number" : ["DATE", "DATETIME"].includes(field.dataType) ? field.dataType === "DATE" ? "date" : "datetime-local" : "text"} value={String(draft.fields[field.id] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, fields: { ...current.fields, [field.id]: event.target.value } }))} />}</td>)}
    <td><Badge value={trip.workflowState?.label ?? trip.status} /></td>
    <td><Button size="sm" type="button" loading={pending} onClick={() => void save()}><Save size={14} />Guardar</Button>{message ? <small>{message}</small> : null}</td>
  </tr>;
}

type ImportPreview = { batchId: string; totalRows: number; validRows: number; invalidRows: number; rows: Array<{ rowNumber: number; action: string; status: string; errors: string[] }> };

export function OperationalExcelImport({ data }: { data: TransportData }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [profileId, setProfileId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState<"upload" | "commit" | null>(null);
  const [message, setMessage] = useState("");
  async function upload(file: File) {
    setPending("upload"); setMessage(""); setPreview(null);
    const form = new FormData(); form.set("file", file); if (profileId) form.set("profileId", profileId);
    const response = await fetch("/api/transport/dispatch-import", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    setPending(null); if (input.current) input.current.value = "";
    if (!response.ok) return setMessage(result.error?.message ?? "No se pudo leer el Excel.");
    setPreview(result); setMessage(result.message);
  }
  async function commit() {
    if (!preview) return;
    setPending("commit");
    const response = await fetch(`/api/transport/dispatch-import/${preview.batchId}/commit`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setPending(null); setMessage(response.ok ? result.message : result.error?.message ?? "No se pudo confirmar.");
    if (response.ok) { setPreview(null); router.refresh(); }
  }
  return <section className="dispatch-import">
    <div><FileSpreadsheet size={20} /><span><strong>Importación operacional Excel</strong><small>Descarga la plantilla o usa un perfil guardado. Primero se valida y luego confirmas.</small></span></div>
    <Select aria-label="Perfil de importación" value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">Mapeo automático MOVENDI</option>{data.importProfiles.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <div><Button type="button" variant="secondary" onClick={() => { window.open("/api/transport/dispatch-template", "_self"); }}><Download size={15} />Plantilla</Button><Button type="button" loading={pending === "upload"} onClick={() => input.current?.click()}><Upload size={15} />Previsualizar</Button><input ref={input} hidden type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
    {message ? <p>{message}</p> : null}
    {preview ? <div className="dispatch-import__preview"><span>{preview.totalRows} filas · {preview.validRows} válidas · {preview.invalidRows} con error</span><Button type="button" loading={pending === "commit"} disabled={preview.invalidRows > 0} onClick={() => void commit()}>Confirmar importación</Button>{preview.rows.filter((row) => row.errors.length).slice(0, 8).map((row) => <small key={row.rowNumber}>Fila {row.rowNumber}: {row.errors.join(" ")}</small>)}</div> : null}
  </section>;
}

export function DailyDispatch({ data }: { data: TransportData }) {
  const [selectedDay, setSelectedDay] = useState(day(new Date()));
  const defaultView = data.dispatchViews.find((item) => item.active && item.isDefault);
  const [viewId, setViewId] = useState(defaultView?.id ?? "");
  const activeView = data.dispatchViews.find((item) => item.id === viewId && item.active);
  const trips = useMemo(() => data.trips.filter((trip) => day(new Date(trip.scheduledStartAt)) === selectedDay && !["DELIVERED", "CANCELLED"].includes(trip.status) && (!activeView || activeView.scopeType === "TENANT" || activeView.scopeType === "CUSTOMER" && activeView.scopeId === trip.customer.id || activeView.scopeType === "OPERATION" && activeView.scopeId === trip.operationId)).sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt)), [activeView, data.trips, selectedDay]);
  const fields = data.customFields.filter((field) => field.active && field.showInDispatch && (!activeView?.columns.length || activeView.columns.includes(field.code) || activeView.columns.includes(`field:${field.code}`)));
  const visibleFieldIds = new Set(fields.map((field) => field.id));
  return <Card className="table-card daily-dispatch"><div className="management-heading"><div><span className="section-kicker">PLAN DIARIO</span><h2>Despacho rápido</h2><p>Edición en línea con control de concurrencia y campos por cliente.</p></div><div className="daily-dispatch__filters"><Select aria-label="Vista de despacho" value={viewId} onChange={(event) => setViewId(event.target.value)}><option value="">Vista general</option>{data.dispatchViews.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input aria-label="Fecha del plan" type="date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} /></div></div><div className="daily-dispatch__scroll"><table><thead><tr><th>Viaje / cliente</th><th>Ruta / operación</th><th>Salida</th><th>Llegada</th><th>Cita</th><th>Estado cita</th>{fields.map((field) => <th key={field.id}>{field.label}</th>)}<th>Estado</th><th>Acción</th></tr></thead><tbody>{trips.length ? trips.map((trip) => <DispatchRow key={`${trip.id}-${trip.version}`} trip={trip} data={data} visibleFieldIds={visibleFieldIds} />) : <tr><td colSpan={9 + fields.length}>No hay viajes activos para {selectedDay}.</td></tr>}</tbody></table></div><footer>{trips.length} viajes · actualizado desde datos vigentes. {trips[0] ? `Primera salida ${formatDateTime(trips[0].scheduledStartAt)}.` : ""}</footer></Card>;
}
