"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Field, Input, Select } from "@/shared/components/ui";
import type { RestaurantData } from "../types";

type Row = { key: string; page: number; name: string; category: string; description: string; price: number | null; kind: "PRODUCT" | "ADDON" | "COMBO"; warning: string; selected?: boolean; active?: boolean; cost?: number; targetId?: string; expectedPriceCents?: number };
type Job = { id: string; filename: string; sourceHash: string; nextPage: number; pageCount: number; status: string; rows: Row[]; lastError?: string; sourceVerified?: boolean };
const endpoint = "/api/restaurant/menu-import";
const normalize = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
async function responseData(response: Response) { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "No se pudo completar la importación."); return body; }

export function MenuImport({ data }: { data: RestaurantData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]), [job, setJob] = useState<Job | null>(null), [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [areaId, setAreaId] = useState(""), [taxCategory, setTaxCategory] = useState("");
  const [confirmed, setConfirmed] = useState(false), [sourceUrl, setSourceUrl] = useState(""), [sourcePage, setSourcePage] = useState(1);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  function prepareRows(items: Row[]) {
    return items.map((row) => {
      const matches = data.products.filter((product) => normalize(product.name) === normalize(row.name));
      const existing = matches.length === 1 ? matches[0] : undefined;
      return { ...row, selected: row.selected ?? false, active: row.active ?? false, cost: row.cost ?? 0, targetId: row.targetId ?? existing?.id, expectedPriceCents: row.expectedPriceCents ?? existing?.priceCents };
    });
  }
  async function show() {
    setOpen(true); setError(""); stop.current = false;
    try { const state = await responseData(await fetch(endpoint, { cache: "no-store" })); setEnabled(state.enabled); setJobs(state.jobs); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar."); }
  }
  function chooseJob(item: Job) { setJob(item); setRows(prepareRows(item.rows)); setConfirmed(false); setError(""); setMessage(item.status === "REVIEW" ? "Revisa y selecciona los productos que quieres importar." : "Vuelve a seleccionar el mismo PDF para continuar donde quedó."); }
  async function read(file?: File) {
    if (!file) return;
    setError(""); setBusy(true); setConfirmed(false); stop.current = false;
    try {
      if (file.size > 50 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Selecciona un PDF de hasta 50 MB.");
      setMessage("Preparando páginas…");
      const bytes = await file.arrayBuffer();
      const { sha256 } = await import("@noble/hashes/sha2.js");
      const sourceHash = Array.from(sha256(new Uint8Array(bytes))).map((byte) => byte.toString(16).padStart(2,"0")).join("");
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(bytes);
      const pageCount = document.getPageCount();
      if (pageCount > 50) throw new Error("El máximo es 50 páginas por carta.");
      setSourceUrl(URL.createObjectURL(file));
      let current = await responseData(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, sourceHash, pageCount }) })) as Job;
      setJob(current); setRows(prepareRows(current.rows));
      if (!current.sourceVerified) {
        const chunkSize = 4 * 1024 * 1024, total = Math.ceil(bytes.byteLength / chunkSize);
        for (let index = 0; index < total; index++) {
          if (stop.current) { setMessage("Carga pausada. Selecciona el mismo PDF para continuar."); return; }
          setMessage(`Conservando PDF original: parte ${index + 1} de ${total}…`);
          await responseData(await fetch(`/api/restaurant/menu-source?id=${encodeURIComponent(current.id)}&index=${index}&total=${total}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes.slice(index * chunkSize, (index + 1) * chunkSize) }));
        }
        await responseData(await fetch(`/api/restaurant/menu-source?id=${encodeURIComponent(current.id)}`, { method: "PATCH" }));
        current = { ...current, sourceVerified: true }; setJob(current);
      }
      for (let page = current.nextPage; page < pageCount && !stop.current; page++) {
        setMessage(`Leyendo página ${page + 1} de ${pageCount}… Puedes pausar al terminar esta página.`);
        const one = await PDFDocument.create(); const [copy] = await one.copyPages(document, [page]); one.addPage(copy);
        const pageBytes = await one.save();
        if (pageBytes.length > 8 * 1024 * 1024) throw new Error(`La página ${page + 1} supera 8 MB. Optimiza el PDF antes de continuar.`);
        const form = new FormData(); form.set("id", current.id); form.set("page", String(page)); form.set("file", new Blob([new Uint8Array(pageBytes)], { type: "application/pdf" }), `page-${page + 1}.pdf`);
        current = await responseData(await fetch(endpoint, { method: "POST", body: form })) as Job;
        setJob(current); setRows(prepareRows(current.rows));
      }
      setMessage(current.status === "REVIEW" ? "Lectura terminada. Comprueba precios y selecciona las filas para importar." : "Lectura pausada. Los resultados están guardados; vuelve a seleccionar el mismo PDF para continuar.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo leer. Puedes reintentar sin duplicar páginas terminadas."); }
    finally { setBusy(false); }
  }
  function update(index: number, changes: Partial<Row>) { setRows((current) => current.map((row, position) => position === index ? { ...row, ...changes } : row)); setConfirmed(false); }
  async function skipPage() {
    if (!job) return;
    setBusy(true); setError("");
    try {
      const result = await responseData(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, page: job.nextPage, action: "skip", confirmed: true }) }));
      setMessage(result.message); setJob({ ...job, nextPage: job.nextPage + 1, status: job.nextPage + 1 === job.pageCount ? "REVIEW" : "DRAFT" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo omitir la página."); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    if (!job) return;
    setBusy(true); setError("");
    try { const result = await responseData(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, rows }) })); setMessage(result.message); setJobs((items) => [{ ...job, rows }, ...items.filter((item) => item.id !== job.id)]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la revisión."); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!job) return;
    setBusy(true); setError("");
    try {
      const result = await responseData(await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, confirmed, areaId, taxCategory, rows: rows.filter((row) => row.selected).map((row) => ({ ...row, cost: row.cost ?? 0, active: row.active ?? false })) }) }));
      setMessage(result.message); setJob({ ...job, status: "APPLIED" }); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  return <><Button type="button" variant="secondary" onClick={() => void show()}>Importar carta PDF</Button><Dialog open={open} title="Importar carta PDF" description="Lectura por páginas, revisión y confirmación antes de cambiar la carta." className="menu-import-dialog" onClose={() => { stop.current = true; setOpen(false); }}>
    <p>Se conservará el PDF original de forma privada. El lector enviará las páginas a Mistral para extraer productos. Revisa los resultados: la IA puede confundir precios y variantes. Los combos necesitan configuración manual.</p>
    {!enabled && !job ? <p role="status">Lectura pendiente de activar por el administrador. Tus productos actuales siguen disponibles para edición manual.</p> : <Field label="Seleccionar PDF o continuar lectura"><Input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} /></Field>}
    {jobs.filter((item) => item.status !== "APPLIED").length ? <Field label="Borradores guardados"><Select value={job?.id ?? ""} disabled={busy} onChange={(event) => { const item = jobs.find((candidate) => candidate.id === event.target.value); if (item) chooseJob(item); }}><option value="">Selecciona un borrador</option>{jobs.filter((item) => item.status !== "APPLIED").map((item) => <option value={item.id} key={item.id}>{item.filename} · {item.nextPage}/{item.pageCount} páginas</option>)}</Select></Field> : null}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert" className="auth-error">{error}</p> : null}
    {job ? <progress aria-label="Páginas leídas" max={job.pageCount} value={job.nextPage} /> : null}
    {busy && job?.status !== "REVIEW" ? <Button type="button" variant="secondary" onClick={() => { stop.current = true; }}>Pausar después de esta página</Button> : null}
    {!busy && job && job.nextPage < job.pageCount ? <Button type="button" variant="secondary" onClick={() => void skipPage()}>Omitir página {job.nextPage + 1} sin importar sus productos</Button> : null}
    {rows.length && job?.status !== "APPLIED" ? <><div className="menu-import-review"><div className="menu-import-rows">{rows.map((row, index) => <section className="menu-import-row" key={row.key}><div className="menu-import-row-heading"><label><input type="checkbox" checked={Boolean(row.selected)} disabled={busy} onChange={(event) => update(index, { selected: event.target.checked })} /> Importar producto {index + 1}</label><button type="button" onClick={() => setSourcePage(row.page)}>Ver página {row.page}</button></div>{row.warning || row.price === null || row.kind === "COMBO" ? <p className="import-warning">{row.warning || "Revisa el precio y la composición antes de vender."}</p> : null}<Field label={`Nombre ${index + 1}`}><Input value={row.name} disabled={busy} onChange={(event) => update(index, { name: event.target.value })}/></Field><Field label={`Categoría ${index + 1}`}><Input value={row.category} disabled={busy} onChange={(event) => update(index, { category: event.target.value })}/></Field><Field label={`Precio ${index + 1} (S/)`}><Input type="number" min="0.01" step="0.01" value={row.price ?? ""} disabled={busy} onChange={(event) => update(index, { price: event.target.value === "" ? null : Number(event.target.value) })}/></Field><Field label={`Descripción ${index + 1}`}><Input value={row.description} disabled={busy} onChange={(event) => update(index, { description: event.target.value })}/></Field><Field label={`Acción ${index + 1}`}><Select value={row.targetId ?? ""} disabled={busy} onChange={(event) => { const product = data.products.find((item) => item.id === event.target.value); update(index, { targetId: product?.id, expectedPriceCents: product?.priceCents }); }}><option value="">Crear producto nuevo</option>{data.products.map((product) => <option key={product.id} value={product.id}>Actualizar {product.name} · S/ {(product.priceCents / 100).toFixed(2)}</option>)}</Select></Field>{row.targetId ? <small>Se actualizan nombre, descripción y precio. Se conservan categoría, costo, impuestos y preparación.</small> : <><Field label={`Costo ${index + 1} (S/)`}><Input type="number" min="0" step="0.01" value={row.cost ?? 0} disabled={busy} onChange={(event) => update(index, { cost: Number(event.target.value) })}/></Field><label><input type="checkbox" checked={Boolean(row.active)} disabled={busy || row.kind === "COMBO"} onChange={(event) => update(index, { active: event.target.checked })}/> Activar para venta</label></>}</section>)}</div>{sourceUrl ? <iframe className="menu-import-source" title={`Carta original, página ${sourcePage}`} src={`${sourceUrl}#page=${sourcePage}`} /> : <p>Selecciona el PDF original para visualizarlo junto a las filas.</p>}</div><div className="editor-section"><Field label="Área de preparación para productos nuevos"><Select value={areaId} onChange={(event) => { setAreaId(event.target.value); setConfirmed(false); }}><option value="">Selecciona un área</option>{data.preparationAreas.filter((area) => area.active).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</Select></Field><Field label="Afectación tributaria de productos nuevos"><Select value={taxCategory} onChange={(event) => { setTaxCategory(event.target.value); setConfirmed(false); }}><option value="">Selecciona la afectación</option><option value="GRAVADA">Gravada</option><option value="EXONERADA">Exonerada</option><option value="INAFECTA">Inafecta</option></Select></Field></div><label className="platform-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy}/><span>Revisé los precios, coincidencias y configuración de los productos seleccionados.</span></label><Button type="button" variant="secondary" disabled={busy || job?.status !== "REVIEW"} onClick={() => void saveDraft()}>Guardar revisión</Button><Button type="button" onClick={() => void commit()} disabled={busy || job?.status !== "REVIEW" || !confirmed || !areaId || !taxCategory || !rows.some((row) => row.selected)}>Importar {rows.filter((row) => row.selected).length} productos revisados</Button></> : null}
  </Dialog></>;
}
