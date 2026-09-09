"use client";
import { useState } from "react";
import { Button, Field, Input, OperationForm, Select } from "@/shared/components/ui";
import type { RestaurantData, RestaurantPromotionDto } from "../types";

function localDate(value: string | null | undefined) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function PromotionFields({ data, promotion }: { data: RestaurantData; promotion?: RestaurantPromotionDto }) {
  const [kind, setKind] = useState(promotion?.kind ?? data.configuration.promotions.kinds.find((item) => item.active)?.key ?? "PERCENT");
  const [scope, setScope] = useState(promotion?.scope ?? "ORDER");
  const [automatic, setAutomatic] = useState(promotion?.automatic ?? true);
  const [value, setValue] = useState(String(promotion?.kind === "FIXED" ? promotion.value / 100 : promotion?.value ?? 10));
  const [buy, setBuy] = useState(String(promotion?.buyQuantity ?? 2));
  const [free, setFree] = useState(String(promotion?.freeQuantity ?? 1));
  const summary = kind === "QUANTITY" ? `Lleva ${buy} y paga ${Math.max(0, Number(buy) - Number(free))}` : kind === "PERCENT" ? `${value}% de descuento` : `S/ ${value} de descuento`;
  return <>
    <div className="editor-preview" role="status"><span className="section-kicker">ASÍ FUNCIONARÁ</span><strong>{summary}</strong><small>{automatic ? "Se aplicará automáticamente" : "Se aplicará al ingresar el código"} · {scope === "ORDER" ? "Sobre el pedido" : scope === "CATEGORY" ? "En una categoría" : "En un producto"}</small></div>
    <section className="editor-section"><header><h3>1. Elige el beneficio</h3></header>
      <div className="promotion-presets form-span">{[{ kind:"PERCENT", label:"10% de descuento", value:"10", buy:"2", free:"1" }, {kind:"FIXED",label:"S/ 5 de descuento",value:"5",buy:"2",free:"1"}, {kind:"QUANTITY",label:"2 × 1",value:"1",buy:"2",free:"1"},{kind:"QUANTITY",label:"3 × 2",value:"1",buy:"3",free:"1"}].filter((preset) => data.configuration.promotions.kinds.some((item) => item.active && item.key === preset.kind)).map((preset) => <Button key={preset.label} type="button" variant="secondary" size="sm" onClick={() => { setKind(preset.kind); setValue(preset.value); setBuy(preset.buy); setFree(preset.free); }}>{preset.label}</Button>)}</div>
      <Field label="Nombre comercial"><Input name="name" defaultValue={promotion?.name ?? ""} placeholder="Ej. Almuerzo feliz" required maxLength={120} /></Field>
      <Field label="Tipo de promoción"><Select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>{data.configuration.promotions.kinds.filter((item) => item.active || item.key === promotion?.kind).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
      {kind === "QUANTITY" ? <><input type="hidden" name="value" value="1" /><Field label="Unidades requeridas"><Input name="buyQuantity" type="number" min="2" max="100" value={buy} onChange={(event) => setBuy(event.target.value)} required /></Field><Field label="Unidades gratis"><Input name="freeQuantity" type="number" min="1" max={Math.max(1, Number(buy)-1)} value={free} onChange={(event) => setFree(event.target.value)} required /></Field></> : <><input type="hidden" name="buyQuantity" value="2" /><input type="hidden" name="freeQuantity" value="1" /><Field label={kind === "PERCENT" ? "Descuento (%)" : "Descuento (S/)"}><Input name="value" type="number" min="0.01" max={kind === "PERCENT" ? data.configuration.promotions.maxPercent : 100000} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} required /></Field></>}
      <Field label="Aplicar sobre"><Select name="scope" value={scope} onChange={(event) => setScope(event.target.value)}>{data.configuration.promotions.scopes.filter((item) => item.active || item.key === promotion?.scope).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
      {scope === "CATEGORY" ? <Field label="Categoría"><Select name="categoryId" searchable={false} defaultValue={promotion?.categoryId ?? ""} required><option value="" disabled>Selecciona categoría</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field> : <input type="hidden" name="categoryId" value="" />}
      {scope === "PRODUCT" ? <Field label="Producto"><Select name="productId" searchable={false} defaultValue={promotion?.productId ?? ""} required><option value="" disabled>Selecciona producto</option>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field> : <input type="hidden" name="productId" value="" />}
    </section>
    <section className="editor-section"><header><h3>2. Cómo se activa</h3></header><label className="platform-check form-span"><input name="automatic" type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} /><span><strong>Aplicar automáticamente</strong><small>Desactiva esta opción para usar un cupón.</small></span></label>
      <Field label={automatic ? "Código opcional" : "Código del cupón"}><Input name="code" defaultValue={promotion?.code ?? ""} required={!automatic} minLength={3} maxLength={40} placeholder="ALMUERZO20" /></Field>
      {promotion ? <Field label="Estado"><Select name="active" defaultValue={String(promotion.active)}><option value="true">Activa</option><option value="false">Pausada</option></Select></Field> : null}
    </section>
    <details className="editor-advanced"><summary>Vigencia y condiciones opcionales</summary><div className="editor-section">
      <Field label="Compra mínima (S/)"><Input name="minSubtotal" type="number" min="0" step="0.01" defaultValue={(promotion?.minSubtotalCents ?? 0)/100} /></Field>
      {kind === "PERCENT" ? <Field label="Tope de descuento (S/)"><Input name="maxDiscount" type="number" min="0.01" step="0.01" defaultValue={promotion?.maxDiscountCents ? promotion.maxDiscountCents/100 : ""} /></Field> : <input type="hidden" name="maxDiscount" value="" />}
      <Field label="Inicio"><Input name="startsAt" type="datetime-local" defaultValue={localDate(promotion?.startsAt)} /></Field><Field label="Fin"><Input name="endsAt" type="datetime-local" defaultValue={localDate(promotion?.endsAt)} /></Field>
      <Field label="Desde"><Input name="startTime" type="time" defaultValue={promotion?.startTime ?? ""} /></Field><Field label="Hasta"><Input name="endTime" type="time" defaultValue={promotion?.endTime ?? ""} /></Field>
      <fieldset className="promotion-weekdays form-span"><legend>Días disponibles</legend>{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((day,index) => <label key={day}><input type="checkbox" name="weekdays" value={index} defaultChecked={!promotion || promotion.weekdays.split(",").includes(String(index))} /><span>{day}</span></label>)}</fieldset>
    </div></details>
  </>;
}
export function PromotionEditor({ data, promotion }: { data: RestaurantData; promotion?: RestaurantPromotionDto }) {
  return <OperationForm title={promotion ? `Editar ${promotion.name}` : "Nueva promoción"} description="Elige un beneficio y configura solo lo que necesitas." dialogClassName="restaurant-editor-dialog" endpoint={`/api/operations/restaurant/promotions${promotion ? `/${promotion.id}` : ""}`} method={promotion ? "PATCH" : "POST"} triggerLabel={promotion ? "Editar" : "Nueva promoción"} triggerVariant={promotion ? "secondary" : "primary"} submitLabel={promotion ? "Actualizar" : "Crear promoción"} transform={(form) => ({ ...Object.fromEntries(form), startsAt: form.get("startsAt") ? new Date(String(form.get("startsAt"))).toISOString() : "", endsAt: form.get("endsAt") ? new Date(String(form.get("endsAt"))).toISOString() : "", automatic: form.get("automatic") === "on", weekdays: form.getAll("weekdays").join(",") })}><PromotionFields data={data} promotion={promotion} /></OperationForm>;
}
