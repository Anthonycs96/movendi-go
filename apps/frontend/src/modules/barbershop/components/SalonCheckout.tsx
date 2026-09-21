"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentDto, BarbershopData } from "@movendi/contracts";
import { Button, Dialog, Field, Input, Select } from "@/shared/components/ui";
import { formatCurrencyCents as money } from "@/shared/lib/format";
import { requestKey } from "@/shared/lib/request-key";
import { paymentLabels, salonCan, salonRequest } from "./salon-ui";
import styles from "./Salon.module.css";

type Line = { key: string; serviceId?: string; productId?: string; staffId: string; quantity: number };
export function SalonCheckout({ data, appointment }: { data: BarbershopData; appointment?: AppointmentDto }) {
  const [open, setOpen] = useState(false), [lines, setLines] = useState<Line[]>([]), [customerId, setCustomerId] = useState(appointment?.customer.id ?? ""), [search, setSearch] = useState("");
  const [payments, setPayments] = useState([{ method: data.paymentMethods?.[0] ?? "CASH", amount: "" }]), [discount, setDiscount] = useState(""), [reason, setReason] = useState(""), [promotionId, setPromotionId] = useState(""), [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ signature: string; key: string } | null>(null), lock = useRef(false), router = useRouter();
  const subtotal = (appointment?.priceCents ?? 0) + lines.reduce((sum, l) => sum + l.quantity * (l.serviceId ? data.services.find((s) => s.id === l.serviceId)?.priceCents ?? 0 : data.products?.find((p) => p.id === l.productId)?.priceCents ?? 0), 0);
  const promotion = data.promotions?.find((p) => p.id === promotionId);
  const reduction = promotion ? promotion.kind === "PERCENT" ? Math.round(subtotal * promotion.value / 100) : promotion.value : Math.round(Number(discount) * 100);
  const total = Math.max(0, subtotal - reduction);
  const paid = payments.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0);
  async function pay() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const body = { appointmentId: appointment?.id, customerId: customerId || null, lines: lines.map(({ key: ignored, ...l }) => { void ignored; return { ...l, staffId: l.staffId || undefined }; }), discountCents: promotion ? 0 : Math.round(Number(discount) * 100), discountReason: reason, promotionId: promotionId || undefined, payments: payments.map((p) => ({ method: p.method, amountCents: payments.length === 1 && !p.amount ? total : Math.round(Number(p.amount) * 100) })), cashReceivedCents: received ? Math.round(Number(received) * 100) : undefined };
      const signature = JSON.stringify(body); if (request.current?.signature !== signature) request.current = { signature, key: requestKey() };
      await salonRequest("/api/operations/barbershop/sales", { ...body, idempotencyKey: request.current.key });
      request.current = null; setOpen(false); setLines([]); setDiscount(""); setReason(""); setPromotionId(""); setReceived(""); setPayments([{ method: data.paymentMethods?.[0] ?? "CASH", amount: "" }]); router.refresh(); window.dispatchEvent(new Event("salon-updated"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cobrar."); } finally { setBusy(false); lock.current = false; }
  }
  if (!salonCan(data, "barbershop:cash:write")) return null;
  return <><Button onClick={() => { setOpen(true); setError(""); }}>{appointment ? "Cobrar" : "Nueva venta"}</Button><Dialog open={open} onClose={() => !busy && setOpen(false)} title={appointment ? `Cobrar a ${appointment.customer.name}` : "Venta de servicios y productos"} description="1. Elige cliente · 2. Agrega servicios y productos · 3. Distribuye el pago" footer={<><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button loading={busy} disabled={!data.cashSession || total <= 0 || lines.some((l) => l.serviceId && !l.staffId)} onClick={() => void pay()}>Registrar cobro · {money(total)}</Button></>}>
    <div className={styles.stack}>
      {!data.cashSession ? <p role="alert" className={styles.notice}>Abre caja desde Caja y ventas antes de cobrar.</p> : null}
      {!appointment ? <><Field label="Buscar cliente"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, teléfono o documento" /></Field><Field label="Cliente"><Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Venta al público</option>{data.customers.filter((c) => c.active && `${c.name} ${c.phone} ${c.dni}`.toLowerCase().includes(search.toLowerCase())).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone ?? c.dni}</option>)}</Select></Field></> : <p>{appointment.service.name} · {appointment.staff.name} · {money(appointment.priceCents)}</p>}
      <div className={styles.grid}><Field label="Agregar servicio"><Select value="" onChange={(e) => { if(e.target.value) setLines([...lines, { key: requestKey(), serviceId: e.target.value, staffId: "", quantity: 1 }]); }}><option value="">Seleccionar servicio</option>{data.services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.priceCents)}</option>)}</Select></Field><Field label="Agregar producto"><Select value="" onChange={(e) => { if(e.target.value) setLines([...lines, { key: requestKey(), productId: e.target.value, staffId: "", quantity: 1 }]); }}><option value="">Seleccionar producto</option>{data.products?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.priceCents)} · Stock {p.stock}</option>)}</Select></Field></div>
      {lines.map((l, index) => { const service = data.services.find((s) => s.id === l.serviceId); return <div key={l.key} className={styles.line}><strong>{service?.name ?? data.products?.find((p) => p.id === l.productId)?.name}</strong><Field label={service ? "Realizado por" : "Vendido por"}><Select value={l.staffId} onChange={(e) => setLines(lines.map((v, i) => i === index ? { ...v, staffId: e.target.value } : v))}><option value="">{service ? "Seleccionar profesional" : "Sin comisión"}</option>{data.staff.filter((s) => s.active && (!service?.staffIds?.length || service.staffIds.includes(s.id))).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Cantidad"><Input type="number" min="1" max="100" value={l.quantity} onChange={(e) => setLines(lines.map((v, i) => i === index ? { ...v, quantity: Number(e.target.value) } : v))} /></Field><Button variant="ghost" onClick={() => setLines(lines.filter((v) => v.key !== l.key))}>Quitar</Button></div>; })}
      <Field label="Promoción"><Select value={promotionId} onChange={(e) => { setPromotionId(e.target.value); setDiscount(""); }}><option value="">Sin promoción</option>{data.promotions?.filter((p) => p.active && (!p.startsAt || new Date(p.startsAt) <= new Date()) && (!p.endsAt || new Date(p.endsAt) >= new Date())).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      {salonCan(data, "barbershop:discounts:write") && !promotionId ? <div className={styles.grid}><Field label="Descuento (S/)"><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field><Field label="Motivo del descuento"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div> : null}
      <div className={styles.total}>Total {money(total)}</div>
      {payments.map((p, i) => <div className={styles.toolbar} key={i}><Field label={`Medio de pago ${i + 1}`}><Select value={p.method} onChange={(e) => setPayments(payments.map((v, n) => n === i ? { ...v, method: e.target.value } : v))}>{(data.paymentMethods ?? ["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"]).map((m) => <option key={m} value={m}>{paymentLabels[m]}</option>)}</Select></Field><Field label={`Importe ${i + 1} (S/)`}><Input type="number" min="0.01" step="0.01" placeholder={payments.length === 1 ? (total / 100).toFixed(2) : "0.00"} value={p.amount} onChange={(e) => setPayments(payments.map((v, n) => n === i ? { ...v, amount: e.target.value } : v))} /></Field>{payments.length > 1 ? <Button variant="ghost" onClick={() => setPayments(payments.filter((_, n) => n !== i))}>Quitar pago</Button> : null}</div>)}
      {payments.length < 6 ? <Button variant="secondary" onClick={() => setPayments([...payments, { method: "YAPE", amount: "" }])}>Combinar otro medio</Button> : null}
      {payments.length > 1 || payments[0].amount ? <p>Pendiente de distribuir: {money(total - paid)}</p> : null}
      {payments.some((p) => p.method === "CASH") ? <Field label="Efectivo recibido (S/) · opcional"><Input type="number" min="0" step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} /></Field> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div>
  </Dialog></>;
}
