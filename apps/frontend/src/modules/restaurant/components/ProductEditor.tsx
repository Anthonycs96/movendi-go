"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Field, Input, OperationForm, Select } from "@/shared/components/ui";
import type { RestaurantData } from "../types";

type Product = RestaurantData["products"][number];
function ProductFields({ data, product }: { data: RestaurantData; product?: Product }) {
  const [type, setType] = useState(product?.productType ?? "FOOD");
  const [routing, setRouting] = useState(product?.areaAssignmentMode ?? "SPECIFIC_AREA");
  return <>
    <section className="editor-section"><header><span className="section-kicker">01 · CARTA</span><h3>Información del producto</h3><p>Así lo verá el equipo al tomar un pedido.</p></header>
      <Field label="Nombre"><Input name="name" defaultValue={product?.name ?? ""} maxLength={140} required /></Field>
      <Field label="Categoría"><Select name="categoryId" searchable={false} defaultValue={product?.category.id ?? ""} required><option value="" disabled>Selecciona categoría</option>{data.categories.filter((item) => item.active || item.id === product?.category.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></Field>
      <div className="form-span"><Field label="Descripción"><textarea className="input" name="description" rows={2} maxLength={400} defaultValue={product?.description ?? ""} placeholder="Ingredientes, tamaño o presentación" /></Field></div>
    </section>
    <section className="editor-section"><header><span className="section-kicker">02 · PRECIO</span><h3>Precio y costo</h3></header>
      <Field label="Precio (S/)"><Input name="price" type="number" min="0" max="100000" step="0.01" defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""} required /></Field>
      <Field label="Costo (S/)" hint="Se usa para calcular el margen."><Input name="cost" type="number" min="0" max="100000" step="0.01" defaultValue={((product?.costCents ?? 0) / 100).toFixed(2)} required={data.configuration.menu.requireCost} /></Field>
      <Field label="Afectación tributaria"><Select name="taxCategory" defaultValue={product?.taxCategory ?? "GRAVADA"}><option value="GRAVADA">Gravada</option><option value="EXONERADA">Exonerada</option><option value="INAFECTA">Inafecta</option></Select></Field>
      {product ? <Field label="Estado"><Select name="active" defaultValue={String(product?.active ?? true)}><option value="true">Activo · disponible en carta</option><option value="false">Inactivo · oculto para nuevos pedidos</option></Select></Field> : null}
    </section>
    <section className="editor-section"><header><span className="section-kicker">03 · PREPARACIÓN</span><h3>Destino del pedido</h3><p>Define quién prepara este producto.</p></header>
      <Field label="Tipo de producto"><Select name="productType" value={type} onChange={(event) => { setType(event.target.value); if (event.target.value !== "ADDON") setRouting("SPECIFIC_AREA"); }}>{data.configuration.menu.productTypes.filter((item) => item.active || item.key === product?.productType).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
      {type === "ADDON" ? <Field label="Asignación de área"><Select name="areaAssignmentMode" value={routing} onChange={(event) => setRouting(event.target.value)}><option value="SPECIFIC_AREA">Categoría o área específica</option><option value="INHERIT_FROM_PRODUCT">Misma área del producto principal</option></Select></Field> : <input type="hidden" name="areaAssignmentMode" value="SPECIFIC_AREA" />}
      {routing !== "INHERIT_FROM_PRODUCT" || type !== "ADDON" ? <Field label="Área específica" hint="Sin cambio, se utiliza el destino configurado en la categoría."><Select name="preparationAreaId" searchable={false} defaultValue={product?.preparationArea?.id ?? ""}><option value="">Usar la ruta de la categoría</option>{data.preparationAreas.filter((area) => area.active || area.id === product?.preparationArea?.id).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</Select></Field> : <input type="hidden" name="preparationAreaId" value="" />}
    </section>
  </>;
}
export function ProductEditor({ data, product, allowed }: { data: RestaurantData; product?: Product; allowed: boolean }) {
  return <OperationForm allowed={allowed} title={product ? "Editar producto" : "Nuevo producto"} description="Organiza la carta, el precio y la preparación en un solo lugar." dialogClassName="restaurant-editor-dialog" endpoint={`/api/operations/restaurant/products${product ? `/${product.id}` : ""}`} method={product ? "PATCH" : "POST"} triggerLabel={product ? "Editar" : "Nuevo producto"} triggerIcon={product ? <Pencil size={15} /> : undefined} triggerVariant={product ? "secondary" : "primary"} submitLabel={product ? "Actualizar" : "Guardar"}><ProductFields data={data} product={product} /></OperationForm>;
}
