import type { MinimarketData } from "@movendi/contracts";
import { money } from "./ui";
import styles from "./MinimarketWorkspace.module.css";
export function Reports({ data }: { data: MinimarketData }) {
  const report = data.report, fmt = money(data); if (!report) return null;
  return <div className={styles.list}>
    {report.truncated ? <p role="alert">Los desgloses muestran las 10 000 ventas más recientes del filtro. Acorta el periodo para obtener un desglose completo. Los totales superiores incluyen todas las ventas.</p> : null}
    <section className={styles.panel}><h2>Margen comercial estimado</h2>{report.marginCents === null ? <p>No calculado: {report.unknownCostLines} líneas tienen costo cero sin confirmación, o el desglose supera el límite.</p> : <p>{fmt(report.marginCents)} · Costo neto {fmt(report.costCents ?? 0)}</p>}<p>Precios con impuestos incluidos menos costo registrado, descontando solo las devoluciones repuestas. No representa utilidad contable: excluye gastos e impuestos por liquidar.</p></section>
    {([["Ventas por cajero", report.byCashier], ["Ventas por caja y turno", report.byCash], ["Ventas de la sucursal actual", report.byBranch], ["Ventas por medio de pago", report.byPayment]] as const).map(([title, rows]) => <section key={title} className={styles.panel}><h2>{title}</h2>{rows.map((row, i) => <div className={styles.line} key={i}><span>{row.name}</span><span>Cobrado {fmt(row.salesCents)} · Devuelto {fmt(row.refundedCents)} · Neto {fmt(row.salesCents - row.refundedCents)}</span></div>)}</section>)}
    <section className={styles.panel}><h2>Presentaciones más vendidas por importe neto</h2>{report.topProducts.map((p, i) => <div key={i} className={styles.line}><span>{p.name} · {p.quantity} presentaciones netas</span><strong>{fmt(p.netCents)}</strong></div>)}</section>
    <section className={styles.panel}><h2>Stock bajo / sin stock</h2><p>{report.noStockCount} productos sin stock. Se muestran hasta 100 alertas.</p>{report.lowStock.map((p) => <p key={p.id}>{p.name}: {p.stock} {p.unit} · mínimo {p.minimumStock}</p>)}</section>
    <section className={styles.panel}><h2>Vencimientos configurados</h2><p>{report.expiringCount} lotes vencidos o próximos. Se muestran hasta 100.</p>{report.expiring.map((p, i) => <p key={i}>{p.name} · lote {p.code} · {p.stock} · {p.expiresOn} · alerta {p.alertDays} días antes</p>)}</section>
    <section className={styles.panel}><h2>Compras y cuentas por pagar</h2><p>{report.purchases.count} compras del periodo. Suma nominal registrada: {(report.purchases.totalCents / 100).toFixed(2)}. Las compras históricas no guardan moneda; no se presenta como total financiero comparable.</p>{report.payables.map((p) => <p key={p.currency}>{p.count} cuentas · saldo pendiente actual {money(p)(p.balanceCents)}</p>)}<p>Los saldos por pagar son actuales, sin filtro de fecha.</p></section>
  </div>;
}
