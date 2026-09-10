"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Field, Input, Select } from "@/shared/components/ui";
import type { RestaurantData } from "../types";

type Snapshot = Record<string, string | number | boolean | null>;
type Change = { productId: string; before: Snapshot | null; after: Snapshot };
type Entry = { id: string; createdAt: string; actor: string; action: string; filename?: string; importId?: string; sourceAvailable: boolean; reverted: boolean; history: null | { source: string; reason?: string; changes: Change[] } };
type Result = { entries: Entry[]; page: number; pages: number; count: number; canRevert: boolean };
const labels: Record<string, string> = { name: "Nombre", description: "Descripción", categoryId: "Categoría", priceCents: "Precio", costCents: "Costo", taxCategory: "Impuesto", kitchenArea: "Cocina", productType: "Tipo", areaAssignmentMode: "Asignación de área", detectedAreaKey: "Área detectada", preparationAreaId: "Preparación", active: "Disponible para venta" };
const codes: Record<string, string> = { FOOD: "Producto principal", ADDON: "Adicional", SPECIFIC_AREA: "Área específica o categoría", INHERIT_FROM_PRODUCT: "Heredar del producto", GRAVADA: "Gravada", EXONERADA: "Exonerada", INAFECTA: "Inafecta" };
async function checked(response: Response) { if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message ?? "No se pudo completar la operación."); } return response; }

export function MenuHistory({ data, canWrite }: { data: RestaurantData; canWrite: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<Result | null>(null), [page, setPage] = useState(1), [type, setType] = useState("ALL");
  const [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/restaurant/menu-history?page=${page}&type=${type}`, { cache: "no-store", signal: abort.signal }).then(checked).then((response) => response.json()).then((body: Result) => { setResult(body); setLoading(false); }).catch((cause) => { if (!abort.signal.aborted) { setError(cause.message); setLoading(false); } });
    return () => abort.abort();
  }, [page, type, version]);
  function value(field: string, input: Snapshot[string]) {
    if (input === null || input === "") return "Sin dato";
    if (typeof input === "boolean") return input ? "Sí" : "No";
    if (field.endsWith("Cents")) return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(input) / 100);
    if (field === "categoryId") return data.categories.find((item) => item.id === input)?.name ?? "Categoría anterior no disponible";
    if (field === "preparationAreaId") return data.preparationAreas.find((item) => item.id === input)?.name ?? "Área anterior no disponible";
    return codes[String(input)] ?? String(input);
  }
  async function download(entry: Entry) {
    setBusy(true); setError("");
    try {
      const endpoint = `/api/restaurant/menu-source?id=${encodeURIComponent(entry.importId!)}`;
      const info = await (await checked(await fetch(endpoint))).json();
      const parts: ArrayBuffer[] = [];
      for (let index = 0; index < info.parts; index++) {
        setMessage(`Descargando PDF: parte ${index + 1} de ${info.parts}…`);
        parts.push(await (await checked(await fetch(`${endpoint}&part=${index}`))).arrayBuffer());
      }
      const blob = new Blob(parts, { type: "application/pdf" });
      const { sha256 } = await import("@noble/hashes/sha2.js");
      const digest = Array.from(sha256(new Uint8Array(await blob.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (digest !== info.sha256) throw new Error("El PDF descargado no coincide con el original.");
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = info.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage("PDF original descargado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo descargar."); } finally { setBusy(false); }
  }
  async function revert() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await checked(await fetch("/api/restaurant/menu-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, reason, confirmed }) }));
      setMessage((await response.json()).message); setSelected(null); setLoading(true); setError(""); setVersion((current) => current + 1); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo revertir."); } finally { setBusy(false); }
  }
  return <section className="menu-history" aria-label="Historial de carta">
    <div className="menu-history-toolbar"><div><h2>Historial de carta</h2><p>Consulta quién cambió los productos, compara los valores y descarga la carta original.</p></div><Field label="Origen del cambio"><Select value={type} onChange={(event) => { setLoading(true); setError(""); setType(event.target.value); setPage(1); }}><option value="ALL">Todos los cambios</option><option value="PDF">Importaciones PDF</option><option value="MANUAL">Ediciones manuales</option></Select></Field><Button variant="secondary" disabled={loading || busy} onClick={() => { setLoading(true); setError(""); setVersion((current) => current + 1); }}>Actualizar historial</Button></div>
    {error && !selected ? <p role="alert" className="auth-error">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {loading ? <p role="status">Cargando historial…</p> : result?.entries.length ? <div className="menu-history-list">{result.entries.map((entry) => <article className="menu-history-entry" key={entry.id}>
      <div className="menu-history-heading"><div><h3>{entry.filename ?? (entry.history?.source === "REVERT" ? "Reversión de carta" : "Edición de productos")}</h3><p>{entry.actor} · {new Date(entry.createdAt).toLocaleString("es-PE")} · {entry.history?.changes.length ?? "—"} productos</p></div><span>{entry.reverted ? "Revertido" : entry.history?.source === "REVERT" ? "Reversión registrada" : "Aplicado"}</span></div>
      {entry.history?.reason ? <p>Motivo: {entry.history.reason}</p> : null}
      {entry.history ? <details onToggle={(event) => { const open = event.currentTarget.open; setExpanded((current) => current[entry.id] === open ? current : { ...current, [entry.id]: open }); }}><summary>Ver cambios ({entry.history.changes.length})</summary>{expanded[entry.id] ? entry.history.changes.map((change) => <section className="menu-history-product" key={change.productId}><h4>{String(change.after.name)} · {change.before ? "Actualizado" : "Producto nuevo"}</h4><div className="menu-history-diff">{Object.keys(labels).filter((field) => !change.before || change.before[field] !== change.after[field]).map((field) => <div key={field}><strong>{labels[field]}</strong><span><small>Antes</small>{change.before ? value(field, change.before[field]) : "No existía"}</span><span><small>Después</small>{value(field, change.after[field])}</span></div>)}</div></section>) : null}</details> : <p>Registro anterior a esta función: no conserva una comparación completa ni permite revertir.</p>}
      <div className="menu-history-actions">{entry.importId ? entry.sourceAvailable ? <Button variant="secondary" disabled={busy} onClick={() => void download(entry)}>Descargar PDF original</Button> : <span>PDF original no conservado</span> : null}{result.canRevert && canWrite && entry.history && entry.action === "MENU_CHANGE" && !entry.reverted ? <Button variant="secondary" disabled={busy} onClick={() => { setSelected(entry); setReason(""); setConfirmed(false); setError(""); }}>Revertir este cambio</Button> : null}</div>
    </article>)}</div> : <p>Todavía no hay cambios registrados en esta sede.</p>}
    {result && result.pages > 1 ? <nav className="menu-history-actions" aria-label="Páginas del historial"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => { setLoading(true); setError(""); setPage((current) => current - 1); }}>Anterior</Button><span>Página {page} de {result.pages} · {result.count} registros</span><Button variant="secondary" disabled={loading || page >= result.pages} onClick={() => { setLoading(true); setError(""); setPage((current) => current + 1); }}>Siguiente</Button></nav> : null}
    <Dialog open={Boolean(selected)} title="Revertir cambios de carta" description="Se restaurarán los campos modificados. Los productos nuevos se desactivarán; las ventas se conservarán." onClose={() => { if (!busy) setSelected(null); }}>
      <p>Se revisarán {selected?.history?.changes.length ?? 0} productos. Si alguno tiene cambios posteriores, no se aplicará la reversión.</p>
      <Field label="Motivo de la reversión"><Input value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Ej. Se importaron precios incorrectos" /></Field>
      <label className="platform-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Revisé el detalle y quiero revertir este cambio.</span></label>
      {error ? <p role="alert" className="auth-error">{error}</p> : null}
      <div className="menu-history-actions"><Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancelar</Button><Button disabled={busy || !confirmed || reason.trim().length < 5} onClick={() => void revert()}>{busy ? "Revirtiendo…" : "Confirmar reversión"}</Button></div>
    </Dialog>
  </section>;
}
