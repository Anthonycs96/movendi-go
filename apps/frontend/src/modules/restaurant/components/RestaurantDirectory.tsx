"use client";
import { ProductEditor } from "./ProductEditor";
import { PromotionEditor as PromotionForm } from "./PromotionEditor";
import { CheckoutPaymentFields, checkoutPayload } from "./CheckoutForm";
import { hasPermission } from "@/core/auth/permissions";

import { useState } from "react";
import {
  BadgePercent,
  LayoutGrid,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import type { RestaurantData } from "../types";
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

const activeSelect = (active: boolean) => (
  <Select name="active" defaultValue={String(active)}>
    <option value="true">Activo</option>
    <option value="false">Inactivo</option>
  </Select>
);

export function RestaurantDirectory({
  section,
  data,
  core,
  permissions,
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
  permissions: string[];
  platformAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const locale = core.tenant.locale;
  const money = (value: number) => formatCurrencyCents(value, core.tenant.currency, locale);
  const canCharge = hasPermission(permissions, "restaurant:cash:write");
  const canEditOrders = hasPermission(permissions, "restaurant:orders:write");

  if (section === "menu") {
    const rows = data.products.filter((item) =>
      `${item.name} ${item.category.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    return (
      <>
        <PageHeader
          eyebrow="Catálogo"
          title="Carta y productos"
          description="Categorías, platos, bebidas, precios y destino de preparación."
          actions={
            <div className="header-actions">
              <OperationForm
                allowed={hasPermission(permissions, "restaurant:menu:write")} title="Nueva categoría"
                endpoint="/api/operations/restaurant/categories"
                triggerLabel="Categoría"
              >
                <Field label="Nombre">
                  <Input name="name" required placeholder="Ej. Postres" />
                </Field>
              </OperationForm>
              <ProductEditor data={data} allowed={hasPermission(permissions, "restaurant:menu:write")} />
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
                      allowed={hasPermission(permissions, "restaurant:menu:write")} title="Editar categoría"
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
                    <ProductEditor data={data} product={row} allowed={hasPermission(permissions, "restaurant:menu:write")} />
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
          actions={hasPermission(permissions, "restaurant:promotions:write") ? <PromotionForm data={data} /> : null}
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
                cell: (row) => hasPermission(permissions, "restaurant:promotions:write") ? <PromotionForm data={data} promotion={row} /> : null,
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
                    {canEditOrders && row.items.some((item) => item.status === "HELD") ? <OperationButton method="POST" endpoint={`/api/operations/restaurant/orders/${row.id}/queue`}>Enviar a cocina</OperationButton> : null}
                    {canEditOrders && row.source === "DINE_IN" && !row.paid &&
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
                    {canCharge && !row.paid &&
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
                    {canEditOrders && !row.paid &&
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
                    {canEditOrders && row.source === "DELIVERY" &&
                    row.deliveryStatus === "READY" ? (
                      <OperationButton
                        endpoint={`/api/operations/restaurant/orders/${row.id}/delivery-status`}
                        body={{ status: "DISPATCHED" }}
                        variant="primary"
                      >
                        Enviar delivery
                      </OperationButton>
                    ) : null}
                    {canEditOrders && row.source === "DELIVERY" &&
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

  const activeAreas = data.areas.filter((area) => area.active);
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
              allowed={hasPermission(permissions, "restaurant:floor:write")} title="Nuevo ambiente"
              endpoint="/api/operations/restaurant/areas"
              triggerLabel="Ambiente"
            >
              <Field label="Nombre">
                <Input name="name" required placeholder="Ej. Terraza" />
              </Field>
            </OperationForm>
            <OperationForm
              allowed={hasPermission(permissions, "restaurant:floor:write")} title="Nueva mesa"
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
                    allowed={hasPermission(permissions, "restaurant:floor:write")} title="Editar ambiente"
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
                    allowed={hasPermission(permissions, "restaurant:floor:write")} title="Editar mesa"
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
