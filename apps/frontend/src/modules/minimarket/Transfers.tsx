"use client";
import { useState } from "react";
import type { MinimarketData } from "@movendi/contracts";
import { findBarcode, ScanDialog } from "./barcode";
import { Form, Input, s, RetailModal, RetailFeedback } from "./ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";

export function Transfers({ data, op, canWrite }: { data: MinimarketData; op: RetailOperation; canWrite: boolean }) {
  const [draft, setDraft] = useState<Array<{ presentationId: string; name: string; quantity: number; weighted: boolean }>>([]);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  function add(presentationId: string, name: string, weighted: boolean) { setDraft((lines) => lines.some((line) => line.presentationId === presentationId) ? lines.map((line) => line.presentationId === presentationId ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { presentationId, name, quantity: 1, weighted }]); }
  return <section className={styles.panel}><h2>Transferencias entre sucursales</h2><p>El despacho descuenta el origen. El destino recibe existencias únicamente al confirmar la recepción completa.</p>
    {canWrite ? <Form modal={{ title: "Crear transferencia", onClose: () => setDraft([]) }} busy={op.busy} disabled={!draft.length} label="Guardar borrador de transferencia" submit={async (form) => {
      const result = await op.run("transfers", { destinationBranchId: s(form, "destination"), notes: s(form, "notes"), lines: draft.map(({ presentationId, quantity }) => ({ presentationId, quantity })) }); if (result) setDraft([]); return result;
    }}><label>Sucursal destino<select name="destination" required><option value="">Selecciona destino</option>{data.transferBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><p>El destino debe tener el mismo SKU, unidad base y control de lotes en su catálogo.</p>
      <ScanDialog onScan={async (code) => { const match = await findBarcode(code, "inventory"), presentation = match.product.presentations.find((p) => p.id === match.presentationId)!; if (!match.product.active || !presentation.active) throw new Error("Selecciona un producto activo."); add(presentation.id, `${match.product.name} · ${presentation.name}`, presentation.weighted); return "Presentación agregada a la transferencia."; }} />
      <label>Agregar presentación<select value="" onChange={(event) => { const product = data.products.find((p) => p.presentations.some((pr) => pr.id === event.target.value)); const presentation = product?.presentations.find((pr) => pr.id === event.target.value); if (product && presentation) add(presentation.id, `${product.name} · ${presentation.name}`, presentation.weighted); }}><option value="">Seleccionar</option>{data.products.filter((p) => p.active).flatMap((p) => p.presentations.filter((pr) => pr.active).map((pr) => <option key={pr.id} value={pr.id}>{p.name} · {pr.name}</option>))}</select></label>
      {draft.map((line) => <div className={styles.line} key={line.presentationId}><span>{line.name}</span><input aria-label={`Transferir ${line.name}`} type="number" min={line.weighted ? "0.000001" : "1"} step={line.weighted ? "0.000001" : "1"} value={line.quantity} onChange={(event) => setDraft((rows) => rows.map((r) => r === line ? { ...r, quantity: Number(event.target.value) } : r))} /><button type="button" onClick={() => setDraft(draft.filter((r) => r !== line))}>Quitar</button></div>)}<Input name="notes" label="Observación de la transferencia" required={false} />
    </Form> : null}
    <h3>Últimas 50 transferencias</h3>{data.transfers.map((transfer) => {
      const outbound = transfer.sourceBranchId === data.scope.branchId;
      return <article className={styles.panel} key={transfer.id}><strong>{transfer.sourceName} → {transfer.destinationName}</strong><p>{({ DRAFT: "Borrador", DISPATCHED: "Despachada · En tránsito", RECEIVED: "Recibida", CANCELLED: "Cancelada" } as Record<string, string>)[transfer.status]} · {new Date(transfer.createdAt).toLocaleString("es-PE")}</p><small>{transfer.id}</small>
        <button type="button" onClick={() => setSelected(transfer.id)}>Revisar transferencia</button><RetailModal open={selected === transfer.id} title={`${transfer.sourceName} → ${transfer.destinationName}`} onClose={() => setSelected("")}><RetailFeedback />
        {transfer.lines.map((line, index) => <div className={styles.line} key={`${line.presentationId}:${index}`}><span>{line.name} · {line.quantity} presentaciones · {line.baseQuantity} unidades base{line.lots.map((lot) => ` · Lote ${lot.code} (${lot.quantity}), vence ${lot.expiresOn}`).join("")}</span>{!outbound && transfer.status === "DISPATCHED" && canWrite ? <label><input type="checkbox" checked={checked.includes(`${transfer.id}:${index}`)} onChange={(event) => setChecked((values) => event.target.checked ? [...values, `${transfer.id}:${index}`] : values.filter((v) => v !== `${transfer.id}:${index}`))} />Cantidad y lote revisados</label> : null}</div>)}
        {canWrite && outbound && transfer.status === "DRAFT" ? <div className={styles.row}><button disabled={op.busy} onClick={() => void op.run(`transfers/${transfer.id}/dispatch`, {})}>Confirmar despacho</button><button disabled={op.busy} onClick={() => void op.run(`transfers/${transfer.id}/cancel`, {})}>Cancelar borrador</button></div> : null}
        {canWrite && !outbound && transfer.status === "DISPATCHED" ? <><ScanDialog label="Escanear recepción" onScan={async (code) => { const match = await findBarcode(code, "inventory"); const indices = transfer.lines.flatMap((line, index) => line.destinationProductId === match.product.id ? [index] : []); if (!indices.length) throw new Error("El producto no pertenece a esta transferencia."); return `${match.product.name} encontrado. Revisa las cantidades y lotes y marca las líneas correspondientes.`; }} /><button disabled={op.busy || transfer.lines.some((_, index) => !checked.includes(`${transfer.id}:${index}`))} onClick={() => void op.run(`transfers/${transfer.id}/receive`, {})}>Confirmar recepción completa</button></> : null}
      </RetailModal></article>;
    })}{!data.transfers.length ? <p>No hay transferencias registradas.</p> : null}
  </section>;
}
