"use client";

import { useState } from "react";
import {
  BadgePercent,
  Banknote,
  CookingPot,
  LayoutGrid,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import type { RestaurantData, RestaurantPromotionDto } from "../types";
import {
  Card,
  DataTable,
  Field,
  Input,
  OperationButton,
  OperationForm,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
} from "@/shared/components/ui";
import { formatCurrencyCents, formatDateTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";
import type { CoreTenantData } from "@movendi/contracts";
import { CoreSettingsWorkspace } from "@/core/tenancy/components/CoreSettingsWorkspace";
import { PrintConfiguration } from "./PrintConfiguration";
import { RestaurantConfigurationCenter } from "./RestaurantConfiguration";

const orderTone: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger" | "violet"
> = {
  DRAFT: "neutral",
  PLACED: "info",
  QUEUED: "warning",
  PREPARING: "warning",
  READY: "success",
  SERVED: "violet",
  COMPLETED: "success",
  CANCELLED: "danger",
};
const orderLabels: Record<string, string> = {
  DRAFT: "Borrador",
  PLACED: "Enviado",
  QUEUED: "En cola",
  PREPARING: "Preparando",
  READY: "Listo",
  SERVED: "Servido",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};
const deliveryLabels: Record<string, string> = {
  PENDING: "Pendiente",
  READY: "Listo para enviar",
  DISPATCHED: "En camino",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};
const paymentMethodLabels: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" };

function CheckoutPaymentFields({ data, totalCents }: { data: RestaurantData; totalCents: number }) {
  const [split, setSplit] = useState(false);
  const [firstAmount, setFirstAmount] = useState((totalCents / 200).toFixed(2));
  const firstCents = Math.max(1, Math.min(totalCents - 1, Math.round((Number(firstAmount) || 0) * 100)));
  const secondAmount = ((totalCents - firstCents) / 100).toFixed(2);
  const defaultMethod = data.paymentMethods.includes("CARD") ? "CARD" : data.paymentMethods[0] ?? "CASH";
  return <>
    {data.configuration.sales.splitPaymentsEnabled ? <label className="platform-check"><input name="split" type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} /><span><strong>Dividir pago</strong><small>El sistema completará el saldo para evitar diferencias.</small></span></label> : null}
    {!split ? <Field label="Medio de pago"><Select name="paymentMethod" defaultValue={defaultMethod}>{data.paymentMethods.map((method) => <option value={method} key={method}>{paymentMethodLabels[method] ?? method}</option>)}</Select></Field> : <div className="split-payment-editor"><Field label="Primer medio"><Select name="paymentMethod1" defaultValue={data.paymentMethods[0]}>{data.paymentMethods.map((method) => <option value={method} key={method}>{paymentMethodLabels[method] ?? method}</option>)}</Select></Field><Field label="Monto"><Input name="amount1" type="number" min="0.01" max={((totalCents - 1) / 100).toFixed(2)} step="0.01" value={firstAmount} onChange={(event) => setFirstAmount(event.target.value)} required /></Field><Field label="Segundo medio"><Select name="paymentMethod2" defaultValue={data.paymentMethods.find((method) => method !== data.paymentMethods[0]) ?? data.paymentMethods[0]}>{data.paymentMethods.map((method) => <option value={method} key={method}>{paymentMethodLabels[method] ?? method}</option>)}</Select></Field><Field label="Saldo exacto"><Input name="amount2" value={secondAmount} readOnly /></Field></div>}
  </>;
}

const checkoutPayload = (form: FormData) => form.get("split") === "on" ? { payments: [{ method: form.get("paymentMethod1"), amount: form.get("amount1") }, { method: form.get("paymentMethod2"), amount: form.get("amount2") }] } : { paymentMethod: form.get("paymentMethod") };

const activeSelect = (active: boolean) => (
  <Select name="active" defaultValue={String(active)}>
    <option value="true">Activo</option>
    <option value="false">Inactivo</option>
  </Select>
);

const weekdayOptions = [
  ["1", "Lun"],
  ["2", "Mar"],
  ["3", "Mié"],
  ["4", "Jue"],
  ["5", "Vie"],
  ["6", "Sáb"],
  ["0", "Dom"],
];
const promotionPayload = (form: FormData) => ({
  name: form.get("name"),
  code: form.get("code"),
  kind: form.get("kind"),
  value: form.get("value"),
  buyQuantity: form.get("buyQuantity"),
  freeQuantity: form.get("freeQuantity"),
  scope: form.get("scope"),
  categoryId: form.get("categoryId"),
  productId: form.get("productId"),
  minSubtotal: form.get("minSubtotal"),
  maxDiscount: form.get("maxDiscount"),
  automatic: form.get("automatic") === "on",
  weekdays: form.getAll("weekdays").join(","),
  startTime: form.get("startTime"),
  endTime: form.get("endTime"),
  startsAt: form.get("startsAt"),
  endsAt: form.get("endsAt"),
  ...(form.has("active") ? { active: form.get("active") } : {}),
});

function PromotionForm({
  data,
  promotion,
}: {
  data: RestaurantData;
  promotion?: RestaurantPromotionDto;
}) {
  const fixedValue =
    promotion?.kind === "FIXED" ? promotion.value / 100 : promotion?.value;
  return (
    <OperationForm
      title={promotion ? `Editar ${promotion.name}` : "Nueva promoción"}
      description="Configura el beneficio sin modificar el precio original de los productos."
      endpoint={`/api/operations/restaurant/promotions${promotion ? `/${promotion.id}` : ""}`}
      method={promotion ? "PATCH" : "POST"}
      triggerLabel={promotion ? "Editar" : "Nueva promoción"}
      submitLabel={promotion ? "Actualizar" : "Crear promoción"}
      transform={promotionPayload}
    >
      <Field label="Nombre comercial">
        <Input
          name="name"
          defaultValue={promotion?.name ?? ""}
          placeholder="Ej. Almuerzo feliz"
          required
        />
      </Field>
      <Field
        label="Código opcional"
        hint="Déjalo vacío para promociones automáticas."
      >
        <Input
          name="code"
          defaultValue={promotion?.code ?? ""}
          placeholder="ALMUERZO20"
        />
      </Field>
      <Field label="Tipo de promoción">
        <Select name="kind" defaultValue={promotion?.kind ?? data.configuration.promotions.kinds.find((item) => item.active)?.key}>
          {data.configuration.promotions.kinds.filter((item) => item.active).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
        </Select>
      </Field>
      <Field
        label="Porcentaje o monto"
        hint="Se ignora al elegir promoción por cantidad."
      >
        <Input
          name="value"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={fixedValue ?? 10}
          required
        />
      </Field>
      <Field
        label="Unidades requeridas"
        hint="Ejemplo: escribe 2 para una promoción 2×1."
      >
        <Input
          name="buyQuantity"
          type="number"
          min="2"
          max="100"
          step="1"
          defaultValue={promotion?.buyQuantity ?? 2}
          required
        />
      </Field>
      <Field
        label="Unidades gratis"
        hint="2 requeridas y 1 gratis = 2×1. 3 requeridas y 1 gratis = 3×2."
      >
        <Input
          name="freeQuantity"
          type="number"
          min="1"
          max="99"
          step="1"
          defaultValue={promotion?.freeQuantity ?? 1}
          required
        />
      </Field>
      <Field label="Aplicar sobre">
        <Select name="scope" defaultValue={promotion?.scope ?? data.configuration.promotions.scopes.find((item) => item.active)?.key}>
          {data.configuration.promotions.scopes.filter((item) => item.active).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Categoría" hint="Solo se usa si elegiste categoría.">
        <Select name="categoryId" defaultValue={promotion?.categoryId ?? ""}>
          <option value="">No aplica</option>
          {data.categories
            .filter((item) => item.active)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Producto" hint="Solo se usa si elegiste producto.">
        <Select name="productId" defaultValue={promotion?.productId ?? ""}>
          <option value="">No aplica</option>
          {data.products
            .filter((item) => item.active)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Compra mínima (S/)">
        <Input
          name="minSubtotal"
          type="number"
          min="0"
          step="0.01"
          defaultValue={promotion ? promotion.minSubtotalCents / 100 : 0}
        />
      </Field>
      <Field
        label="Tope de descuento (S/)"
        hint="Opcional para descuentos porcentuales."
      >
        <Input
          name="maxDiscount"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={
            promotion?.maxDiscountCents ? promotion.maxDiscountCents / 100 : ""
          }
        />
      </Field>
      <Field label="Inicio">
        <Input
          name="startsAt"
          type="datetime-local"
          defaultValue={promotion?.startsAt?.slice(0, 16) ?? ""}
        />
      </Field>
      <Field label="Fin">
        <Input
          name="endsAt"
          type="datetime-local"
          defaultValue={promotion?.endsAt?.slice(0, 16) ?? ""}
        />
      </Field>
      <Field label="Desde">
        <Input
          name="startTime"
          type="time"
          defaultValue={promotion?.startTime ?? ""}
        />
      </Field>
      <Field label="Hasta">
        <Input
          name="endTime"
          type="time"
          defaultValue={promotion?.endTime ?? ""}
        />
      </Field>
      <fieldset className="promotion-weekdays form-span">
        <legend>Días disponibles</legend>
        {weekdayOptions.map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              name="weekdays"
              value={value}
              defaultChecked={
                !promotion || promotion.weekdays.split(",").includes(value)
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="platform-check form-span">
        <input
          name="automatic"
          type="checkbox"
          defaultChecked={promotion?.automatic ?? true}
        />
        <span>
          <strong>Aplicar automáticamente</strong>
          <small>
            Si se desactiva, el cliente o mozo deberá ingresar el código.
          </small>
        </span>
      </label>
      {promotion ? (
        <Field label="Estado">{activeSelect(promotion.active)}</Field>
      ) : null}
    </OperationForm>
  );
}

export function RestaurantDirectory({
  section,
  data,
  core,
  platformAdmin = false,
}: {
  section:
    | "menu"
    | "promotions"
    | "orders"
    | "clients"
    | "checkout"
    | "settings";
  data: RestaurantData;
  core: CoreTenantData;
  platformAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const locale = core.tenant.locale;
  const money = (value: number) => formatCurrencyCents(value, core.tenant.currency, locale);
  const actor = core.users.find((user) => user.id === core.currentActorId);
  const actorRole = core.roles.find((role) => role.id === actor?.roleId);
  const canApproveCash = Boolean(actorRole?.permissions.includes("*") || actorRole?.permissions.includes("restaurant:cash:approve"));

  if (section === "menu") {
    const rows = data.products.filter((item) =>
      `${item.name} ${item.category.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    const activeCategories = data.categories.filter((item) => item.active);
    return (
      <>
        <PageHeader
          eyebrow="Catálogo"
          title="Carta y productos"
          description="Categorías, platos, bebidas, precios y destino de preparación."
          actions={
            <div className="header-actions">
              <OperationForm
                title="Nueva categoría"
                endpoint="/api/operations/restaurant/categories"
                triggerLabel="Categoría"
              >
                <Field label="Nombre">
                  <Input name="name" required placeholder="Ej. Postres" />
                </Field>
              </OperationForm>
              <OperationForm
                title="Nuevo producto"
                endpoint="/api/operations/restaurant/products"
                triggerLabel="Nuevo producto"
              >
                <Field label="Nombre">
                  <Input name="name" required />
                </Field>
                <Field label="Categoría">
                  <Select name="categoryId" required defaultValue="">
                    <option value="" disabled>
                      Selecciona categoría
                    </option>
                    {activeCategories.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Descripción">
                  <Input name="description" />
                </Field>
                <Field label="Precio (S/)">
                  <Input
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                  />
                </Field>
                <Field label="Costo (S/)">
                  <Input
                    name="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0"
                  />
                </Field>
                <Field label="Tipo de producto">
                  <Select name="productType" defaultValue="FOOD"><option value="FOOD">Producto principal</option><option value="ADDON">Adicional</option><option value="BEVERAGE">Bebida</option><option value="OTHER">Otro</option></Select>
                </Field>
                <Field label="Asignación de área">
                  <Select name="areaAssignmentMode" defaultValue="SPECIFIC_AREA"><option value="SPECIFIC_AREA">Usar área específica o ruta de categoría</option><option value="INHERIT_FROM_PRODUCT">Adicional: heredar del producto base</option></Select>
                </Field>
                <Field label="Área específica">
                  <Select name="preparationAreaId" defaultValue="">
                    <option value="">Usar la ruta de la categoría</option>
                    {data.preparationAreas.filter((area) => area.active).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}
                  </Select>
                </Field>
              </OperationForm>
            </div>
          }
        />
        <section className="management-grid menu-management">
          <Card className="table-card">
            <div className="management-heading">
              <div>
                <span className="section-kicker">Organización</span>
                <h2>Categorías</h2>
              </div>
              <span className="results-count">{data.categories.length}</span>
            </div>
            <DataTable
              rows={data.categories}
              pageSize={6}
              rowKey={(row) => row.id}
              columns={[
                { key: "name", header: "Categoría", cell: (row) => row.name },
                {
                  key: "status",
                  header: "Estado",
                  cell: (row) => (
                    <StatusBadge tone={row.active ? "success" : "neutral"}>
                      {row.active ? "Activa" : "Inactiva"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  header: "Acciones",
                  cell: (row) => (
                    <OperationForm
                      title="Editar categoría"
                      endpoint={`/api/operations/restaurant/categories/${row.id}`}
                      method="PATCH"
                      triggerLabel="Editar"
                      submitLabel="Actualizar"
                    >
                      <Field label="Nombre">
                        <Input name="name" required defaultValue={row.name} />
                      </Field>
                      <Field label="Estado">{activeSelect(row.active)}</Field>
                    </OperationForm>
                  ),
                },
              ]}
            />
          </Card>
          <Card className="table-card">
            <div className="filters">
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery("")}
                placeholder="Buscar en la carta"
              />
              <span className="filter-spacer" />
              <span className="results-count">{rows.length} productos</span>
            </div>
            <DataTable
              rows={rows}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "product",
                  header: "Producto",
                  sortValue: (row) => row.name,
                  cell: (row) => (
                    <div className="menu-cell">
                      <div className="activity-icon">
                        <UtensilsCrossed size={16} />
                      </div>
                      <div>
                        <strong>{row.name}</strong>
                        <small>{row.description ?? "Sin descripción"}</small>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "category",
                  header: "Categoría",
                  sortValue: (row) => row.category.name,
                  cell: (row) => row.category.name,
                },
                {
                  key: "area",
                  header: "Preparación",
                  cell: (row) => (
                    <StatusBadge tone="violet">{row.preparationArea?.name ?? data.categories.find((category) => category.id === row.category.id)?.preparationArea?.name ?? "Ruta general"}</StatusBadge>
                  ),
                },
                {
                  key: "price",
                  header: "Precio",
                  cell: (row) => money(row.priceCents),
                },
                {
                  key: "status",
                  header: "Estado",
                  cell: (row) => (
                    <StatusBadge tone={row.active ? "success" : "neutral"}>
                      {row.active ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  header: "Acciones",
                  cell: (row) => (
                    <OperationForm
                      title="Editar producto"
                      endpoint={`/api/operations/restaurant/products/${row.id}`}
                      method="PATCH"
                      triggerLabel="Editar"
                      submitLabel="Actualizar"
                    >
                      <Field label="Nombre">
                        <Input name="name" required defaultValue={row.name} />
                      </Field>
                      <Field label="Categoría">
                        <Select
                          name="categoryId"
                          required
                          defaultValue={row.category.id}
                        >
                          {activeCategories.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Descripción">
                        <Input
                          name="description"
                          defaultValue={row.description ?? ""}
                        />
                      </Field>
                      <Field label="Precio (S/)">
                        <Input
                          name="price"
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          defaultValue={(row.priceCents / 100).toFixed(2)}
                        />
                      </Field>
                      <Field label="Costo (S/)">
                        <Input
                          name="cost"
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          defaultValue={(row.costCents / 100).toFixed(2)}
                        />
                      </Field>
                      <Field label="Tipo de producto">
                        <Select name="productType" defaultValue={row.productType}><option value="FOOD">Producto principal</option><option value="ADDON">Adicional</option><option value="BEVERAGE">Bebida</option><option value="OTHER">Otro</option></Select>
                      </Field>
                      <Field label="Asignación de área">
                        <Select name="areaAssignmentMode" defaultValue={row.areaAssignmentMode}><option value="SPECIFIC_AREA">Usar área específica o ruta de categoría</option><option value="INHERIT_FROM_PRODUCT">Adicional: heredar del producto base</option></Select>
                      </Field>
                      <Field label="Área específica">
                        <Select
                          name="preparationAreaId"
                          defaultValue={row.preparationArea?.id ?? ""}
                        >
                          <option value="">Usar la ruta de la categoría</option>
                          {data.preparationAreas.filter((area) => area.active).map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Estado">{activeSelect(row.active)}</Field>
                    </OperationForm>
                  ),
                },
              ]}
            />
          </Card>
        </section>
      </>
    );
  }

  if (section === "promotions") {
    const active = data.promotions.filter((item) => item.active).length;
    return (
      <>
        <PageHeader
          eyebrow="Ventas"
          title="Promociones y descuentos"
          description="Campañas automáticas o con código, vigentes por sede, fecha y horario."
          icon={BadgePercent}
          actions={<PromotionForm data={data} />}
        />
        <section className="stats-grid stats-grid--three">
          <StatCard
            label="Promociones"
            value={String(data.promotions.length)}
            detail="Configuradas en esta sede"
            icon={BadgePercent}
          />
          <StatCard
            label="Activas"
            value={String(active)}
            detail="Disponibles según vigencia"
            icon={BadgePercent}
            tone="emerald"
          />
          <StatCard
            label="Con código"
            value={String(data.promotions.filter((item) => item.code).length)}
            detail="Aplicación manual"
            icon={ReceiptText}
            tone="amber"
          />
        </section>
        <Card className="table-card">
          <DataTable
            rows={data.promotions}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                header: "Promoción",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.name}</strong>
                    <span>
                      {row.code ? `Código: ${row.code}` : "Automática"}
                    </span>
                  </span>
                ),
              },
              {
                key: "benefit",
                header: "Beneficio",
                cell: (row) =>
                  row.kind === "QUANTITY"
                    ? `${row.buyQuantity}×${row.buyQuantity - row.freeQuantity}`
                    : row.kind === "PERCENT"
                      ? `${row.value}%`
                      : money(row.value),
              },
              {
                key: "scope",
                header: "Alcance",
                cell: (row) => (
                  <StatusBadge tone="info">
                    {row.scope === "ORDER"
                      ? "Pedido"
                      : row.scope === "CATEGORY"
                        ? "Categoría"
                        : "Producto"}
                  </StatusBadge>
                ),
              },
              {
                key: "dates",
                header: "Vigencia",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>
                      {row.startsAt
                        ? formatDateTime(row.startsAt)
                        : "Desde ahora"}
                    </strong>
                    <span>
                      {row.endsAt
                        ? `Hasta ${formatDateTime(row.endsAt)}`
                        : "Sin fecha final"}
                    </span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Activa" : "Inactiva"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                cell: (row) => <PromotionForm data={data} promotion={row} />,
              },
            ]}
          />
        </Card>
      </>
    );
  }

  if (section === "orders") {
    const rows = data.orders.filter((item) =>
      `${item.code} ${item.table?.name ?? ""} ${item.customer?.name ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    const availableTables = data.tables.filter(
      (item) => item.active && item.status === "AVAILABLE",
    );
    return (
      <>
        <PageHeader
          eyebrow="Operación"
          title="Pedidos"
          description="Detalle, estado, mesa y total de cada atención."
        />
        <Card className="table-card">
          <div className="filters">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              placeholder="Buscar pedido o mesa"
            />
            <span className="filter-spacer" />
            <span className="results-count">{rows.length} pedidos</span>
          </div>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "order",
                header: "Pedido",
                sortValue: (row) => new Date(row.createdAt),
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.code}</strong>
                    <span>{formatDateTime(row.createdAt)}</span>
                  </span>
                ),
              },
              {
                key: "table",
                header: "Atención",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>
                      {row.table?.name ??
                        (row.source === "DELIVERY"
                          ? "Delivery"
                          : "Para llevar")}
                    </strong>
                    <span>
                      {row.customer?.name ?? "Sin cliente"}
                      {row.source === "DELIVERY" && row.deliveryAddress
                        ? ` · ${row.deliveryAddress}`
                        : ""}
                    </span>
                  </span>
                ),
              },
              {
                key: "waiter",
                header: "Atendió",
                cell: (row) => row.waiter.name,
              },
              {
                key: "items",
                header: "Detalle",
                cell: (row) =>
                  row.items
                    .map((item) => `${item.quantity}× ${item.name}`)
                    .join(", "),
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={orderTone[row.status] ?? "neutral"}>
                    {orderLabels[row.status] ?? row.status}
                  </StatusBadge>
                ),
              },
              {
                key: "delivery",
                header: "Entrega",
                cell: (row) =>
                  row.source === "DELIVERY" ? (
                    <StatusBadge
                      tone={
                        row.deliveryStatus === "DELIVERED"
                          ? "success"
                          : row.deliveryStatus === "DISPATCHED"
                            ? "info"
                            : "warning"
                      }
                    >
                      {deliveryLabels[row.deliveryStatus ?? "PENDING"]}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">
                      {row.source === "TAKEAWAY" ? "Para llevar" : "Salón"}
                    </StatusBadge>
                  ),
              },
              {
                key: "total",
                header: "Total",
                align: "right",
                cell: (row) => money(row.totalCents),
              },
              {
                key: "actions",
                header: "Acciones",
                cell: (row) => (
                  <div className="table-actions">
                    {!row.paid &&
                    !["CANCELLED", "COMPLETED"].includes(row.status) &&
                    availableTables.length ? (
                      <OperationForm
                        title="Trasladar pedido"
                        description="La mesa actual quedará disponible."
                        endpoint={`/api/operations/restaurant/orders/${row.id}/transfer`}
                        method="PATCH"
                        triggerLabel="Trasladar"
                        submitLabel="Mover pedido"
                      >
                        <Field label="Mesa destino">
                          <Select name="tableId" required defaultValue="">
                            <option value="" disabled>
                              Selecciona una mesa disponible
                            </option>
                            {availableTables.map((table) => (
                              <option key={table.id} value={table.id}>
                                {table.name} · {table.area.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </OperationForm>
                    ) : null}
                    {!row.paid &&
                    !["CANCELLED", "COMPLETED"].includes(row.status) ? (
                      <OperationForm
                        title={`Cobrar ${row.code}`}
                        description={`Total: ${money(row.totalCents)}`}
                        endpoint={`/api/operations/restaurant/orders/${row.id}/checkout`}
                        triggerLabel="Cobrar"
                        submitLabel="Confirmar cobro"
                        transform={checkoutPayload}
                      >
                        <CheckoutPaymentFields data={data} totalCents={row.totalCents} />
                      </OperationForm>
                    ) : null}
                    {!row.paid &&
                    !["CANCELLED", "COMPLETED"].includes(row.status) ? (
                      <OperationForm
                        title={`Cancelar ${row.code}`}
                        description="La cancelación cerrará el pedido y liberará la mesa."
                        endpoint={`/api/operations/restaurant/orders/${row.id}/status`}
                        method="PATCH"
                        triggerLabel="Cancelar"
                        submitLabel="Confirmar cancelación"
                        transform={(form) => ({ status: "CANCELLED", reason: String(form.get("reason") ?? "") })}
                      >
                        <Field label="Motivo"><Select name="reason" required={data.configuration.orders.requireCancellationReason} defaultValue=""><option value="">Selecciona un motivo</option>{data.configuration.orders.cancellationReasons.filter((reason) => reason.active).map((reason) => <option key={reason.key} value={reason.label}>{reason.label}</option>)}</Select></Field>
                      </OperationForm>
                    ) : null}
                    {row.source === "DELIVERY" &&
                    row.deliveryStatus === "READY" ? (
                      <OperationButton
                        endpoint={`/api/operations/restaurant/orders/${row.id}/delivery-status`}
                        body={{ status: "DISPATCHED" }}
                        variant="primary"
                      >
                        Enviar delivery
                      </OperationButton>
                    ) : null}
                    {row.source === "DELIVERY" &&
                    row.deliveryStatus === "DISPATCHED" ? (
                      <OperationButton
                        endpoint={`/api/operations/restaurant/orders/${row.id}/delivery-status`}
                        body={{ status: "DELIVERED" }}
                        variant="primary"
                      >
                        Marcar entregado
                      </OperationButton>
                    ) : null}
                    {row.paid ||
                    ["CANCELLED", "COMPLETED"].includes(row.status) ? (
                      <StatusBadge tone={row.paid ? "success" : "neutral"}>
                        {row.paid ? "Pagado" : "Cerrado"}
                      </StatusBadge>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </>
    );
  }

  if (section === "clients") {
    const rows = data.customers.filter((item) =>
      `${item.name} ${item.dni ?? ""} ${item.phone ?? ""} ${item.email ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    return (
      <>
        <PageHeader
          eyebrow="CRM"
          title="Clientes"
          description="Contactos y preferencias del restaurante, aislados por empresa."
          actions={
            <OperationForm
              title="Nuevo cliente"
              endpoint="/api/operations/restaurant/customers"
              triggerLabel="Nuevo cliente"
            >
              <Field label="Nombre">
                <Input name="name" required />
              </Field>
              <Field label="Tipo de documento"><Select name="documentType" defaultValue={data.configuration.customers.documentTypes.find((item) => item.active)?.key}>{data.configuration.customers.documentTypes.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
              <Field label="Documento"><Input name="dni" maxLength={20} required={data.configuration.customers.requireDocument} /></Field>
              <Field label="Segmento"><Select name="segment" defaultValue={data.configuration.customers.segments.find((item) => item.active)?.key}>{data.configuration.customers.segments.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
              <Field label="Celular">
                <Input name="phone" />
              </Field>
              <Field label="Correo">
                <Input name="email" type="email" />
              </Field>
              <Field label="Preferencias">
                <Input
                  name="notes"
                  placeholder="Mesa, alergias u observaciones"
                />
              </Field>
            </OperationForm>
          }
        />
        <Card className="table-card">
          <div className="filters">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              placeholder="Buscar por nombre o documento"
            />
            <span className="filter-spacer" />
            <span className="results-count">{rows.length} clientes</span>
          </div>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Cliente", cell: (row) => row.name },
              { key: "dni", header: "Documento", cell: (row) => row.dni ? `${row.documentType ?? "DOC"} ${row.dni}` : "—" },
              { key: "segment", header: "Segmento", cell: (row) => row.segment ? data.configuration.customers.segments.find((item) => item.key === row.segment)?.label ?? row.segment : "—" },
              { key: "points", header: "Puntos", cell: (row) => data.configuration.customers.loyaltyEnabled ? row.loyaltyPoints : "—" },
              {
                key: "phone",
                header: "Celular",
                cell: (row) => row.phone ?? "—",
              },
              {
                key: "email",
                header: "Correo",
                cell: (row) => row.email ?? "—",
              },
              {
                key: "notes",
                header: "Preferencias",
                cell: (row) => row.notes ?? "Sin notas",
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Activo" : "Inactivo"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                cell: (row) => (
                  <OperationForm
                    title="Editar cliente"
                    endpoint={`/api/operations/restaurant/customers/${row.id}`}
                    method="PATCH"
                    triggerLabel="Editar"
                    submitLabel="Actualizar"
                  >
                    <Field label="Nombre">
                      <Input name="name" required defaultValue={row.name} />
                    </Field>
                    <Field label="Tipo de documento"><Select name="documentType" defaultValue={row.documentType ?? data.configuration.customers.documentTypes.find((item) => item.active)?.key}>{data.configuration.customers.documentTypes.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
                    <Field label="Documento"><Input name="dni" maxLength={20} required={data.configuration.customers.requireDocument} defaultValue={row.dni ?? ""} /></Field>
                    <Field label="Segmento"><Select name="segment" defaultValue={row.segment ?? data.configuration.customers.segments.find((item) => item.active)?.key}>{data.configuration.customers.segments.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
                    <Field label="Celular">
                      <Input name="phone" defaultValue={row.phone ?? ""} />
                    </Field>
                    <Field label="Correo">
                      <Input
                        name="email"
                        type="email"
                        defaultValue={row.email ?? ""}
                      />
                    </Field>
                    <Field label="Preferencias">
                      <Input name="notes" defaultValue={row.notes ?? ""} />
                    </Field>
                    <Field label="Estado">{activeSelect(row.active)}</Field>
                  </OperationForm>
                ),
              },
            ]}
          />
        </Card>
      </>
    );
  }

  if (section === "checkout") {
    return (
      <>
        <PageHeader
          eyebrow="Comercio"
          title="Caja y ventas"
          description="Cobros vinculados a pedidos y sesión de caja de la sucursal."
          actions={
            !data.cashSession ? (
              <OperationForm
                title="Abrir caja"
                endpoint="/api/operations/restaurant/cash"
                triggerLabel="Abrir caja"
              >
                <Field label="Monto inicial (S/)">
                  <Input
                    name="openingAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </Field>
              </OperationForm>
            ) : (
              <div className="header-actions">
                <div className="live-chip">
                  <span />
                  Caja abierta
                </div>
                <OperationForm
                  title="Cerrar caja"
                  description="Ingresa el efectivo y equivalentes contabilizados."
                  endpoint={`/api/operations/restaurant/cash/${data.cashSession.id}/close`}
                  triggerLabel="Cerrar caja"
                  submitLabel="Confirmar cierre"
                >
                  <Field label="Monto contado (S/)">
                    <Input
                      name="countedAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={(
                        data.cashSession.expectedCents / 100
                      ).toFixed(2)}
                    />
                  </Field>
                </OperationForm>
                <OperationForm title="Ingreso de efectivo" description="Registra fondos adicionales con motivo obligatorio." endpoint={`/api/operations/restaurant/cash/${data.cashSession.id}/movement`} triggerLabel="Ingreso"><input type="hidden" name="type" value="IN" /><Field label="Monto (S/)"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="Motivo"><Input name="reason" minLength={3} required /></Field></OperationForm>
                {canApproveCash ? <OperationForm title="Retiro de efectivo" description="Registra una salida de caja con trazabilidad." endpoint={`/api/operations/restaurant/cash/${data.cashSession.id}/movement`} triggerLabel="Retiro"><input type="hidden" name="type" value="OUT" /><Field label="Monto (S/)"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="Motivo"><Input name="reason" minLength={3} required /></Field></OperationForm> : null}
              </div>
            )
          }
        />
        <section className="stats-grid stats-grid--three">
          <StatCard
            label="Caja esperada"
            value={money(data.cashSession?.expectedCents ?? 0)}
            detail={data.cashSession ? "Sesión activa" : "Sin caja abierta"}
            icon={Banknote}
            tone="emerald"
          />
          <StatCard
            label="Ventas"
            value={String(data.sales.length)}
            detail="Movimientos persistidos"
            icon={ReceiptText}
            tone="blue"
          />
          <StatCard
            label="Pedidos por cobrar"
            value={String(
              data.orders.filter(
                (item) =>
                  !item.paid &&
                  !["COMPLETED", "CANCELLED"].includes(item.status),
              ).length,
            )}
            detail="Atenciones activas"
            icon={CookingPot}
            tone="amber"
          />
        </section>
        {data.cashSession?.movements.length ? <Card className="panel"><div className="panel__header"><div><span className="section-kicker">Auditoría de caja</span><h2>Ingresos y retiros</h2></div></div><div className="cash-movement-list">{data.cashSession.movements.map((movement) => <article key={movement.id}><StatusBadge tone={movement.type === "IN" ? "success" : "warning"}>{movement.type === "IN" ? "Ingreso" : "Retiro"}</StatusBadge><span><strong>{movement.reason}</strong><small>{movement.createdBy} · {formatDateTime(movement.createdAt)}</small></span><b>{movement.type === "IN" ? "+" : "−"}{money(movement.amountCents)}</b></article>)}</div></Card> : null}
        <Card className="table-card">
          <DataTable
            rows={data.sales}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "code",
                header: "Venta",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.code}</strong>
                    <span>{formatDateTime(row.createdAt)}</span>
                  </span>
                ),
              },
              {
                key: "order",
                header: "Pedido",
                cell: (row) => row.orderCode ?? "—",
              },
              {
                key: "staff",
                header: "Responsables",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>
                      Cobró: {row.cashier?.name ?? "Sin identificar"}
                    </strong>
                    <span>
                      Atendió: {row.waiter?.name ?? "Sin identificar"}
                    </span>
                  </span>
                ),
              },
              {
                key: "method",
                header: "Medio de pago",
                cell: (row) => (
                  <span className="table-primary"><StatusBadge tone="info">{row.payments.length > 1 ? "Pago dividido" : localizeCode(row.paymentMethod, locale)}</StatusBadge>{row.payments.length > 1 ? <span>{row.payments.map((payment) => `${paymentMethodLabels[payment.method] ?? payment.method}: ${money(payment.amountCents)}`).join(" · ")}</span> : null}</span>
                ),
              },
              {
                key: "total",
                header: "Total",
                align: "right",
                cell: (row) => money(row.totalCents),
              },
              ...(data.configuration.integrations.sunatEnabled ? [{
                key: "sunat",
                header: "Comprobante electrónico",
                cell: (row: RestaurantData["sales"][number]) => row.electronicDocument?.status === "ISSUED" ? <span className="table-primary"><StatusBadge tone="success">{row.electronicDocument.kind} {row.electronicDocument.series}-{row.electronicDocument.number}</StatusBadge>{row.electronicDocument.pdfUrl ? <a href={row.electronicDocument.pdfUrl} target="_blank" rel="noreferrer">Ver PDF</a> : null}</span> : <div className="table-actions"><OperationButton endpoint={`/api/operations/restaurant/sales/${row.id}/electronic-document`} method="POST" body={{ kind: row.electronicDocument?.kind ?? "BOLETA" }}>{row.electronicDocument ? "Reintentar" : "Boleta"}</OperationButton>{!row.electronicDocument ? <OperationButton endpoint={`/api/operations/restaurant/sales/${row.id}/electronic-document`} method="POST" body={{ kind: "FACTURA" }}>Factura</OperationButton> : null}{row.electronicDocument?.lastError ? <small className="form-error">{row.electronicDocument.lastError}</small> : null}</div>,
              }] : []),
            ]}
          />
        </Card>
      </>
    );
  }

  const activeAreas = data.areas.filter((item) => item.active);
  return (
    <>
      <CoreSettingsWorkspace
        core={core}
        platformAdmin={platformAdmin}
        title="Salones y configuración general"
        description={`${core.tenant.name}: operación del local, sucursales y accesos.`}
        extraActions={
          <>
            <OperationForm
              title="Nuevo ambiente"
              endpoint="/api/operations/restaurant/areas"
              triggerLabel="Ambiente"
            >
              <Field label="Nombre">
                <Input name="name" required placeholder="Ej. Terraza" />
              </Field>
            </OperationForm>
            <OperationForm
              title="Nueva mesa"
              endpoint="/api/operations/restaurant/tables"
              triggerLabel="Mesa"
            >
              <Field label="Nombre">
                <Input name="name" required placeholder="Mesa 5" />
              </Field>
              <Field label="Personas">
                <Input
                  name="seats"
                  type="number"
                  min="1"
                  defaultValue="4"
                  required
                />
              </Field>
              <Field label="Ambiente">
                <Select name="areaId" required defaultValue="">
                  <option value="" disabled>
                    Selecciona ambiente
                  </option>
                  {activeAreas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </OperationForm>
          </>
        }
        extraCards={
          <Card className="settings-card">
            <LayoutGrid size={21} />
            <div>
              <h3>{data.tables.length} mesas</h3>
              <p>Distribuidas en {data.areas.length} ambientes.</p>
            </div>
            <StatusBadge tone="success">Operativas</StatusBadge>
          </Card>
        }
      />
      <RestaurantConfigurationCenter initialConfiguration={data.configuration} />
      <PrintConfiguration data={data} />
      <section className="management-grid restaurant-management">
        <Card className="table-card">
          <div className="management-heading">
            <div>
              <span className="section-kicker">Salón</span>
              <h2>Ambientes</h2>
            </div>
          </div>
          <DataTable
            rows={data.areas}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Ambiente", cell: (row) => row.name },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Activo" : "Inactivo"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                cell: (row) => (
                  <OperationForm
                    title="Editar ambiente"
                    endpoint={`/api/operations/restaurant/areas/${row.id}`}
                    method="PATCH"
                    triggerLabel="Editar"
                    submitLabel="Actualizar"
                  >
                    <Field label="Nombre">
                      <Input name="name" required defaultValue={row.name} />
                    </Field>
                    <Field label="Estado">{activeSelect(row.active)}</Field>
                  </OperationForm>
                ),
              },
            ]}
          />
        </Card>
        <Card className="table-card">
          <div className="management-heading">
            <div>
              <span className="section-kicker">Capacidad</span>
              <h2>Mesas</h2>
            </div>
          </div>
          <DataTable
            rows={data.tables}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                header: "Mesa",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.name}</strong>
                    <span>{row.area.name}</span>
                  </span>
                ),
              },
              { key: "seats", header: "Personas", cell: (row) => row.seats },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? localizeCode(row.status, locale) : "Inactiva"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                cell: (row) => (
                  <OperationForm
                    title="Editar mesa"
                    endpoint={`/api/operations/restaurant/tables/${row.id}`}
                    method="PATCH"
                    triggerLabel="Editar"
                    submitLabel="Actualizar"
                  >
                    <Field label="Nombre">
                      <Input name="name" required defaultValue={row.name} />
                    </Field>
                    <Field label="Personas">
                      <Input
                        name="seats"
                        type="number"
                        min="1"
                        max="50"
                        required
                        defaultValue={row.seats}
                      />
                    </Field>
                    <Field label="Ambiente">
                      <Select name="areaId" required defaultValue={row.area.id}>
                        {activeAreas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Estado">{activeSelect(row.active)}</Field>
                  </OperationForm>
                ),
              },
            ]}
          />
        </Card>
      </section>
    </>
  );
}
