"use client";
import { useState } from "react";
import type { BarbershopData, ServiceDto } from "@movendi/contracts";
import { Button, Field, Input, OperationForm, Select } from "@/shared/components/ui";
import { salonCan } from "./salon-ui";
import styles from "./Salon.module.css";

export function ServiceEditor({ data, service }: { data: BarbershopData; service?: ServiceDto }) {
  const [supplies, setSupplies] = useState(service?.supplies ?? []);
  return <OperationForm allowed={salonCan(data, "services:write")} title={service ? "Editar servicio" : "Nuevo servicio"} triggerLabel={service ? "Editar" : "Nuevo servicio"} endpoint={`/api/operations/barbershop/services${service ? `/${service.id}` : ""}`} method={service ? "PATCH" : "POST"} transform={(form) => ({ ...Object.fromEntries(form.entries()), staffIds: form.getAll("staffIds"), supplies, commissionFixedCents: form.get("fixed") ? Math.round(Number(form.get("fixed")) * 100) : null })}>
    <Field label="Nombre"><Input name="name" defaultValue={service?.name} required /></Field><Field label="Categoría"><Input name="category" defaultValue={service?.category ?? ""} /></Field>
    <Field label="Duración (min)"><Input name="durationMinutes" type="number" min="10" max="480" defaultValue={service?.durationMinutes ?? 30} required /></Field><Field label="Precio (S/)"><Input name="price" type="number" min="0.01" step="0.01" defaultValue={service ? service.priceCents / 100 : ""} required /></Field>
    <Field label="Estado"><Select name="active" defaultValue={String(service?.active ?? true)}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field>
    <fieldset><legend>Profesionales habilitados</legend><p className={styles.muted}>Sin selección: todos los profesionales activos.</p><div className={styles.checks}>{data.staff.filter((s) => s.active).map((s) => <label key={s.id}><input type="checkbox" name="staffIds" value={s.id} defaultChecked={service?.staffIds?.includes(s.id)} /> {s.name}</label>)}</div></fieldset>
    <Field label="Comisión del servicio (%) · opcional"><Input name="commissionPct" type="number" min="0" max="100" defaultValue={service?.commissionPct ?? ""} placeholder="Usar comisión del profesional" /></Field>
    <Field label="Comisión fija por unidad (S/) · opcional"><Input name="fixed" type="number" min="0" step="0.01" defaultValue={service?.commissionFixedCents != null ? service.commissionFixedCents / 100 : ""} placeholder="La fija tiene prioridad sobre el porcentaje" /></Field>
    <fieldset><legend>Consumo por servicio</legend><p className={styles.muted}>Se descuenta al cobrar. Registra cada insumo en su unidad de inventario, por ejemplo 0.03 litros.</p>{supplies.map((s, i) => <div className={styles.toolbar} key={i}><Field label="Insumo"><Select value={s.itemId} onChange={(e) => setSupplies(supplies.map((v, n) => n === i ? { ...v, itemId: e.target.value } : v))} required><option value="">Seleccionar insumo</option>{data.stockItems?.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</Select></Field><Field label="Consumo"><Input type="number" min="0.0001" step="0.0001" value={s.quantity} onChange={(e) => setSupplies(supplies.map((v, n) => n === i ? { ...v, quantity: Number(e.target.value) } : v))} required /></Field><Button type="button" variant="ghost" onClick={() => setSupplies(supplies.filter((_, n) => n !== i))}>Quitar</Button></div>)}<Button type="button" variant="secondary" onClick={() => setSupplies([...supplies, { itemId: "", quantity: 1 }])}>Agregar insumo</Button></fieldset>
  </OperationForm>;
}
