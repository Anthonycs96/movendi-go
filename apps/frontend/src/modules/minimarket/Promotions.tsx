"use client";
import { useState } from "react";
import type { MinimarketData } from "@movendi/contracts";
import type { RetailOperation } from "./use-operation";
import { Form, Input, n, s } from "./ui";
import styles from "./MinimarketWorkspace.module.css";

export function Promotions({ data, op }: { data: MinimarketData; op: RetailOperation }) {
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  return <section className={styles.panel}><h2>Promociones de esta sucursal</h2><p>Se aplica una promoción por línea: primero la prioridad mayor; en empate, el descuento mayor. Los importes fijos descuentan una vez por línea.</p>
    <details><summary>Nueva promoción</summary><Form busy={op.busy} label="Guardar promoción" submit={(f) => op.run("promotions", { name: s(f, "name"), kind: s(f, "kind"), value: Math.round(n(f, "value") * (s(f, "kind") === "PERCENT" ? 1 : 100)), retailProductId: productId, retailPresentationId: s(f, "presentation") || null, minQuantity: n(f, "minimum"), priority: n(f, "priority"), startsAt: s(f, "start") ? new Date(s(f, "start")).toISOString() : null, endsAt: s(f, "end") ? new Date(s(f, "end")).toISOString() : null, active: true })}>
      <Input name="name" label="Nombre de promoción" /><label>Producto de promoción<select value={productId} onChange={(e) => setProductId(e.target.value)}>{data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Presentación de promoción<select name="presentation" key={productId}><option value="">Todas las presentaciones</option>{data.products.find((p) => p.id === productId)?.presentations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Tipo de promoción<select name="kind"><option value="SPECIAL_PRICE">Precio especial por presentación</option><option value="PERCENT">Porcentaje</option><option value="FIXED">Descuento fijo por línea</option><option value="2X1">2×1</option><option value="3X2">3×2</option></select></label>
      <Input name="value" label="Importe o porcentaje entero (0 para 2×1 / 3×2)" type="number" min="0" step="0.01" value={0} /><Input name="minimum" label="Cantidad mínima de presentaciones" type="number" min="0.000001" step="0.000001" value={1} /><Input name="priority" label="Prioridad" type="number" min="0" max="1000" value={0} /><Input name="start" label="Inicio (hora de este dispositivo)" type="datetime-local" required={false} /><Input name="end" label="Fin (hora de este dispositivo)" type="datetime-local" required={false} />
    </Form></details>
    {data.promotions.map((p) => <div className={styles.line} key={p.id}><span>{p.name} · {p.kind} · prioridad {p.priority} · {p.active ? "Activa" : "Inactiva"}</span><button disabled={op.busy} onClick={() => { const { id, ...body } = p; void op.run(`promotions/${id}`, { ...body, active: !p.active }, "PATCH"); }}>{p.active ? "Desactivar" : "Activar"}</button></div>)}
  </section>;
}
