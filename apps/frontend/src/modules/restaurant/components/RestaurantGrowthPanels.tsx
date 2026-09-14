"use client";

import { useState } from "react";
import type { RestaurantReportsData } from "../types";
import { Card, StatusBadge } from "@/shared/components/ui";
import { formatCurrencyCents as money } from "@/shared/lib/format";

const margin = (value: number | null) => value === null ? "Sin ingreso" : `${value.toFixed(1)}%`;

const channelNames: Record<string, string> = { DINE_IN: "Salón", TAKEAWAY: "Para llevar", DELIVERY: "Delivery", OTHER: "Otros" };

export function RestaurantGrowthPanels({ reports }: { reports: RestaurantReportsData }) {
  const [view, setView] = useState<"products" | "customers" | "channels">("products");
  const growth = reports.growth;
  if (!growth) return null;
  const priorities = [
    ...(growth.zeroCostUnits ? [{ title: "Completa los costos", text: `${growth.zeroCostUnits} unidades vendidas tienen costo cero. Revisa recetas y costos antes de decidir qué productos promocionar.` }] : []),
    ...(growth.productsToReview.length ? [{ title: "Revisa precios y porciones", text: `${growth.productsToReview[0].name} registra ${margin(growth.productsToReview[0].marginPct)} de margen sobre ventas. Compara precio, costo y porción antes de aplicar descuentos.` }] : []),
    ...(growth.anonymousOrders ? [{ title: "Conoce a tus clientes", text: `${growth.anonymousOrders} ventas no tienen cliente identificado. Ofrece registrar al cliente para medir si vuelve y mejorar la atención.` }] : []),
    ...(growth.unsoldProductCount ? [{ title: "Revisa la carta sin movimiento", text: `${growth.unsoldProductCount} productos que ya existían al inicio del periodo siguen activos y no tienen ventas vigentes. Comprueba disponibilidad, presentación y demanda.` }] : []),
  ].slice(0, 3);

  return <section className="growth-report" aria-label="Oportunidades de crecimiento">
    <header className="growth-report__heading"><div><span className="section-kicker">Decisiones para el negocio</span><h2>Qué mejorar ahora</h2><p>Oportunidades basadas en las ventas de esta sede y el periodo seleccionado.</p></div></header>
    {priorities.length ? <div className="growth-priorities">{priorities.map((priority) => <Card key={priority.title}><h3>{priority.title}</h3><p>{priority.text}</p></Card>)}</div> : <Card><p>{reports.metrics.attentions ? "No aparecen alertas de costos, identificación ni productos sin ventas en este periodo." : "Registra cobros para empezar a detectar oportunidades. No hay suficientes datos para recomendar acciones."}</p></Card>}
    <div className="growth-report__tabs" role="group" aria-label="Análisis para crecer">
      <button type="button" aria-pressed={view === "products"} onClick={() => setView("products")}>Productos y margen</button>
      <button type="button" aria-pressed={view === "customers"} onClick={() => setView("customers")}>Clientes y frecuencia</button>
      <button type="button" aria-pressed={view === "channels"} onClick={() => setView("channels")}>Canales y control</button>
    </div>
    {view === "products" ? <>
      <div className="growth-report__grid">
        <Card className="report-panel"><header className="report-panel__header"><div><h3>Productos que más aportan</h3><p>Venta del producto menos costo registrado. Se excluyen productos con unidades a costo cero.</p></div></header>
          <div className="growth-table-scroll"><table className="growth-table"><caption className="sr-only">Productos ordenados por aporte total</caption><thead><tr><th>Producto</th><th>Unidades</th><th>Aporte</th><th>Margen</th></tr></thead><tbody>{growth.profitableProducts.map((product) => <tr key={product.id}><th scope="row">{product.name}<small>{product.category}</small></th><td>{product.quantity}</td><td>{money(product.profitCents)}</td><td>{margin(product.marginPct)}</td></tr>)}</tbody></table></div>
          {!growth.profitableProducts.length ? <p className="growth-empty">Sin productos con aporte positivo y costo informado.</p> : null}
        </Card>
        <Card className="report-panel"><header className="report-panel__header"><div><h3>Productos para revisar</h3><p>Margen menor al promedio ponderado de los productos con costo, o aporte no positivo.</p></div></header>
          <ul className="growth-product-list">{growth.productsToReview.map((product) => <li key={product.id}><div><strong>{product.name}</strong><small>{product.quantity} unidades · {money(product.salesCents)} vendidos</small></div><StatusBadge tone={product.profitCents <= 0 ? "danger" : "warning"}>{margin(product.marginPct)}</StatusBadge></li>)}</ul>
          {!growth.productsToReview.length ? <p className="growth-empty">Sin productos para señalar con los datos de costos disponibles.</p> : null}
        </Card>
      </div>
      <Card className="report-panel"><header className="report-panel__header"><div><h3>Carta sin ventas · {growth.unsoldProductCount} productos</h3><p>Productos actualmente activos, creados antes del periodo y sin ventas vigentes. Hasta 10 resultados.</p></div></header>
        {growth.unsoldProducts.length ? <div className="growth-unsold">{growth.unsoldProducts.map((product) => <span key={product.id}><strong>{product.name}</strong><small>{product.category}</small></span>)}</div> : <p className="growth-empty">No hay productos que cumplan estas condiciones.</p>}
      </Card>
    </> : null}
    {view === "customers" ? <div className="growth-report__grid">
      <Card className="report-panel"><header className="report-panel__header"><div><h3>Captación y regreso</h3><p>Clientes identificados con al menos una compra vigente en este periodo, en esta sede.</p></div></header>
        <dl className="growth-facts"><div><dt>Nuevos compradores</dt><dd>{growth.newCustomers}</dd><small>Sin compras vigentes anteriores al periodo en esta sede.</small></div><div><dt>Clientes que regresaron</dt><dd>{growth.returningCustomers}</dd><small>Ya habían comprado antes del periodo.</small></div><div><dt>Compraron dos veces o más</dt><dd>{growth.repeatCustomerRatePct.toFixed(1)}%</dd><small>{reports.metrics.repeatCustomers} de {reports.metrics.uniqueCustomers} clientes identificados.</small></div></dl>
      </Card>
      <Card className="report-panel"><header className="report-panel__header"><div><h3>Calidad de la relación comercial</h3><p>Las ventas sin cliente se incluyen en los totales, pero no permiten medir recurrencia.</p></div></header>
        <dl className="growth-facts"><div><dt>Ventas con cliente</dt><dd>{growth.customerIdentificationPct.toFixed(1)}%</dd><small>{growth.identifiedOrders} identificadas · {growth.anonymousOrders} sin identificar.</small></div><div><dt>Unidades por venta</dt><dd>{growth.unitsPerOrder.toFixed(2)}</dd><small>Incluye platos, bebidas y adicionales cobrados.</small></div><div><dt>Ticket promedio</dt><dd>{money(reports.metrics.averageTicketCents)}</dd><small>Sirve de referencia para evaluar combinaciones y venta de adicionales.</small></div></dl>
      </Card>
    </div> : null}
    {view === "channels" ? <>
      <Card className="report-panel"><header className="report-panel__header"><div><h3>Qué canal impulsa las ventas</h3><p>Importes cobrados, con descuentos aplicados y cargos de delivery incluidos.</p></div></header>
        <div className="growth-table-scroll"><table className="growth-table"><caption className="sr-only">Ventas por canal</caption><thead><tr><th>Canal</th><th>Ventas</th><th>Importe</th><th>Ticket promedio</th><th>Participación</th></tr></thead><tbody>{growth.channels.map((channel) => <tr key={channel.source}><th scope="row">{channelNames[channel.source] ?? channel.source}</th><td>{channel.orders}</td><td>{money(channel.salesCents)}</td><td>{money(channel.averageTicketCents)}</td><td>{channel.sharePct.toFixed(1)}%</td></tr>)}</tbody></table></div>
        {!growth.channels.length ? <p className="growth-empty">Sin ventas cobradas para comparar canales.</p> : null}
      </Card>
      <div className="growth-report__grid">
        <Card className="report-panel"><header className="report-panel__header"><div><h3>Descuentos y devoluciones</h3></div></header><dl className="growth-facts"><div><dt>Descuentos aplicados</dt><dd>{money(growth.discountsCents)}</dd><small>{growth.discountedOrders} ventas · {growth.discountRatePct.toFixed(1)}% del subtotal vigente, antes de descuentos. Incluye canje de puntos.</small></div><div><dt>Devoluciones realizadas</dt><dd>{money(growth.refundsCents)}</dd><small>{growth.refundsCount} devoluciones registradas en el periodo. Pueden corresponder a cobros anteriores; no se restan otra vez de las ventas vigentes.</small></div><div><dt>Cargos de delivery cobrados</dt><dd>{money(growth.deliveryFeesCents)}</dd><small>No representan ganancia del reparto; falta descontar el costo de entrega.</small></div></dl></Card>
        <Card className="report-panel"><header className="report-panel__header"><div><h3>Control de la operación</h3></div></header><dl className="growth-facts"><div><dt>Pedidos pendientes de cobro ahora</dt><dd>{money(growth.pendingCents)}</dd><small>{growth.pendingOrders} pedidos abiertos sin venta. Es una foto actual, no ingreso del periodo.</small></div><div><dt>Pedidos cancelados</dt><dd>{reports.metrics.cancelledOrders}</dd><small>{reports.metrics.cancellationRatePct.toFixed(1)}% de todos los pedidos creados en el periodo, sin depender del filtro de anulaciones.</small></div><div><dt>Unidades con costo cero</dt><dd>{growth.zeroCostUnits}</dd><small>{reports.estimatedCostLines} líneas históricas usan costos actuales. Completar costos mejora la estimación, pero no calcula utilidad neta.</small></div></dl></Card>
      </div>
    </> : null}
    <p className="report-footnote">El aporte y el margen comparan importes cobrados con costos registrados; no son utilidad neta. No descuentan impuestos, comisiones, personal, alquiler ni otros gastos. Los cargos de delivery se separan de los rankings de productos.</p>
  </section>;
}
