"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, Banknote, CalendarDays, CircleDollarSign, Clock3, Download, ReceiptText, ShoppingBasket, TrendingUp, Users } from "lucide-react";
import type { RestaurantReportPoint, RestaurantReportsData } from "../types";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/shared/components/ui";
import { formatCurrencyCents } from "@/shared/lib/format";

const periods = [{ key: "7d", label: "7 días" }, { key: "30d", label: "30 días" }, { key: "90d", label: "90 días" }, { key: "12m", label: "12 meses" }] as const;
const paymentLabels: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" };

function comparison(value: number | null) {
  if (value === null) return "Sin periodo anterior comparable";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}% frente al periodo anterior`;
}

function formatGeneratedAt(value: string, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function TrendBars({ points }: { points: RestaurantReportPoint[] }) {
  const maximum = Math.max(...points.map((point) => point.salesCents), 1);
  const labelEvery = points.length > 16 ? 5 : points.length > 10 ? 2 : 1;
  return <div className="report-trend" role="img" aria-label="Evolución de ventas del periodo">
    {points.map((point, index) => <div className="report-trend__column" key={point.key} title={`${point.label}: ${formatCurrencyCents(point.salesCents)} · ${point.orders} ventas`}><span className="report-trend__value">{point.salesCents ? formatCurrencyCents(point.salesCents) : ""}</span><div className="report-trend__track"><i style={{ height: `${Math.max(point.salesCents ? 8 : 2, point.salesCents * 100 / maximum)}%` }} /></div><small>{index % labelEvery === 0 || index === points.length - 1 ? point.label : ""}</small></div>)}
  </div>;
}

function RankingBar({ label, detail, value, maximum, suffix }: { label: string; detail?: string; value: number; maximum: number; suffix: string }) {
  return <div className="report-ranking__row"><div><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</div><span>{suffix}</span><i><b style={{ width: `${maximum ? Math.max(3, value * 100 / maximum) : 0}%` }} /></i></div>;
}

function exportCsv(reports: RestaurantReportsData) {
  const rows = [
    ["Reporte", reports.periodLabel],
    ["Ventas", (reports.metrics.salesCents / 100).toFixed(2)],
    ["Ganancia estimada", (reports.metrics.profitCents / 100).toFixed(2)],
    ["Atenciones", reports.metrics.attentions],
    ["Ticket promedio", (reports.metrics.averageTicketCents / 100).toFixed(2)],
    [],
    ["Producto", "Categoría", "Unidades", "Ventas", "Ganancia estimada"],
    ...reports.topProducts.map((product) => [product.name, product.category, product.quantity, (product.salesCents / 100).toFixed(2), (product.profitCents / 100).toFixed(2)]),
    [],
    ["Cliente", "DNI", "Compras", "Ventas", "Ticket promedio"],
    ...reports.topCustomers.map((customer) => [customer.name, customer.dni ?? "", customer.orders, (customer.salesCents / 100).toFixed(2), (customer.averageTicketCents / 100).toFixed(2)]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `reporte-restaurante-${reports.period}-${reports.generatedAt.slice(0, 10)}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

export function RestaurantReports({ reports }: { reports: RestaurantReportsData }) {
  const [trendView, setTrendView] = useState<"day" | "week" | "month">(reports.trend.granularity);
  const trendPoints = trendView === "day" ? reports.salesByDay : trendView === "week" ? reports.salesByWeek : reports.salesByMonth;
  const peakHour = useMemo(() => [...reports.salesByHour].sort((a, b) => b.orders - a.orders || b.salesCents - a.salesCents)[0], [reports.salesByHour]);
  const peakWeekday = useMemo(() => [...reports.salesByWeekday].sort((a, b) => b.salesCents - a.salesCents)[0], [reports.salesByWeekday]);
  const maxProduct = Math.max(...reports.topProducts.map((product) => product.quantity), 1);
  const maxCategory = Math.max(...reports.topCategories.map((category) => category.salesCents), 1);
  const maxCustomer = Math.max(...reports.topCustomers.map((customer) => customer.salesCents), 1);
  const maxHour = Math.max(...reports.salesByHour.map((hour) => hour.orders), 1);
  const maxWeekday = Math.max(...reports.salesByWeekday.map((day) => day.salesCents), 1);
  const knownCustomerSales = reports.topCustomers.reduce((sum, customer) => sum + customer.salesCents, 0);

  return <>
    <PageHeader eyebrow="Análisis del negocio" title="Estadísticas y reportes" description={`Rendimiento real del restaurante · ${reports.periodLabel.toLowerCase()}`} icon={BarChart3} actions={<div className="report-actions"><div className="report-periods" aria-label="Periodo del reporte">{periods.map((period) => <Link className={reports.period === period.key ? "active" : ""} aria-current={reports.period === period.key ? "page" : undefined} href={`?period=${period.key}`} key={period.key}>{period.label}</Link>)}</div><Button type="button" variant="secondary" onClick={() => exportCsv(reports)}><Download size={15} />Exportar CSV</Button></div>} />
    <section className="stats-grid stats-grid--four report-metrics">
      <StatCard label="Ventas totales" value={formatCurrencyCents(reports.metrics.salesCents)} detail={comparison(reports.comparison.salesPct)} icon={Banknote} tone="emerald" />
      <StatCard label="Ganancia estimada" value={formatCurrencyCents(reports.metrics.profitCents)} detail={`${reports.metrics.marginPct.toFixed(1)}% de margen · ${comparison(reports.comparison.profitPct)}`} icon={CircleDollarSign} tone="violet" />
      <StatCard label="Atenciones" value={String(reports.metrics.attentions)} detail={comparison(reports.comparison.attentionsPct)} icon={ReceiptText} tone="blue" />
      <StatCard label="Ticket promedio" value={formatCurrencyCents(reports.metrics.averageTicketCents)} detail={comparison(reports.comparison.averageTicketPct)} icon={TrendingUp} tone="amber" />
    </section>
    <section className="report-secondary-metrics">
      <Card><ShoppingBasket size={18} /><span><small>Productos vendidos</small><strong>{reports.metrics.itemsSold}</strong></span></Card>
      <Card><Users size={18} /><span><small>Clientes identificados</small><strong>{reports.metrics.uniqueCustomers}</strong></span></Card>
      <Card><TrendingUp size={18} /><span><small>Clientes recurrentes</small><strong>{reports.metrics.repeatCustomers}</strong></span></Card>
      <Card><ReceiptText size={18} /><span><small>Tasa de cancelación</small><strong>{reports.metrics.cancellationRatePct.toFixed(1)}%</strong></span></Card>
      <Card><Clock3 size={18} /><span><small>Hora con más ventas</small><strong>{peakHour?.orders ? peakHour.label : "Sin datos"}</strong></span></Card>
      <Card><CalendarDays size={18} /><span><small>Día más fuerte</small><strong>{peakWeekday?.salesCents ? peakWeekday.label : "Sin datos"}</strong></span></Card>
    </section>
    <Card className="report-panel report-trend-panel"><header className="report-panel__header"><div><span className="section-kicker">Evolución comercial</span><h2>Ventas en el tiempo</h2><p>Importes cobrados y cantidad de atenciones.</p></div><div className="report-view-tabs" role="tablist" aria-label="Agrupación de ventas"><button type="button" role="tab" aria-selected={trendView === "day"} className={trendView === "day" ? "active" : ""} onClick={() => setTrendView("day")}>Día</button><button type="button" role="tab" aria-selected={trendView === "week"} className={trendView === "week" ? "active" : ""} onClick={() => setTrendView("week")}>Semana</button><button type="button" role="tab" aria-selected={trendView === "month"} className={trendView === "month" ? "active" : ""} onClick={() => setTrendView("month")}>Mes</button></div></header>{trendPoints.some((point) => point.salesCents) ? <TrendBars points={trendPoints} /> : <div className="report-empty"><BarChart3 size={28} /><strong>Aún no hay ventas en esta vista</strong><span>Los cobros completados aparecerán aquí automáticamente.</span></div>}</Card>
    <section className="report-grid report-grid--rankings">
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Demanda</span><h2>Productos más vendidos</h2><p>Ordenados por unidades vendidas.</p></div></header><div className="report-ranking">{reports.topProducts.length ? reports.topProducts.map((product) => <RankingBar key={product.id} label={product.name} detail={`${product.category} · Ganancia ${formatCurrencyCents(product.profitCents)}`} value={product.quantity} maximum={maxProduct} suffix={`${product.quantity} uds. · ${formatCurrencyCents(product.salesCents)}`} />) : <div className="report-empty"><ShoppingBasket size={24} /><strong>Sin productos vendidos</strong></div>}</div></Card>
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Preferencias</span><h2>Categorías con mayor demanda</h2><p>Participación sobre las ventas del periodo.</p></div></header><div className="report-ranking">{reports.topCategories.length ? reports.topCategories.map((category) => <RankingBar key={category.id} label={category.name} detail={`${category.quantity} unidades · ${category.sharePct.toFixed(1)}% del total`} value={category.salesCents} maximum={maxCategory} suffix={formatCurrencyCents(category.salesCents)} />) : <div className="report-empty"><BarChart3 size={24} /><strong>Sin categorías vendidas</strong></div>}</div></Card>
    </section>
    <section className="report-grid report-grid--customers">
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Clientes</span><h2>Clientes que más compran</h2><p>{formatCurrencyCents(knownCustomerSales)} en ventas identificadas dentro del ranking.</p></div></header><div className="report-ranking">{reports.topCustomers.length ? reports.topCustomers.map((customer) => <RankingBar key={customer.id} label={customer.name} detail={`${customer.dni ? `DNI ${customer.dni} · ` : ""}${customer.orders} compras · Ticket ${formatCurrencyCents(customer.averageTicketCents)}`} value={customer.salesCents} maximum={maxCustomer} suffix={formatCurrencyCents(customer.salesCents)} />) : <div className="report-empty"><Users size={24} /><strong>No hay ventas asociadas a clientes</strong><span>Las ventas sin cliente sí están incluidas en los totales.</span></div>}</div></Card>
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Cobros</span><h2>Medios de pago</h2><p>Distribución de la recaudación.</p></div></header><div className="payment-breakdown">{reports.paymentMethods.length ? reports.paymentMethods.map((payment) => <div key={payment.method}><span><strong>{paymentLabels[payment.method] ?? payment.method}</strong><small>{payment.orders} operaciones</small></span><span><b>{formatCurrencyCents(payment.salesCents)}</b><StatusBadge tone="info">{payment.sharePct.toFixed(1)}%</StatusBadge></span></div>) : <div className="report-empty"><Banknote size={24} /><strong>Sin cobros registrados</strong></div>}</div></Card>
    </section>
    <section className="report-grid report-grid--schedule">
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Horarios</span><h2>Ventas por hora</h2><p>Detecta las franjas con mayor carga operativa.</p></div></header><div className="hourly-chart">{reports.salesByHour.map((hour) => <div key={hour.hour} title={`${hour.label}: ${hour.orders} ventas · ${formatCurrencyCents(hour.salesCents)}`}><i><b style={{ height: `${Math.max(hour.orders ? 10 : 2, hour.orders * 100 / maxHour)}%` }} /></i><small>{hour.hour % 3 === 0 ? hour.label : ""}</small></div>)}</div></Card>
      <Card className="report-panel"><header className="report-panel__header"><div><span className="section-kicker">Semana</span><h2>Demanda por día</h2><p>Compara el comportamiento de lunes a domingo.</p></div></header><div className="weekday-chart">{reports.salesByWeekday.map((day) => <div key={day.key}><span><strong>{day.label}</strong><small>{day.orders} ventas</small></span><i><b style={{ width: `${Math.max(day.salesCents ? 4 : 0, day.salesCents * 100 / maxWeekday)}%` }} /></i><em>{formatCurrencyCents(day.salesCents)}</em></div>)}</div></Card>
    </section>
    <p className="report-footnote">Ventas y rankings muestran importes netos con descuentos y cargos repartidos proporcionalmente. Las ventas devueltas se excluyen. Ganancia estimada = ventas menos costo registrado; {reports.estimatedCostLines} líneas históricas usan el costo actual como estimación. {reports.includeCancelledOrders ? "La tasa incluye pedidos cancelados." : "Los pedidos cancelados están excluidos por configuración."} Generado el {formatGeneratedAt(reports.generatedAt, reports.timezone)}.</p>
  </>;
}
