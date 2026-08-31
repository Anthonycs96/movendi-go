"use client";

import type { TransportPageInfo } from "@movendi/contracts";
import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search, Upload, X } from "lucide-react";

const statusOptions: Record<string, Array<{ value: string; label: string }>> = {
  trips: [{ value: "DRAFT", label: "Borrador" }, { value: "PLANNED", label: "Planificado" }, { value: "ASSIGNED", label: "Asignado" }, { value: "IN_TRANSIT", label: "En tránsito" }, { value: "DELIVERED", label: "Entregado" }, { value: "CANCELLED", label: "Cancelado" }],
  vehicles: [{ value: "AVAILABLE", label: "Disponible" }, { value: "ASSIGNED", label: "Asignado" }, { value: "MAINTENANCE", label: "Mantenimiento" }, { value: "INACTIVE", label: "Inactivo" }],
  drivers: [{ value: "AVAILABLE", label: "Disponible" }, { value: "ASSIGNED", label: "Asignado" }, { value: "ON_LEAVE", label: "Con descanso" }, { value: "INACTIVE", label: "Inactivo" }],
  documents: [{ value: "VALID", label: "Vigente" }, { value: "EXPIRING", label: "Por vencer" }, { value: "EXPIRED", label: "Vencido" }, { value: "SUSPENDED", label: "Suspendido" }],
  expenses: [{ value: "PENDING", label: "Pendiente" }, { value: "APPROVED", label: "Aprobado" }, { value: "REJECTED", label: "Rechazado" }],
  fuelLogs: [{ value: "CONFIRMED", label: "Confirmado" }, { value: "VOID", label: "Anulado" }],
  maintenanceOrders: [{ value: "OPEN", label: "Abierta" }, { value: "IN_PROGRESS", label: "En proceso" }, { value: "COMPLETED", label: "Completada" }, { value: "CANCELLED", label: "Cancelada" }],
  tires: [{ value: "STOCK", label: "En almacén" }, { value: "INSTALLED", label: "Instalado" }, { value: "REPAIR", label: "En reparación" }, { value: "RETIRED", label: "Retirado" }],
  parties: [{ value: "ACTIVE", label: "Activo" }, { value: "INACTIVE", label: "Inactivo" }],
};

function hrefFor(page: number, pagination: TransportPageInfo) {
  const params = new URLSearchParams();
  if (pagination.query) params.set("q", pagination.query);
  if (pagination.status) params.set("status", pagination.status);
  params.set("page", String(page));
  params.set("pageSize", String(pagination.pageSize));
  return `?${params.toString()}`;
}

function exportHref(format: "csv" | "excel" | "pdf", pagination: TransportPageInfo) {
  const params = new URLSearchParams({ section: pagination.section, format });
  if (pagination.query) params.set("q", pagination.query);
  if (pagination.status) params.set("status", pagination.status);
  return `/api/transport/exports?${params.toString()}`;
}

function parseCsv(source: string) {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index] ?? "\n";
    if (character === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) table.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  const headers = (table.shift() ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return table.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function CsvImportButton({ resource }: { resource: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!['parties', 'vehicles', 'drivers'].includes(resource)) return null;
  async function importFile(file: File) {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const response = await fetch("/api/transport/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, rows }) });
      const payload = await response.json() as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo importar el archivo.");
      window.alert(payload.message ?? "Importación completada.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  return <><input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /><button type="button" className="button button--secondary" disabled={busy} onClick={() => inputRef.current?.click()} title="Importa hasta 1.000 filas con encabezados técnicos"><Upload size={14} /> {busy ? "Importando…" : "Importar CSV"}</button></>;
}

export function TransportDataControls({ pagination }: { pagination: TransportPageInfo | null }) {
  if (!pagination) return null;
  const options = statusOptions[pagination.resource] ?? [];
  const first = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const filtered = Boolean(pagination.query || pagination.status);

  return <section className="transport-data-controls" aria-label="Búsqueda y paginación en servidor">
    <form method="get" className="transport-data-controls__form">
      <label className="transport-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar registros</span><input key={pagination.query} name="q" defaultValue={pagination.query} placeholder="Buscar en todos los campos principales" /></label>
      {options.length ? <select name="status" defaultValue={pagination.status ?? ""} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : null}
      <select name="pageSize" defaultValue={String(pagination.pageSize)} aria-label="Filas por página"><option value="10">10 filas</option><option value="25">25 filas</option><option value="50">50 filas</option><option value="100">100 filas</option></select>
      <button type="submit" className="button button--secondary">Aplicar</button>
      {filtered ? <Link href="?page=1&pageSize=25" className="transport-data-controls__clear"><X size={14} /> Limpiar</Link> : null}
      <span className="transport-data-controls__exports"><a className="button button--secondary" href={exportHref("excel", pagination)}><Download size={14} /> Excel</a><a className="button button--secondary" href={exportHref("pdf", pagination)}><Download size={14} /> PDF</a></span>
      <CsvImportButton resource={pagination.resource} />
    </form>
    <div className="transport-data-controls__page"><span>Mostrando {first}–{last} de <strong>{pagination.total.toLocaleString("es-PE")}</strong></span><div><Link aria-disabled={pagination.page <= 1} tabIndex={pagination.page <= 1 ? -1 : undefined} href={hrefFor(Math.max(1, pagination.page - 1), pagination)} aria-label="Página anterior"><ChevronLeft size={16} /></Link><b>{pagination.page} / {pagination.totalPages}</b><Link aria-disabled={pagination.page >= pagination.totalPages} tabIndex={pagination.page >= pagination.totalPages ? -1 : undefined} href={hrefFor(Math.min(pagination.totalPages, pagination.page + 1), pagination)} aria-label="Página siguiente"><ChevronRight size={16} /></Link></div></div>
  </section>;
}
