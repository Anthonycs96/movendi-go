"use client";
import type { InventoryData, InventoryItemDto } from "@movendi/contracts";
import { Field, Input, OperationForm, Select } from "@/shared/components/ui";

export function PresentationForm({ item }: { item: InventoryItemDto }) {
  return <OperationForm title={`Presentación de compra · ${item.name}`} description={`El inventario se conserva en ${item.unit}. Ingresa la equivalencia del pack o caja.`} endpoint="/api/operations/inventory/presentations" triggerLabel="Presentaciones" triggerVariant="secondary">
    <input type="hidden" name="itemId" value={item.id} />
    <Field label="Nombre de presentación"><Input name="name" placeholder="Pack x 12" required maxLength={80} /></Field>
    <Field label={`Unidades base (${item.unit}) por presentación`}><Input name="factor" type="number" min="0.000001" max="1000000" step="0.000001" defaultValue="12" required /></Field>
    <p className="form-span">{(item.purchasePresentations ?? []).map(p => `${p.name} = ${p.factor} ${item.unit}`).join(" · ") || "La unidad base siempre está disponible."}</p>
  </OperationForm>;
}

export function PublishResaleForm({ item, setup }: { item: InventoryItemDto; setup: NonNullable<InventoryData["menuSetup"]> }) {
  if (item.restaurantProduct) return <small>{item.restaurantProduct.showInMenu ? "Publicado en carta" : "Vinculado · oculto en carta"}</small>;
  return <OperationForm title={`Vender ${item.name}`} description="Usaremos este mismo artículo de inventario. Las compras no publican productos automáticamente." triggerLabel="Publicar en carta" triggerVariant="secondary" endpoint="/api/operations/restaurant/products">
    <input type="hidden" name="stockMode" value="RESALE" /><input type="hidden" name="inventoryItemId" value={item.id} /><input type="hidden" name="cost" value={item.unitCostCents / 100} />
    <Field label="Nombre comercial"><Input name="name" defaultValue={item.name} required /></Field>
    <Field label="Categoría de carta"><Select name="categoryId" required><option value="">Selecciona</option>{setup.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
    <Field label="Precio de venta"><Input name="price" type="number" step="0.01" min="0" required /></Field>
    <Field label="Área de despacho"><Select name="preparationAreaId"><option value="">Usar el área de la categoría</option>{setup.preparationAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
    <Field label="Descripción"><Input name="description" /></Field>
    <Field label="Mostrar en carta"><Select name="showInMenu" defaultValue="true"><option value="true">Sí</option><option value="false">No · guardar para después</option></Select></Field>
  </OperationForm>;
}
