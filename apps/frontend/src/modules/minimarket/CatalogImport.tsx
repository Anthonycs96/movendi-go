"use client";
import { useState } from "react";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";
import { RetailModal, RetailFeedback } from "./ui";

type Preview = { rows: Array<{ sku: string; name: string; presentation: string; barcode: string; priceCents: number; stock: number; [key: string]: unknown }>; issues: Array<{ row: number; message: string }> };
export function CatalogImport({ op }: { op: RetailOperation }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <><section className={styles.panel}><h2>Importación de productos</h2><p>Prepara tu archivo y revisa los datos antes de guardarlos.</p><button type="button" className={styles.primary} onClick={() => setOpen(true)}>Importar productos desde Excel o CSV</button></section><RetailModal open={open} title="Importar productos desde Excel o CSV" onClose={() => { if (!busy) setOpen(false); }}><RetailFeedback onRecovered={() => { setPreview(null); setOpen(false); }} /><p>Descarga la plantilla, reemplaza la fila de ejemplo y carga hasta 200 presentaciones (2 MB). Repite el SKU para varias presentaciones; coloca stock inicial solo en la primera fila y en unidades base. Se crean productos nuevos.</p><div className={styles.row}><a download href="/api/minimarket/import">Plantilla Excel</a><a download href="/api/minimarket/import?format=csv">Plantilla CSV</a></div>
    <label>Archivo de productos<input type="file" accept=".xlsx,.csv" disabled={busy || op.busy} onChange={async (event) => {
      const file = event.target.files?.[0]; setPreview(null); setError(""); if (!file) return;
      setBusy(true);
      try { const form = new FormData(); form.set("file", file); const response = await fetch("/api/minimarket/import", { method: "POST", body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "No se pudo leer el archivo."); setPreview(result as Preview); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Error al cargar el archivo."); }
      finally { setBusy(false); }
    }} /></label>{busy ? <p>Validando archivo…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {preview ? <><h3>Vista previa: {preview.rows.length} filas válidas</h3>{preview.issues.map((issue, index) => <p className={styles.error} key={index}>Fila {issue.row}: {issue.message}</p>)}<div className={styles.table}><table><thead><tr><th>SKU</th><th>Producto</th><th>Presentación</th><th>Código</th><th>Stock inicial</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><td>{row.sku}</td><td>{row.name}</td><td>{row.presentation}</td><td>{row.barcode}</td><td>{row.stock}</td></tr>)}</tbody></table></div><p>Al confirmar se guardan todas las filas juntas. Con errores no se importará ninguna.</p><button className={styles.primary} disabled={op.busy || preview.issues.length > 0 || !preview.rows.length} onClick={async () => { const result = await op.run("imports", { rows: preview.rows }); if (result) { setPreview(null); setOpen(false); } }}>Confirmar importación completa</button></> : null}
  </RetailModal></>;
}
