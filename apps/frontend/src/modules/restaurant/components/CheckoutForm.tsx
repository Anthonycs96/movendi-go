"use client";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Field, Input, OperationForm, Select } from "@/shared/components/ui";
import { formatCurrencyCents } from "@/shared/lib/format";
import type { RestaurantData, RestaurantOrderDto } from "../types";

export function CheckoutPaymentFields({ data, totalCents }: { data: RestaurantData; totalCents: number }) {
  const methods = data.configuration.sales.paymentMethods.filter((item) => item.active);
  const [split, setSplit] = useState(false);
  const [method, setMethod] = useState(methods[0]?.key ?? "");
  const [second, setSecond] = useState(methods[1]?.key ?? methods[0]?.key ?? "");
  const [firstAmount, setFirstAmount] = useState((totalCents / 200).toFixed(2));
  const [received, setReceived] = useState("");
  const firstCents = Math.round(Number(firstAmount) * 100) || 0;
  const secondCents = Math.max(0, totalCents - firstCents);
  const cashCents = split ? (method === "CASH" ? firstCents : 0) + (second === "CASH" ? secondCents : 0) : method === "CASH" ? totalCents : 0;
  return <>
    <div className="editor-preview"><span>Total del pedido</span><strong>{formatCurrencyCents(totalCents)}</strong></div>
    {data.configuration.sales.splitPaymentsEnabled && totalCents > 1 ? <label className="platform-check form-span"><input name="split" type="checkbox" checked={split} onChange={(event) => { setSplit(event.target.checked); setReceived(""); }} /><span><strong>Dividir pago</strong><small>Distribuye el total entre dos medios de pago.</small></span></label> : null}
    <Field label={split ? "Primer medio" : "Medio de pago"}><Select name={split ? "paymentMethod1" : "paymentMethod"} value={method} onChange={(event) => { setMethod(event.target.value); setReceived(""); }} required>{methods.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
    {split ? <><Field label="Monto"><Input name="amount1" type="number" min="0.01" max={((totalCents - 1)/100).toFixed(2)} step="0.01" value={firstAmount} onChange={(event) => setFirstAmount(event.target.value)} required /></Field><Field label="Segundo medio"><Select name="paymentMethod2" value={second} onChange={(event) => { setSecond(event.target.value); setReceived(""); }}>{methods.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field><Field label="Saldo exacto"><Input name="amount2" value={(secondCents/100).toFixed(2)} readOnly /></Field></> : null}
    {cashCents > 0 ? <section className="editor-section"><header><h3>Efectivo y vuelto</h3><p>Efectivo a cobrar: {formatCurrencyCents(cashCents)}</p></header><Field label="Efectivo recibido (S/)"><Input name="receivedAmount" type="number" min={(cashCents/100).toFixed(2)} step="0.01" value={received} onChange={(event) => setReceived(event.target.value)} placeholder={(cashCents/100).toFixed(2)} required /></Field><div className="cash-change" role="status"><span>Vuelto</span><strong>{formatCurrencyCents(Math.max(0, Math.round(Number(received)*100)-cashCents))}</strong></div></section> : null}
  </>;
}
export const checkoutPayload = (form: FormData) => ({ ...(form.get("split") === "on" ? { payments: [{ method: form.get("paymentMethod1"), amount: form.get("amount1") }, { method: form.get("paymentMethod2"), amount: form.get("amount2") }] } : { paymentMethod: form.get("paymentMethod") }), ...(form.has("receivedAmount") ? { receivedAmount: form.get("receivedAmount") } : {}) });
export function CheckoutForm({ data, order }: { data: RestaurantData; order: RestaurantOrderDto }) {
  return <OperationForm title={`Cobrar ${order.code}`} description={`${order.table?.name ?? (order.source === "DELIVERY" ? "Delivery" : "Para llevar")} · ${order.customer?.name ?? "Venta sin cliente"}`} endpoint={`/api/operations/restaurant/orders/${order.id}/checkout`} triggerLabel="Cobrar" triggerIcon={<Banknote size={16} />} submitLabel="Confirmar cobro" transform={checkoutPayload} dialogClassName="restaurant-editor-dialog"><CheckoutPaymentFields data={data} totalCents={order.totalCents} /></OperationForm>;
}
