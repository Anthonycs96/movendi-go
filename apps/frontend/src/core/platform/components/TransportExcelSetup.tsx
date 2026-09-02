"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search, Trash2, Upload } from "lucide-react";
import type { TransportConfiguration } from "@movendi/contracts";
import { Button, Input, Select } from "@/shared/components/ui";

export type TransportMasterData = {
  users: Array<{ name: string; email: string; roleKey: string }>;
  parties: Array<{ kind: string; documentType: "RUC" | "DNI" | "CE" | "OTHER"; documentNo: string; legalName: string; tradeName: string; contactName: string; phone: string; email: string; address: string }>;
  locations: Array<{ code: string; name: string; address: string; district: string; province: string; department: string; latitude: number | null; longitude: number | null }>;
  routes: Array<{ code: string; name: string; originCode: string; destinationCode: string; distanceKm: number; estimatedMinutes: number; tollEstimate: number; baseFreight: number }>;
  vehicles: Array<{ plate: string; brand: string; model: string; year: number; type: string; capacityKg: number | null; odometerKm: number; status: string; technicalDueAt: string; soatDueAt: string; gpsDeviceId: string }>;
  trailers: Array<{ plate: string; brand: string; model: string; type: string; capacityKg: number | null; status: string }>;
  drivers: Array<{ documentNo: string; firstName: string; lastName: string; type: string; phone: string; email: string; licenseNo: string; licenseClass: string; licenseDueAt: string; hireDate: string; workRegimeKey: string; workCycleAnchor: string; status: string }>;
};

type UserDraft = { name: string; email: string; roleKey: string; password: string };
type Issue = { sheet: string; row: number; column: string; message: string; severity: "ERROR" | "WARNING" };
type TransportExcelStep = "TRANSPORT_CUSTOMERS" | "TRANSPORT_FLEET" | "TRANSPORT_DRIVERS";
type TransportCollection = Exclude<keyof TransportMasterData, "users">;
type EditableRow = Record<string, unknown>;
type EditorField = { key: string; label: string; type?: "text" | "number" | "date" | "select"; options?: readonly string[]; nullable?: boolean };
type EditorSection = { key: TransportCollection; label: string; fields: EditorField[] };

function editorSectionsByStep(configuration: TransportConfiguration): Record<TransportExcelStep, EditorSection[]> {
  const activeKeys = (items: Array<{ key: string; active: boolean }>) => items.filter((item) => item.active).map((item) => item.key);
  const partyTypes = activeKeys(configuration.customers.partyTypes);
  const vehicleTypes = activeKeys(configuration.fleet.vehicleTypes);
  const trailerTypes = activeKeys(configuration.fleet.trailerTypes);
  const fleetStatuses = activeKeys(configuration.fleet.vehicleStatuses);
  const driverTypes = activeKeys(configuration.drivers.driverTypes);
  const driverStatuses = activeKeys(configuration.drivers.driverStatuses);
  const licenseClasses = activeKeys(configuration.drivers.licenseClasses);
  const workRegimes = activeKeys(configuration.drivers.workRegimes);
  return {
  TRANSPORT_CUSTOMERS: [
    { key: "parties", label: "Clientes y cuentas", fields: [{ key: "kind", label: "Tipo", type: "select", options: partyTypes }, { key: "documentType", label: "Documento", type: "select", options: ["RUC", "DNI", "CE", "OTHER"] }, { key: "documentNo", label: "Número" }, { key: "legalName", label: "Razón social" }, { key: "tradeName", label: "Nombre comercial" }, { key: "contactName", label: "Contacto" }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Correo" }, { key: "address", label: "Dirección" }] },
    { key: "locations", label: "Ubicaciones", fields: [{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, { key: "address", label: "Dirección" }, { key: "district", label: "Distrito" }, { key: "province", label: "Provincia" }, { key: "department", label: "Departamento" }, { key: "latitude", label: "Latitud", type: "number", nullable: true }, { key: "longitude", label: "Longitud", type: "number", nullable: true }] },
    { key: "routes", label: "Rutas", fields: [{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, { key: "originCode", label: "Origen" }, { key: "destinationCode", label: "Destino" }, { key: "distanceKm", label: "Distancia km", type: "number" }, { key: "estimatedMinutes", label: "Duración min", type: "number" }, { key: "tollEstimate", label: "Peajes", type: "number" }, { key: "baseFreight", label: "Flete base", type: "number" }] },
  ],
  TRANSPORT_FLEET: [
    { key: "vehicles", label: "Vehículos y tractos", fields: [{ key: "plate", label: "Placa" }, { key: "brand", label: "Marca" }, { key: "model", label: "Modelo" }, { key: "year", label: "Año", type: "number" }, { key: "type", label: "Tipo", type: "select", options: vehicleTypes }, { key: "capacityKg", label: "Capacidad kg", type: "number", nullable: true }, { key: "odometerKm", label: "Odómetro km", type: "number" }, { key: "status", label: "Estado", type: "select", options: fleetStatuses }, { key: "technicalDueAt", label: "Revisión técnica", type: "date" }, { key: "soatDueAt", label: "SOAT", type: "date" }, { key: "gpsDeviceId", label: "GPS" }] },
    { key: "trailers", label: "Carretas y remolques", fields: [{ key: "plate", label: "Placa" }, { key: "brand", label: "Marca" }, { key: "model", label: "Modelo" }, { key: "type", label: "Tipo", type: "select", options: trailerTypes }, { key: "capacityKg", label: "Capacidad kg", type: "number", nullable: true }, { key: "status", label: "Estado", type: "select", options: fleetStatuses }] },
  ],
  TRANSPORT_DRIVERS: [
    { key: "drivers", label: "Conductores", fields: [{ key: "documentNo", label: "Documento" }, { key: "firstName", label: "Nombres" }, { key: "lastName", label: "Apellidos" }, { key: "type", label: "Tipo", type: "select", options: driverTypes }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Correo" }, { key: "licenseNo", label: "Licencia" }, { key: "licenseClass", label: "Clase", type: "select", options: licenseClasses }, { key: "licenseDueAt", label: "Vence licencia", type: "date" }, { key: "hireDate", label: "Fecha ingreso", type: "date" }, { key: "workRegimeKey", label: "Régimen", type: "select", options: workRegimes }, { key: "workCycleAnchor", label: "Inicio ciclo", type: "date" }, { key: "status", label: "Estado", type: "select", options: driverStatuses }] },
  ],
  };
}

const copyByStep: Record<TransportExcelStep, { title: string; description: string; uploadLabel: string }> = {
  TRANSPORT_CUSTOMERS: {
    title: "Carga de clientes y rutas con Excel",
    description: "Completa las hojas Clientes, Ubicaciones y Rutas. La misma plantilla también puede preparar flota, conductores y usuarios.",
    uploadLabel: "Subir Excel de clientes",
  },
  TRANSPORT_FLEET: {
    title: "Carga de flota con Excel",
    description: "Registra tractos y unidades en la hoja Vehículos; carretas, plataformas, cisternas y remolques en la hoja Carretas.",
    uploadLabel: "Subir Excel de flota",
  },
  TRANSPORT_DRIVERS: {
    title: "Carga de conductores con Excel",
    description: "Registra documentos, licencias, vencimientos, régimen laboral y estado en la hoja Conductores.",
    uploadLabel: "Subir Excel de conductores",
  },
};

export function TransportExcelSetup({ step, tenantId, data, setData, setUsers }: { step: TransportExcelStep; tenantId: string | null; data: TransportMasterData; setData: React.Dispatch<React.SetStateAction<TransportMasterData>>; setUsers: React.Dispatch<React.SetStateAction<UserDraft[]>> }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"download" | "upload" | null>(null);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const copy = copyByStep[step];
  const download = async () => {
    if (!tenantId) return;
    setPending("download"); setMessage(""); setIssues([]);
    try {
      const response = await fetch(`/api/platform/onboarding/${tenantId}/transport-template`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error?.message ?? "No pudimos generar la plantilla."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `movendi-transporte-${tenantId.slice(0, 8)}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setMessage("Plantilla descargada con los catálogos y datos actuales de la empresa.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No pudimos descargar la plantilla."); }
    finally { setPending(null); }
  };
  const upload = async (file: File) => {
    if (!tenantId) return;
    setPending("upload"); setMessage(""); setIssues([]);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/platform/onboarding/${tenantId}/transport-import`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos leer la plantilla.");
      setIssues(Array.isArray(result.issues) ? result.issues : []);
      if (!result.valid) { setMessage(result.message ?? "Corrige los errores del archivo."); return; }
      setData(result.masterData);
      if (result.masterData.users?.length) setUsers(result.masterData.users.map((user: TransportMasterData["users"][number]) => ({ ...user, password: "" })));
      const summary = result.summary;
      setMessage(`${summary.parties} cuentas, ${summary.locations} ubicaciones, ${summary.routes} rutas, ${summary.vehicles} vehículos, ${summary.trailers} carretas, ${summary.drivers} conductores y ${summary.users} usuarios preparados. Confirma cada paso para guardarlos.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No pudimos subir la plantilla."); }
    finally { setPending(null); if (input.current) input.current.value = ""; }
  };
  const total = data.parties.length + data.locations.length + data.routes.length + data.vehicles.length + data.trailers.length + data.drivers.length + data.users.length;
  return <section className="setup-excel-import" aria-label={copy.title}>
    <div><FileSpreadsheet size={22} /><span><strong>{copy.title}</strong><small>{copy.description} Nada se guarda hasta confirmar el paso.</small></span></div>
    <div><Button type="button" variant="secondary" loading={pending === "download"} disabled={!tenantId || Boolean(pending)} onClick={() => void download()}><Download size={15} />Descargar plantilla maestra</Button><Button type="button" loading={pending === "upload"} disabled={!tenantId || Boolean(pending)} onClick={() => input.current?.click()}><Upload size={15} />{copy.uploadLabel}</Button><input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
    {total ? <p>{total} registros preparados para los siguientes pasos.</p> : null}
    {message ? <p>{message}</p> : null}
    {issues.length ? <ul>{issues.slice(0, 12).map((issue, index) => <li className={issue.severity === "ERROR" ? "error" : "warning"} key={`${issue.sheet}-${issue.row}-${issue.column}-${index}`}><b>{issue.sheet} {issue.column}{issue.row}</b><span>{issue.message}</span></li>)}</ul> : null}
  </section>;
}

function normalizedEditorValue(raw: string, field: EditorField) {
  if (field.type !== "number") return raw;
  if (!raw.trim()) return field.nullable ? null : 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : field.nullable ? null : 0;
}

function TransportPreparedDataEditor({ sections, data, setData }: { sections: EditorSection[]; data: TransportMasterData; setData: React.Dispatch<React.SetStateAction<TransportMasterData>> }) {
  const [activeKey, setActiveKey] = useState<TransportCollection>(sections[0].key);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const active = sections.find((section) => section.key === activeKey) ?? sections[0];
  const rows = data[active.key] as unknown as EditableRow[];
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const filtered = rows.map((row, index) => ({ row, index })).filter(({ row }) => !normalizedQuery || Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase("es").includes(normalizedQuery)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const updateRow = (rowIndex: number, field: EditorField, raw: string) => setData((current) => {
    const nextRows = [...(current[active.key] as unknown as EditableRow[])];
    nextRows[rowIndex] = { ...nextRows[rowIndex], [field.key]: normalizedEditorValue(raw, field) };
    return { ...current, [active.key]: nextRows } as TransportMasterData;
  });
  const removeRow = (rowIndex: number) => {
    if (!window.confirm("¿Quitar este registro de la carga preparada? Todavía no se ha guardado en la empresa.")) return;
    setData((current) => ({ ...current, [active.key]: (current[active.key] as unknown as EditableRow[]).filter((_, index) => index !== rowIndex) }) as TransportMasterData);
  };

  return <section className="transport-master-editor" aria-label="Vista editable de los datos preparados">
    <div className="transport-master-editor__tabs" role="tablist" aria-label="Catálogos importados">{sections.map((section) => <button type="button" role="tab" aria-selected={section.key === active.key} className={section.key === active.key ? "active" : ""} key={section.key} onClick={() => { setActiveKey(section.key); setQuery(""); setPage(0); }}>{section.label}<span>{data[section.key].length}</span></button>)}</div>
    <div className="transport-master-editor__toolbar">
      <label><Search size={15} /><Input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={`Buscar en ${active.label.toLocaleLowerCase("es")}…`} aria-label={`Buscar en ${active.label}`} /></label>
      <small>Los cambios se aplican a la carga pendiente. Se guardarán al confirmar este paso.</small>
    </div>
    <div className="transport-master-editor__table-wrap">
      <table>
        <thead><tr><th>#</th>{active.fields.map((field) => <th key={field.key}>{field.label}</th>)}<th aria-label="Acciones" /></tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map(({ row, index }, visibleIndex) => <tr key={`${active.key}-${index}`}><td>{safePage * pageSize + visibleIndex + 1}</td>{active.fields.map((field) => {
          const value = row[field.key];
          return <td key={field.key}>{field.type === "select" ? <Select searchable={false} value={String(value ?? "")} aria-label={`${field.label}, fila ${index + 1}`} onChange={(event) => updateRow(index, field, event.target.value)}>{field.options?.map((option) => <option value={option} key={option}>{option}</option>)}</Select> : <Input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} step={field.type === "number" ? "any" : undefined} value={value === null || value === undefined ? "" : String(value)} aria-label={`${field.label}, fila ${index + 1}`} onChange={(event) => updateRow(index, field, event.target.value)} />}</td>;
        })}<td><button type="button" className="transport-master-editor__delete" aria-label={`Quitar fila ${index + 1} de ${active.label}`} title="Quitar de la carga" onClick={() => removeRow(index)}><Trash2 size={14} /></button></td></tr>) : <tr><td className="transport-master-editor__empty" colSpan={active.fields.length + 2}>No hay registros que coincidan con la búsqueda.</td></tr>}</tbody>
      </table>
    </div>
    <footer><span>Mostrando {filtered.length ? safePage * pageSize + 1 : 0}–{Math.min((safePage + 1) * pageSize, filtered.length)} de {filtered.length}</span><div><Button type="button" size="sm" variant="secondary" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={14} />Anterior</Button><span>Página {safePage + 1} de {pageCount}</span><Button type="button" size="sm" variant="secondary" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Siguiente<ChevronRight size={14} /></Button></div></footer>
  </section>;
}

export function TransportMasterSummary({ step, data, setData, configuration }: { step: string; data: TransportMasterData; setData: React.Dispatch<React.SetStateAction<TransportMasterData>>; configuration: TransportConfiguration }) {
  const [expanded, setExpanded] = useState(false);
  const byStep: Record<string, Array<{ label: string; value: number }>> = {
    TRANSPORT_CUSTOMERS: [{ label: "cuentas", value: data.parties.length }, { label: "ubicaciones", value: data.locations.length }, { label: "rutas", value: data.routes.length }],
    TRANSPORT_FLEET: [{ label: "vehículos", value: data.vehicles.length }, { label: "carretas", value: data.trailers.length }],
    TRANSPORT_DRIVERS: [{ label: "conductores", value: data.drivers.length }],
    TEAM: [{ label: "usuarios", value: data.users.length }],
  };
  const items = byStep[step] ?? [];
  if (!items.some((item) => item.value)) return null;
  const sections = editorSectionsByStep(configuration)[step as TransportExcelStep] ?? [];
  return <section className="setup-catalog-foundation" aria-label="Datos de Transporte preparados con Excel">
    <header><span><strong>Datos preparados con la plantilla maestra</strong><small>Revisa, corrige o elimina registros antes de guardar este paso.</small></span>{sections.length ? <Button type="button" size="sm" variant="secondary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Ocultar datos" : "Ver y editar datos"}<ChevronDown size={14} className={expanded ? "expanded" : ""} /></Button> : null}</header>
    <div className="setup-catalog-foundation__counts">{items.map((item) => <span key={item.label}>{item.value} {item.label}</span>)}</div>
    {expanded && sections.length ? <TransportPreparedDataEditor key={step} sections={sections} data={data} setData={setData} /> : null}
  </section>;
}
