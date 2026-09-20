"use client";
import { useState, useRef } from "react";
import type { MinimarketData, MinimarketProduct } from "@movendi/contracts";
import type { RetailOperation } from "./use-operation";
import { ProductLookup } from "./barcode";
import { Form, Input, n, s, money } from "./ui";
import styles from "./MinimarketWorkspace.module.css";

type PurchaseLine = { productId: string; name: string; quantity: number; unitCostCents: number; lotCode?: string; expiresOn?: string };
export function Purchases({ data, op, canWrite, canCreate, canCredit }: { data: MinimarketData; op: RetailOperation; canWrite: boolean; canCreate: boolean; canCredit: boolean }) {
  const [productId, setProductId] = useState(""), [scanned, setScanned] = useState<MinimarketProduct | null>(null), [factor, setFactor] = useState(1), [draft, setDraft] = useState<PurchaseLine[]>([]), [error, setError] = useState("");
  const area = useRef<HTMLDivElement>(null);
  const products = scanned ? [scanned, ...data.products.filter((p) => p.id !== scanned.id)] : data.products;
  const p = products.find((p) => p.id === productId), fmt = money(data);
  function readLine(f: FormData): PurchaseLine {
    if (!p) throw new Error("Selecciona un producto.");
    const quantity = n(f, "quantity"), cost = n(f, "cost");
    if (!Number.isFinite(quantity) || quantity <= 0 || !s(f, "quantity") || !s(f, "cost") || cost < 0) throw new Error("Completa cantidad y costo válidos.");
    if (p.trackExpiry && (!s(f, "lot") || !s(f, "expiry"))) throw new Error("Completa el lote y vencimiento.");
    return { productId, name: p.name, quantity: Math.round(quantity * factor * 1e6) / 1e6, unitCostCents: Math.round(cost * 100), ...(p.trackExpiry ? { lotCode: s(f, "lot"), expiresOn: s(f, "expiry") } : {}) };
  }
  return <div className={styles.actionList}><section className={styles.panel}><h2>Últimas 30 recepciones</h2>{data.purchases.map((purchase) => <div className={styles.line} key={purchase.id}><span><strong>{purchase.code}</strong><br />{purchase.supplierName} · {purchase.documentNumber ?? "Sin documento"}</span><strong>{fmt(purchase.totalCents)}</strong></div>)}</section>{canWrite ? <Form modal={{ title: "Recibir mercadería", trigger: "Nueva compra", onClose: () => { setDraft([]); setProductId(""); setScanned(null); setFactor(1); setError(""); } }} busy={op.busy} disabled={!p && !draft.length} label="Recibir compra" submit={async (f) => {
    setError("");
    try {
      const lines = [...draft, ...(p && s(f, "quantity") ? [readLine(f)] : [])];
      if (!lines.length) throw new Error("Agrega al menos un producto.");
      const result = await op.run("purchases", { supplierName: data.suppliers.find((supplier) => supplier.id === s(f, "supplierId"))?.name ?? s(f, "supplier"), ...(s(f, "supplierId") ? { supplierId: s(f, "supplierId") } : {}), credit: f.has("credit"), ...(s(f, "dueOn") ? { dueOn: s(f, "dueOn") } : {}), documentNumber: s(f, "document"), notes: s(f, "notes"), lines: lines.map(({ name: ignored, ...line }) => { void ignored; return line; }) });
      if (result) { setDraft([]); setProductId(""); setScanned(null); area.current?.closest("form")?.reset(); }
      return result;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa la recepción."); }
  }}><div ref={area} className={styles.formFields}><p className={styles.muted}>Escanea, completa la cantidad y añade la línea. Confirma toda la recepción al terminar. El costo corresponde siempre a una unidad base.</p><label>Proveedor registrado<select name="supplierId"><option value="">Ingresar nombre manual</option>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name} · {supplier.documentNumber}</option>)}</select></label><Input name="supplier" label="Proveedor" required={false} />{canCredit ? <><label><input name="credit" type="checkbox" />Compra al crédito</label><Input name="dueOn" label="Vencimiento de la compra al crédito" type="date" required={false} /></> : null}<Input name="document" label="Documento del proveedor" required={false} />
    <ProductLookup section="purchases" currency={data.currency} canCreate={canCreate} onProduct={(product, presentationId) => { setScanned(product); setProductId(product.id); setFactor(product.presentations.find((pr) => pr.id === presentationId)?.factor ?? 1); }} />
    <label>Producto<select value={productId} onChange={(e) => { setProductId(e.target.value); setFactor(1); }}><option value="">Seleccionar</option>{products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label>
    <Input name="quantity" label={`Cantidad recibida (${factor === 1 ? p?.unit ?? "base" : `presentaciones de ${factor} ${p?.unit}`})`} type="number" min="0.000001" step="0.000001" required={Boolean(p)} /><Input name="cost" label="Costo por unidad base" type="number" min="0" step="0.01" required={Boolean(p)} />{p?.trackExpiry ? <><Input name="lot" label="Código de lote" /><Input name="expiry" label="Vencimiento" type="date" min={data.today} /></> : null}
    <button type="button" disabled={!p || op.busy} onClick={() => { setError(""); try { const form = area.current!.closest("form")!; const line = readLine(new FormData(form)); if (draft.some((r) => r.productId === line.productId)) throw new Error("El producto ya está en la recepción. Quita la línea para corregirla; recibe lotes distintos por separado."); setDraft([...draft, line]); setProductId(""); for (const name of ["quantity", "cost", "lot", "expiry"]) { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.value = ""; } } catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa los datos."); } }}>Agregar y seguir escaneando</button>
    {draft.map((line) => <div className={styles.line} key={line.productId}><span>{line.name} · {line.quantity} unidades base · {fmt(Math.round(line.quantity * line.unitCostCents))}{line.lotCode ? ` · Lote ${line.lotCode}` : ""}</span><button type="button" onClick={() => setDraft(draft.filter((r) => r !== line))}>Quitar</button></div>)}
    {error ? <p role="alert">{error}</p> : null}<Input name="notes" label="Observaciones" required={false} />
  </div></Form> : null}</div>;
}
