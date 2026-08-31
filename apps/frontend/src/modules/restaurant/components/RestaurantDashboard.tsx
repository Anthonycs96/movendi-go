import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  ChefHat,
  LayoutGrid,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import type { RestaurantData } from "../types";
import {
  Card,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/shared/components/ui";
import { formatCurrencyCents } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";

export function RestaurantDashboard({
  data,
  locale,
  currency,
}: {
  data: RestaurantData;
  locale: string;
  currency: string;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Resumen del negocio"
        title="Restaurante"
        description="Salón, comandas, pedidos y ventas en una sola operación."
        icon={UtensilsCrossed}
        actions={
          <Link className="button button--primary button--md" href="floor">
            <span>Nuevo pedido</span>
            <ArrowUpRight size={15} />
          </Link>
        }
      />
      <section className="stats-grid">
        <StatCard
          label="Mesas en atención"
          value={String(data.metrics.occupiedTables)}
          detail={`${data.metrics.reservedTables} reservadas · ${data.metrics.cleaningTables} en limpieza`}
          icon={LayoutGrid}
          tone="blue"
        />
        <StatCard
          label="Pedidos activos"
          value={String(data.metrics.activeOrders)}
          detail="Salón y recojo"
          icon={ReceiptText}
          tone="blue"
        />
        <StatCard
          label="En cocina"
          value={String(data.metrics.kitchenPending)}
          detail="Comandas pendientes"
          icon={ChefHat}
          tone="blue"
        />
        <StatCard
          label="Ventas de hoy"
          value={formatCurrencyCents(data.metrics.todayRevenueCents, currency, locale)}
          detail="Cobros completados"
          icon={Banknote}
          tone="blue"
        />
      </section>
      <section className="dashboard-grid">
        <Card className="panel">
          <div className="panel__header">
            <div>
              <span className="section-kicker">Salón</span>
              <h2>Estado de mesas</h2>
            </div>
          </div>
          <div className="floor-mini-grid">
            {data.tables.map((table) => (
              <div
                className={`mini-table mini-table--${table.status.toLowerCase()}`}
                key={table.id}
              >
                <strong>{table.name}</strong>
                <span>
                  {table.area.name} · {table.seats} pers.
                </span>
                <StatusBadge
                  tone={
                    table.status === "AVAILABLE"
                      ? "success"
                      : table.status === "CLEANING"
                        ? "violet"
                        : "warning"
                  }
                >
                  {localizeCode(table.status, locale)}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Card>
        <Card className="panel">
          <div className="panel__header">
            <div>
              <span className="section-kicker">Cocina</span>
              <h2>Comandas activas</h2>
            </div>
          </div>
          <div className="activity-list">
            {data.kitchen.slice(0, 5).map((order) => (
              <div key={order.id}>
                <div className="activity-icon">
                  <ChefHat size={16} />
                </div>
                <div>
                  <strong>
                    {order.code} · {order.table?.name ?? "Recojo"}
                  </strong>
                  <small>
                    {order.items
                      .map((item) => `${item.quantity}× ${item.name}`)
                      .join(", ")}
                  </small>
                </div>
                <StatusBadge
                  tone={
                    order.kitchenTicket?.status === "READY"
                      ? "success"
                      : "warning"
                  }
                >
                  {localizeCode(order.kitchenTicket?.status, locale)}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
