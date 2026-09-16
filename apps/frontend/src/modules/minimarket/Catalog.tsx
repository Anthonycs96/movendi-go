"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Package, Plus, ScanLine } from "lucide-react";
import type { MinimarketData, MinimarketProduct } from "@movendi/contracts";
import { Dialog } from "@/shared/components/ui";
import { BarcodeField, ProductLookup } from "./barcode";
import { ProductWizard, TaxClassification } from "./ProductWizard";
import { RetailSearch } from "./RetailSearch";
import { RetailTabs } from "./RetailTabs";
import { Form, Input, n, s, money } from "./ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";

export function Catalog({ data, op, canWrite }: { data: MinimarketData; op: RetailOperation; canWrite: boolean }) {
  const params = useSearchParams(), fmt = money(data);
  const [creating, setCreating] = useState(() => params.has("barcode"));
  const [lookup, setLookup] = useState(false), [selected, setSelected] = useState("");
  const [scanned, setScanned] = useState<MinimarketProduct | null>(null);
  const product = data.products.find((item) => item.id === selected) ?? (scanned?.id === selected ? scanned : undefined);
  return <div className={styles.catalog}>
    <div className={styles.catalogActions}>{canWrite ? <button type="button" className={styles.primary} onClick={() => setCreating(true)}><Plus size={18} />Nuevo producto</button> : null}<button type="button" onClick={() => setLookup(true)}><ScanLine size={18} />Consultar código</button></div>
    <RetailSearch data={data} />
    <section aria-label="Productos y presentaciones" className={styles.catalogList}>
      {data.products.length ? data.products.map((p) => <article className={styles.catalogItem} key={p.id}><span className={styles.productIcon}><Package size={22} /></span><div><h2>{p.name}</h2><p>{p.sku} · {p.category}{!p.active ? " · Inactivo" : ""}</p><strong>{p.presentations.length === 1 ? fmt(p.presentations[0].priceCents) : `${p.presentations.length} presentaciones`}</strong><small>{p.stock} {p.unit} en stock</small></div>{canWrite ? <button type="button" aria-label={`Editar ${p.sku}`} onClick={() => setSelected(p.id)}>Editar</button> : <div>{p.presentations.map((pr) => <p key={pr.id}>{pr.name}: {fmt(pr.priceCents)} · {pr.factor} {p.unit} · {pr.barcode ?? "Sin código"}{!pr.active ? " · Inactiva" : ""}</p>)}</div>}</article>) : <div className={styles.emptyState}><Package size={34} /><h2>{params.get("q") ? "No encontramos productos" : "Empieza tu catálogo"}</h2><p>{params.get("q") ? "Prueba con otro nombre o código." : "Usa Nuevo producto para registrar el primero."}</p></div>}
    </section>
    {creating && canWrite ? <ProductWizard initialBarcode={params.get("barcode") ?? ""} op={op} onClose={() => setCreating(false)} /> : null}
    <Dialog open={lookup} title="Consultar por código" initialFocus="dialog" onClose={() => setLookup(false)} className={styles.productDialog}><div className={styles.workspace}><ProductLookup section="catalog" currency={data.currency} onProduct={(p) => { if (canWrite) { setScanned(p); setSelected(p.id); setLookup(false); } }} /></div></Dialog>
    <Dialog open={!!product && canWrite} title={product ? `Editar ${product.sku}` : "Editar producto"} initialFocus="dialog" onClose={() => { if (!op.busy) setSelected(""); }} className={styles.productDialog}>
      {product ? <div className={styles.workspace}>{op.error ? <p className={styles.error} role="alert">{op.error}</p> : null}<RetailTabs label="Edición de producto" items={[
        { id: "details", label: "Datos", content: <Form key={product.id} busy={op.busy} submit={(f) => op.run(`products/${product.id}`, { name: s(f, "name"), category: s(f, "category"), taxCategory: s(f, "taxCategory"), minimumStock: n(f, "minimum"), expiryAlertDays: n(f, "expiryDays"), active: f.has("active") }, "PATCH")}>
          <div className={styles.formFields}><Input name="name" label="Nombre" value={product.name} /><Input name="category" label="Categoría" value={product.category} /><Input name="minimum" label="Stock mínimo" type="number" min="0" step="0.000001" value={product.minimumStock} /><Input name="expiryDays" label="Días de alerta de vencimiento" type="number" min="0" max="3650" value={product.expiryAlertDays} /><TaxClassification value={product.taxCategory} /><label><input name="active" type="checkbox" defaultChecked={product.active} />Activo</label></div>
        </Form> },
        { id: "presentations", label: "Presentaciones", content: <div className={styles.list}>
          {product.presentations.map((pr) => <details key={pr.id} className={styles.disclosure}><summary>{pr.name} · {fmt(pr.priceCents)}</summary><p>{pr.factor} {product.unit} · {pr.barcode ?? "Sin código"}</p><Form busy={op.busy} submit={(f) => op.run(`presentations/${pr.id}`, { priceCents: Math.round(n(f, "price") * 100), active: f.has("active") }, "PATCH")}><Input name="price" label="Precio" type="number" min="0" step="0.01" value={pr.priceCents / 100} /><label><input name="active" type="checkbox" defaultChecked={pr.active} />Disponible</label></Form></details>)}
          <details className={styles.disclosure}><summary>Agregar presentación</summary><Form busy={op.busy} label="Agregar presentación" submit={(f) => op.run("presentations", { productId: product.id, name: s(f, "name"), sku: s(f, "presentationSku"), barcode: s(f, "barcode"), factor: n(f, "factor"), priceCents: Math.round(n(f, "price") * 100), weighted: f.has("weighted") })}>
            <Input name="name" label="Nombre (paquete, caja…)" /><Input name="presentationSku" label="SKU de presentación (opcional)" required={false} /><BarcodeField /><Input name="factor" label={`Cantidad base (${product.unit})`} type="number" min="0.000001" step="0.000001" value={1} /><Input name="price" label="Precio" type="number" min="0" step="0.01" /><label><input name="weighted" type="checkbox" />Venta fraccionada</label>
          </Form></details>
        </div> },
      ]} /></div> : null}
    </Dialog>
  </div>;
}
