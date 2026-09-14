import type { RestaurantReportsData } from "../types";

export function reportCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function restaurantReportCsv(reports: RestaurantReportsData) {
  const amount = (cents: number) => (cents / 100).toFixed(2);
  const growth = reports.growth;
  const rows: unknown[][] = [
    ["Reporte", reports.periodLabel], ["Inicio", reports.startAt], ["Fin", reports.endAt], ["Zona horaria", reports.timezone],
    ["Ventas vigentes", amount(reports.metrics.salesCents)], ["Costo registrado", amount(reports.metrics.costCents)],
    ["Aporte sobre costo (no utilidad neta)", amount(reports.metrics.profitCents)], ["Atenciones", reports.metrics.attentions],
    ["Ticket promedio", amount(reports.metrics.averageTicketCents)], ["Unidades", reports.metrics.itemsSold],
    ["Cancelados", reports.metrics.cancelledOrders], ["Tasa de cancelación (%)", reports.metrics.cancellationRatePct],
    [], ["Día", "Ventas vigentes", "Atenciones"], ...reports.salesByDay.map((day) => [day.label, amount(day.salesCents), day.orders]),
    [], ["Producto (ranking por unidades)", "Categoría", "Unidades", "Ventas sin delivery", "Aporte sobre costo"],
    ...reports.topProducts.map((product) => [product.name, product.category, product.quantity, amount(product.salesCents), amount(product.profitCents)]),
    [], ["Cliente (ranking)", "DNI", "Compras", "Ventas", "Ticket promedio"],
    ...reports.topCustomers.map((customer) => [customer.name, customer.dni ?? "", customer.orders, amount(customer.salesCents), amount(customer.averageTicketCents)]),
    [], ["Medio de pago", "Operaciones", "Importe"], ...reports.paymentMethods.map((payment) => [payment.method, payment.orders, amount(payment.salesCents)]),
  ];
  if (growth) rows.push(
    [], ["Comparación desde", growth.previousStartAt], ["Comparación hasta", growth.previousEndAt],
    ["Descuentos", amount(growth.discountsCents)], ["Ventas con descuento", growth.discountedOrders], ["Descuento sobre subtotal (%)", growth.discountRatePct],
    ["Devoluciones realizadas en el periodo (no restar otra vez)", amount(growth.refundsCents)], ["Número de devoluciones", growth.refundsCount],
    ["Delivery cobrado", amount(growth.deliveryFeesCents)], ["Pedidos pendientes ahora", growth.pendingOrders], ["Importe pendiente ahora", amount(growth.pendingCents)],
    ["Clientes nuevos en esta sede", growth.newCustomers], ["Clientes que regresaron", growth.returningCustomers],
    ["Recurrencia dentro del periodo (%)", growth.repeatCustomerRatePct], ["Ventas con cliente (%)", growth.customerIdentificationPct],
    ["Ventas sin cliente", growth.anonymousOrders], ["Unidades por venta", growth.unitsPerOrder], ["Unidades con costo cero", growth.zeroCostUnits],
    [], ["Canal", "Ventas", "Importe", "Ticket promedio", "Participación (%)"],
    ...growth.channels.map((channel) => [channel.source, channel.orders, amount(channel.salesCents), amount(channel.averageTicketCents), channel.sharePct]),
    [], ["Producto (mayor aporte)", "Unidades", "Aporte", "Margen (%)"], ...growth.profitableProducts.map((product) => [product.name, product.quantity, amount(product.profitCents), product.marginPct]),
    [], ["Producto (revisar margen)", "Unidades", "Aporte", "Margen (%)"], ...growth.productsToReview.map((product) => [product.name, product.quantity, amount(product.profitCents), product.marginPct]),
    [], ["Productos sin ventas", growth.unsoldProductCount], ["Producto sin ventas (hasta 10)", "Categoría"], ...growth.unsoldProducts.map((product) => [product.name, product.category]),
  );
  rows.push([], ["Metodología", "Ventas vigentes excluyen cobros devueltos. Aporte no descuenta impuestos ni gastos operativos. Rankings de productos excluyen delivery. Pendientes corresponden al estado actual de la sede."]);
  return rows.map((row) => row.map(reportCsvCell).join(",")).join("\r\n");
}
