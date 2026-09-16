"use client";
import { useState } from "react";
import type { MinimarketData, MinimarketProduct } from "@movendi/contracts";
import type { RetailOperation } from "./use-operation";
import { ProductLookup } from "./barcode";
import { Form, Input, n, s } from "./ui";
import styles from "./MinimarketWorkspace.module.css";

type CountLine = { productId: string; lotId?: string; name: string; expectedStock: number; countedStock: number; reason: string };
export function Stock({ data, op, canWrite }: { data: MinimarketData; op: RetailOperation; canWrite: boolean }) {
  const [selection, setSelection] = useState<{ product: MinimarketProduct; lot?: MinimarketProduct["lots"][number] } | null>(null);
  const [scanned, setScanned] = useState<MinimarketProduct | null>(null), [draft, setDraft] = useState<CountLine[]>([]), [counted, setCounted] = useState(0);
  const products = scanned ? [scanned, ...data.products.filter((p) => p.id !== scanned.id)] : data.products;
  function select(product: MinimarketProduct, lot?: MinimarketProduct["lots"][number]) { setSelection({ product, lot }); setCounted(lot?.stock ?? product.stock); }
  return <>
    <div className={styles.panel}><ProductLookup section="inventory" currency={data.currency} onProduct={(p) => { setScanned(p); if (canWrite && !p.trackExpiry) select(p); }} /></div>
    <section className={styles.panel}><h2>Existencias y vencimientos</h2>{products.map((p) => <div key={p.id}><div className={styles.line}><strong>{p.name} · {p.stock} {p.unit}{p.stock <= p.minimumStock ? " · Stock bajo" : ""}</strong>{canWrite && !p.trackExpiry ? <button onClick={() => select(p)}>Contar {p.sku}</button> : null}</div>{p.lots.map((lot) => <div className={styles.line} key={lot.id}><span>Lote {lot.code} · {lot.stock} {p.unit} · Vence {lot.expiresOn}{lot.expiresOn < data.today ? " · VENCIDO: venta bloqueada" : ""}</span>{canWrite ? <button onClick={() => select(p, lot)}>Contar lote {lot.code}</button> : null}</div>)}</div>)}</section>
    {selection ? <Form key={`${selection.product.id}:${selection.lot?.id}`} busy={false} label="Agregar al conteo" submit={async (form) => {
      const line = { productId: selection.product.id, lotId: selection.lot?.id, name: `${selection.product.name}${selection.lot ? ` · ${selection.lot.code}` : ""}`, expectedStock: selection.lot?.stock ?? selection.product.stock, countedStock: n(form, "counted"), reason: s(form, "reason") };
      setDraft((rows) => [...rows.filter((r) => r.productId !== line.productId || r.lotId !== line.lotId), line]); setSelection(null);
    }}><h2>Conteo: {selection.product.name}{selection.lot ? ` · ${selection.lot.code}` : ""}</h2><p>Sistema: {selection.lot?.stock ?? selection.product.stock} {selection.product.unit}</p><label>Cantidad física<input name="counted" type="number" min="0" max="1000000" step={selection.product.unit === "UND" ? "1" : "0.000001"} required value={counted} onChange={(e) => setCounted(Number(e.target.value))} /></label><p>Diferencia: {Number((counted - (selection.lot?.stock ?? selection.product.stock)).toFixed(6))}</p><Input name="reason" label="Motivo (al menos 5 caracteres)" /></Form> : null}
    {draft.length ? <section className={styles.panel}><h2>Revisar conteo ({draft.length})</h2><p>El inventario cambiará al confirmar. Si hubo movimientos desde la lectura, se rechazará el conteo completo para revisarlo.</p>{draft.map((line) => <div className={styles.line} key={`${line.productId}:${line.lotId}`}><span>{line.name} · Sistema {line.expectedStock} · Contado {line.countedStock} · Diferencia {Number((line.countedStock - line.expectedStock).toFixed(6))}</span><button disabled={op.busy} onClick={() => setDraft((rows) => rows.filter((r) => r !== line))}>Quitar</button></div>)}<button className={styles.primary} disabled={op.busy} onClick={async () => { const result = await op.run("counts/batch", { lines: draft.map(({ name: ignored, ...line }) => { void ignored; return line; }) }); if (result) { setDraft([]); setScanned(null); } }}>Confirmar y finalizar conteo</button></section> : null}
    <section className={styles.panel}><h2>Últimos 50 movimientos</h2><div className={styles.table}><table><thead><tr><th>Fecha</th><th>Producto</th><th>Operación</th><th>Cantidad</th><th>Antes → Después / Responsable</th></tr></thead><tbody>{data.movements.map((m) => <tr key={m.id}><td>{new Date(m.createdAt).toLocaleString("es-PE")}</td><td>{m.name}</td><td>{m.type}</td><td>{m.direction === "OUT" ? "−" : "+"}{m.quantity}</td><td>{m.stockBefore} → {m.stockAfter}<br />{m.actorName}<br />{m.reference ?? "Sin referencia"}</td></tr>)}</tbody></table></div></section>
  </>;
}
