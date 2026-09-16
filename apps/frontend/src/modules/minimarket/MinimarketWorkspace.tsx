"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CoreTenantData, MinimarketData, MinimarketSale } from "@movendi/contracts";
import { CoreSettingsWorkspace } from "@/core/tenancy/components/CoreSettingsWorkspace";
import { localizeCode } from "@/shared/lib/localization";
import { hasPermission } from "@/core/auth/permissions";
import { useRetailOperation, type RetailOperation } from "./use-operation";
import { minimarketManifest } from "./manifest";
import styles from "./MinimarketWorkspace.module.css";
import { Catalog } from "./Catalog";

import { Form, Input, n, s, money } from "./ui";
import { Stock } from "./Stock";
import { Transfers } from "./Transfers";
import { Purchases } from "./Purchases";
import { Suppliers } from "./Suppliers";
import { ConnectionStatus } from "./ConnectionStatus";
import { PointOfSale } from "./PointOfSale";
import { RetailSearch } from "./RetailSearch";
import { RetailTabs } from "./RetailTabs";
import { PageHeader } from "@/shared/components/ui";
import { ShoppingBag, Package, ArrowRight } from "lucide-react";
import { scopeKey } from "./use-operation";
import { Reports } from "./Reports";
import { Promotions } from "./Promotions";
import { CatalogImport } from "./CatalogImport";
export function MinimarketWorkspace({ section, data, core, permissions, enabledModules = [], platformAdmin = false }: { section: string; data: MinimarketData; core: CoreTenantData; permissions: string[]; enabledModules?: string[]; platformAdmin?: boolean }) {
  const op = useRetailOperation(data.scope), fmt = money(data);
  const can = (permission: string) => hasPermission(permissions, permission);
  if (section === "settings") return <><CoreSettingsWorkspace core={core} platformAdmin={platformAdmin} /><div className={styles.workspace}>{op.error ? <p className={styles.error} role="alert">{op.error}</p> : null}{op.message ? <p role="status">{op.message}</p> : null}<FiscalSettings data={data} op={op} /></div></>;
  return <div className={styles.workspace}>
    <PageHeader eyebrow={core.tenant.shortName} title={minimarketManifest.navigation.find((item) => item.path === section)?.label ?? "Minimarket"} description={section === "pos" ? "Elige productos, revisa tu venta y cobra." : section === "dashboard" ? "Tu negocio de un vistazo." : section === "catalog" ? "Productos y precios" : "Gestiona tu negocio"} icon={section === "pos" ? ShoppingBag : Package} /><ConnectionStatus op={op} />
    {op.error ? <div className={styles.error} role="alert">{op.error}</div> : null}{op.message ? <div className={styles.notice} role="status">{op.message}</div> : null}
    {["pos", "checkout", "sales", "purchases"].includes(section) && data.cashSessions.length ? <CashSelector data={data} /> : null}
    {["sales", "clients", "reports"].includes(section) ? <RetailSearch data={data} /> : null}
    {section === "pos" ? <PointOfSale key={scopeKey(data.scope)} data={data} op={op} /> : null}
    {section === "catalog" ? <RetailTabs label="Herramientas de catálogo" items={[
      { id: "products", label: "Productos", content: <><Catalog data={data} op={op} canWrite={can("minimarket:catalog:write")} />{can("minimarket:prices:write") && !can("minimarket:catalog:write") ? data.products.flatMap((product) => product.presentations.map((presentation) => <Form key={presentation.id} busy={op.busy} label="Guardar precio" submit={(form) => op.run(`presentations/${presentation.id}`, { priceCents: Math.round(n(form, "price") * 100), active: presentation.active }, "PATCH")}><h2>{product.name} · {presentation.name}</h2><Input name="price" label="Precio de presentación" type="number" min="0" step="0.01" value={presentation.priceCents / 100} /></Form>)) : null}</> },
      ...(can("minimarket:promotions:write") ? [{ id: "promotions", label: "Promociones", content: <Promotions data={data} op={op} /> }] : []),
      ...(can("minimarket:catalog:write") ? [{ id: "import", label: "Importar", content: <CatalogImport op={op} /> }] : []),
    ]} /> : null}
    {section === "inventory" ? <RetailTabs label="Herramientas de inventario" items={[
      { id: "stock", label: "Stock y conteos", content: <><RetailSearch data={data} /><Stock data={data} op={op} canWrite={can("minimarket:counts:write")} /></> },
      { id: "transfers", label: "Transferencias", content: <Transfers data={data} op={op} canWrite={can("minimarket:transfers:write")} /> },
    ]} /> : null}
    {section === "purchases" ? <RetailTabs label="Herramientas de compras" items={[
      { id: "purchases", label: "Recepciones", content: <><RetailSearch data={data} /><Purchases data={data} op={op} canWrite={can("minimarket:purchases:write")} canCreate={can("minimarket:catalog:write")} canCredit={can("minimarket:payables:write")} /></> },
      { id: "suppliers", label: "Proveedores y deudas", content: <Suppliers data={data} op={op} canWrite={can("minimarket:suppliers:write")} canPay={can("minimarket:payables:write")} /> },
    ]} /> : null}
    {section === "checkout" ? <Cash data={data} op={op} canOpen={can("minimarket:cash:open")} canClose={can("minimarket:cash:close")} canMove={can("minimarket:cash:movement")} /> : null}
    {section === "sales" ? <Sales data={data} op={op} canIssue={can("minimarket:sales:write")} canRefund={can("minimarket:refunds:write")} tenantName={core.tenant.name} /> : null}
    {section === "clients" ? <div className={styles.split}><section className={styles.panel}><h2>Clientes del negocio</h2>{data.customers.length ? data.customers.map((c) => <div className={styles.line} key={c.id}><strong>{c.name}</strong><span>{c.phone ?? c.email}</span></div>) : <p>No hay clientes registrados.</p>}</section>{can("customers:write") ? <Form busy={op.busy} submit={(f) => op.run("customers", { name: s(f, "name"), dni: s(f, "dni"), phone: s(f, "phone"), email: s(f, "email") })}><h2>Nuevo cliente</h2><Input name="name" label="Nombre o razón social" /><Input name="dni" label="DNI o RUC" required={false} /><Input name="phone" label="Teléfono" required={false} /><Input name="email" label="Correo" type="email" required={false} /></Form> : null}</div> : null}
    {["dashboard", "reports"].includes(section) ? <><p className={styles.muted}>Ventas en la moneda actual del negocio y el periodo seleccionado. Las devoluciones corresponden a esas ventas, incluso si se realizaron después.</p><Period /><div className={styles.grid}>{data.summary ? [["Ventas brutas", fmt(data.summary.salesCents)], ["Devoluciones", fmt(data.summary.refundedCents)], ["Ventas netas", fmt(data.summary.salesCents - data.summary.refundedCents)], ["Operaciones", data.summary.count], ["Stock bajo", data.summary.lowStock], ["Lotes con alerta de vencimiento", data.summary.expiringLots]].map(([label, value]) => <section className={styles.panel} key={label}><span>{label}</span><strong className={styles.metric}>{value}</strong></section>) : null}</div><section className={styles.panel}><h2>Detalle de ventas</h2><button onClick={() => exportSales(data)}>Descargar esta página (CSV)</button><SaleTable data={data} /></section>{section === "reports" ? <Reports data={data} /> : <div className={styles.quickActions}>{[["pos", "Nueva venta", "minimarket:sales:write"], ["catalog", "Gestionar productos", "minimarket:catalog:read"], ["reports", "Ver reportes completos", "minimarket:reports:read"]].filter(([path, , permission]) => can(permission) && (!enabledModules.length || enabledModules.includes(path))).map(([path, label]) => <a key={path} href={path}><span>{label}</span><ArrowRight size={18} /></a>)}</div>}</> : null}
  </div>;
}
function CashSelector({ data }: { data: MinimarketData }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  return <details className={styles.cashPicker}><summary>{data.cashSessions.find((cash) => cash.id === data.cash?.id)?.registerName ?? "Seleccionar caja"} · {data.cashSessions.find((cash) => cash.id === data.cash?.id)?.openedById === data.scope.actorId ? "Mi turno" : "Cambiar turno"}</summary><label>Caja de esta operación<select value={data.cash?.id ?? ""} onChange={(event) => { const query = new URLSearchParams(params); if (event.target.value) query.set("cash", event.target.value); else query.delete("cash"); router.replace(`${path}?${query}`); }}><option value="">Mi turno / abrir caja</option>{data.cashSessions.map((cash) => <option value={cash.id} key={cash.id}>{cash.registerName}{cash.openedById === data.scope.actorId ? " · Mi turno" : " · Otro cajero"}</option>)}</select></label></details>;
}
function Period() { const router = useRouter(), path = usePathname(), params = useSearchParams(); return <label>Periodo<select value={params.get("period") ?? "30d"} onChange={(e) => { const q = new URLSearchParams(params); q.set("period", e.target.value); q.set("page", "1"); router.push(`${path}?${q}`); }}><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option><option value="90d">Últimos 90 días</option><option value="all">Todo el historial</option></select></label>; }
function exportSales(data: MinimarketData) {
  const rows = [["Código", "Fecha", "Moneda", "Estado", "Bruto (centavos)", "Devuelto (centavos)", "Neto (centavos)"], ...data.sales.map((sale) => [sale.code, sale.createdAt, sale.currency, sale.status, sale.totalCents, sale.refundedCents, sale.totalCents - sale.refundedCents])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ventas-${data.today}-pagina-${data.page}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function Cash({ data, op, canOpen, canClose, canMove }: { data: MinimarketData; op: RetailOperation; canOpen: boolean; canClose: boolean; canMove: boolean }) {
  const fmt = money(data), cash = data.cash;
  return <><div className={styles.split}>{cash ? <><Form busy={op.busy} disabled={!canClose} label="Cerrar turno" submit={(f) => op.run(`cash/${cash.id}/close`, { countedCents: Math.round(n(f, "counted") * 100), expectedCents: cash.expectedCents, notes: s(f, "notes") })}><h2>Arqueo de caja</h2><p>Fondo: {fmt(cash.openingCents)}</p><strong className={styles.metric}>Esperado: {fmt(cash.expectedCents)}</strong><Input name="counted" label="Efectivo contado" type="number" min="0" step="0.01" /><Input name="notes" label="Motivo de diferencia (si existe)" required={false} /><p className={styles.muted}>Las diferencias requieren permiso de aprobación y un motivo.</p></Form><Form busy={op.busy} disabled={!canMove} label="Registrar movimiento" submit={(f) => op.run(`cash/${cash.id}/movement`, { type: s(f, "type"), amountCents: Math.round(n(f, "amount") * 100), reason: s(f, "reason") })}><h2>Ingreso o retiro</h2><label>Tipo<select name="type"><option value="IN">Ingreso</option><option value="OUT">Retiro</option></select></label><Input name="amount" label="Importe" type="number" min="0.01" step="0.01" /><Input name="reason" label="Motivo (al menos 5 caracteres)" /></Form></> : <Form busy={op.busy} disabled={!canOpen} label="Abrir caja" submit={(f) => op.run("cash", { openingCents: Math.round(n(f, "opening") * 100), registerName: s(f, "register") })}><h2>Abrir turno</h2><Input name="register" label="Nombre de caja" value="Caja principal" /><Input name="opening" label="Fondo inicial" type="number" min="0" step="0.01" value={0} /></Form>}</div><section className={styles.panel}><h2>Últimos turnos</h2>{data.cashHistory.map((c) => <div className={styles.line} key={c.id}><span>{c.registerName} · {localizeCode(c.status)} · {new Date(c.openedAt).toLocaleString("es-PE")}</span><span>Esperado {fmt(c.expectedCents)} / Contado {c.countedCents == null ? "—" : fmt(c.countedCents)}</span></div>)}</section><section className={styles.panel}><h2>Últimos movimientos de efectivo</h2>{data.cashMovements.map((m) => <div className={styles.line} key={m.id}><span>{m.type} · {m.reason}</span><strong>{fmt(m.amountCents)}</strong></div>)}</section></>;
}

function SaleTable({ data, select }: { data: MinimarketData; select?: (sale: MinimarketSale) => void }) { return <div className={styles.table}><table><thead><tr><th>Venta</th><th>Estado</th><th>Total</th><th>Devuelto</th><th>Detalle</th></tr></thead><tbody>{data.sales.map((sale) => <tr key={sale.id}><td>{sale.code}<br />{new Date(sale.createdAt).toLocaleString("es-PE")}</td><td>{sale.status === "PARTIALLY_REFUNDED" ? "Devolución parcial" : localizeCode(sale.status)}</td><td>{money(sale)(sale.totalCents)}</td><td>{money(sale)(sale.refundedCents)}</td><td>{select ? <button onClick={() => select(sale)}>Ver ticket</button> : sale.paymentMethod}</td></tr>)}</tbody></table>{!data.sales.length ? <p>No hay ventas en este periodo.</p> : null}</div>; }
function Sales({ data, op, canRefund, canIssue, tenantName }: { data: MinimarketData; op: RetailOperation; canRefund: boolean; canIssue: boolean; tenantName: string }) {
  const [selectedId, setSelectedId] = useState(""); const sale = data.sales.find((s) => s.id === selectedId), fmt = money({ currency: sale?.currency ?? data.currency });
  return <><Period /><SaleTable data={data} select={(sale) => setSelectedId(sale.id)} />{sale ? <div className={styles.split}><section className={styles.panel}><div className={styles.receipt}><h2>{tenantName}</h2><strong>Ticket de venta</strong><p>{sale.code}<br />{new Date(sale.createdAt).toLocaleString("es-PE")}</p>{sale.lines.map((line) => <div className={styles.line} key={line.id}><span>{line.name}<br />{line.quantity} × {fmt(line.unitPriceCents)}{line.discountCents ? <small> · {line.promotionName}: −{fmt(line.discountCents)}</small> : null}</span><strong>{fmt(line.totalCents)}</strong></div>)}<p>Total: {fmt(sale.totalCents)} · Devuelto: {fmt(sale.refundedCents)}</p>{sale.payments.map((p, index) => <p key={index}>{localizeCode(p.method)}: {fmt(p.amountCents)}</p>)}<small>Ticket interno. No sustituye una boleta o factura electrónica.</small></div><button onClick={() => window.print()}>Imprimir ticket</button><FiscalDocuments sale={sale} op={op} canIssue={canIssue} enabled={data.fiscal.enabled} /></section>
      {canRefund ? <Form key={sale.id} busy={op.busy} disabled={!data.cash} label="Registrar devolución" submit={(f) => op.run(`sales/${sale.id}/refund`, { cashSessionId: data.cash?.id, reason: s(f, "reason"), payments: [{ method: s(f, "method"), amountCents: Math.round(n(f, "refundAmount") * 100), reference: null }, ...(f.has("splitRefund") ? [{ method: s(f, "secondMethod"), amountCents: Math.round(n(f, "secondRefundAmount") * 100), reference: null }] : [])], lines: [{ lineId: s(f, "line"), quantity: n(f, "quantity"), restock: f.has("restock") }] })}><h2>Devolución parcial</h2><label>Línea<select name="line" required>{sale.lines.filter((l) => l.quantity > l.returnedQuantity).map((l) => <option value={l.id} key={l.id}>{l.name} · Pendiente {l.quantity - l.returnedQuantity}</option>)}</select></label><Input name="refundAmount" label="Importe a devolver por el primer método" type="number" min="0" step="0.01" /><label><input type="checkbox" name="splitRefund" />Devolver también por un segundo método</label><label>Segundo método<select name="secondMethod">{[...new Set(sale.payments.map((p) => p.method))].map((m) => <option key={m} value={m}>{localizeCode(m)}</option>)}</select></label><Input name="secondRefundAmount" label="Segundo importe (si corresponde)" type="number" min="0" step="0.01" required={false} /><Input name="quantity" label="Cantidad a devolver" type="number" min="0.000001" step="0.000001" /><label><input name="restock" type="checkbox" />Reponer mercadería vendible en su lote original</label><label>Método original<select name="method">{[...new Set(sale.payments.map((p) => p.method))].map((m) => <option key={m} value={m}>{localizeCode(m)}</option>)}</select></label>{!data.cash ? <p className={styles.error}>Abre un turno en Caja para registrar devoluciones.</p> : null}<p className={styles.muted}>La devolución debe registrarse en una caja abierta de esta sucursal. Los productos vencidos o dañados se devuelven sin reponer stock.</p><Input name="reason" label="Motivo (al menos 5 caracteres)" /></Form> : null}
    </div> : null}</>;
}

function FiscalSettings({ data, op }: { data: MinimarketData; op: RetailOperation }) {
  return <div className={styles.split}>
    <Form busy={op.busy} label="Guardar configuración fiscal" submit={(f) => op.run("fiscal/settings", { enabled: f.has("enabled"), environment: s(f, "environment"), taxRatePct: n(f, "rate"), invoiceSeries: s(f, "invoiceSeries"), receiptSeries: s(f, "receiptSeries") })}>
      <h2>Comprobantes de esta sucursal</h2><p>Guarda primero las credenciales del ambiente elegido. Los precios del catálogo incluyen el impuesto configurado.</p>
      <label><input name="enabled" type="checkbox" defaultChecked={data.fiscal.enabled} />Habilitar boletas y facturas</label>
      <label>Ambiente fiscal<select name="environment" defaultValue={data.fiscal.environment}><option value="BETA">Pruebas</option><option value="PRODUCTION">Producción</option></select></label>
      <Input name="rate" label="Tasa de impuesto (%)" type="number" min="0" max="100" step="0.01" value={data.fiscal.taxRatePct} />
      <Input name="invoiceSeries" label="Serie de facturas" value={data.fiscal.invoiceSeries} /><Input name="receiptSeries" label="Serie de boletas" value={data.fiscal.receiptSeries} />
      <p className={styles.muted}>La clasificación de cada producto se configura en Catálogo. Un cambio de tasa o cliente no modifica las ventas ya cobradas.</p>
    </Form>
    <div className={styles.list}><Form busy={op.busy} label="Guardar credenciales" submit={(f) => op.run("fiscal/credentials", { apiUrl: s(f, "apiUrl"), environment: s(f, "environment"), token: s(f, "token") })}>
      <h2>Conexión NubeFact del negocio</h2><p>{data.fiscalConnection?.configured ? "Credenciales guardadas" : "Sin credenciales"} {data.fiscalConnection?.tokenHint}</p>
      <Input name="apiUrl" label="Ruta HTTPS de NubeFact" type="url" value={data.fiscalConnection?.apiUrl ?? ""} />
      <label>Ambiente de las credenciales<select name="environment" defaultValue={data.fiscal.environment}><option value="BETA">Pruebas</option><option value="PRODUCTION">Producción</option></select></label>
      <Input name="token" label="Token" type="password" />
      <p className={styles.muted}>Las credenciales se comparten entre sucursales. Los comprobantes conservan la ruta original para sus reintentos.</p>
    </Form><button disabled={op.busy || !data.fiscalConnection?.configured} onClick={() => void op.run("fiscal/test", {})}>Probar conexión configurada</button></div>
  </div>;
}
function FiscalDocuments({ sale, op, canIssue, enabled }: { sale: MinimarketSale; op: RetailOperation; canIssue: boolean; enabled: boolean }) {
  const router = useRouter();
  const status = (value: string) => ({ ISSUED: "Aceptado", PENDING: "En cola", SENDING: "Procesando", SUBMITTED: "Enviado, aceptación pendiente", UNKNOWN: "Resultado por confirmar", REVIEW: "Requiere revisión" }[value] ?? value);
  return <div><h3>Comprobantes electrónicos</h3><button onClick={() => router.refresh()}>Actualizar estado</button>
    {sale.fiscalJobs.map((job) => <div key={job.id} className={styles.panel}><strong>{job.kind === "CREDIT_NOTE" ? "Nota de crédito" : job.kind === "FACTURA" ? "Factura" : "Boleta"} {job.series}-{job.number}</strong><p>{status(job.status)} · {job.environment === "BETA" ? "Pruebas" : "Producción"}</p>{job.lastError ? <p role="alert">{job.lastError}</p> : null}<div className={styles.row}>{(["pdfUrl", "xmlUrl", "cdrUrl"] as const).map((key) => job[key] ? <a key={key} href={job[key]!} target="_blank" rel="noreferrer">{key.slice(0, 3).toUpperCase()}</a> : null)}</div>{canIssue && job.status !== "ISSUED" ? <button disabled={op.busy} onClick={() => void op.run('fiscal-jobs/'+job.id, {})}>Consultar / reenviar</button> : null}</div>)}
    {!sale.fiscalJobs.length ? <p>Esta venta tiene un ticket interno.</p> : null}
    {canIssue && enabled && sale.status === "PAID" && !sale.fiscalJobs.length ? <div className={styles.row}>{(["BOLETA", "FACTURA"] as const).map((kind) => <button key={kind} disabled={op.busy} onClick={() => void op.run('sales/'+sale.id+'/electronic-document', { kind })}>{kind === "FACTURA" ? "Solicitar factura" : "Solicitar boleta"}</button>)}</div> : null}
  </div>;
}
