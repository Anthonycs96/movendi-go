import "server-only";
import { prisma } from "@/core/database/prisma";
import { hasPermission } from "@/core/auth/permissions";
import type { AuthSession } from "@/core/auth/types";
import type { OperationalNotification } from "@movendi/contracts";
import { getTransportConfiguration } from "@/modules/transport/server/configuration";
import { getRestaurantConfiguration } from "@/modules/restaurant/server/configuration";

export async function getOperationalNotifications(session: AuthSession): Promise<OperationalNotification[]> {
  const items: OperationalNotification[] = [];
  const path = (section: string) => `/t/${session.tenantSlug}/${section}`;
  const allowed = (permission: string) => hasPermission(session.permissions, permission);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { subscriptionStatus: true, subscriptionEndsAt: true, trialEndsAt: true, cancelAtPeriodEnd: true } });
  const subscriptionEnd = tenant.subscriptionStatus === "TRIAL" ? tenant.trialEndsAt : tenant.subscriptionEndsAt;
  if (["PAST_DUE", "CANCELLED"].includes(tenant.subscriptionStatus)) items.push({ id: "subscription-risk", tone: "critical", title: "Suscripción requiere atención", message: `Estado actual: ${tenant.subscriptionStatus}.`, href: path("settings") });
  else if (subscriptionEnd && subscriptionEnd <= new Date(Date.now() + 7 * 86_400_000)) items.push({ id: "subscription-ending", tone: "warning", title: "Suscripción próxima a vencer", message: `Vence el ${subscriptionEnd.toLocaleDateString("es-PE")}${tenant.cancelAtPeriodEnd ? " y no se renovará automáticamente" : ""}.`, href: path("settings") });

  if (session.tenantType === "TRANSPORT") {
    const configuration = await getTransportConfiguration(session.tenantId);
    const notify = (event: string) => configuration.notifications.rules.some((rule) => rule.active && rule.event === event && rule.channels.includes("IN_APP") && (!rule.roleKeys.length || rule.roleKeys.includes(session.roleKey)));
    const horizon = new Date(Date.now() + configuration.documents.defaultAlertDays * 86_400_000);
    const appointmentHorizon = new Date(Date.now() + 2 * 3_600_000);
    const [documents, incidents, maintenance, inventory, expenses, failedJobs, appointmentRisk, unassignedTrips, delayedTrips, duplicateValues] = await Promise.all([
      notify("DOCUMENT_EXPIRING") && allowed("transport:documents:read") ? prisma.transportDocument.count({ where: { tenantId: session.tenantId, status: "VALID", expiresAt: { lte: horizon } } }) : 0,
      notify("CRITICAL_INCIDENT") && allowed("transport:operations:read") ? prisma.transportIncident.count({ where: { tenantId: session.tenantId, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } } }) : 0,
      notify("MAINTENANCE_DUE") && allowed("transport:maintenance:read") ? prisma.transportMaintenanceOrder.count({ where: { tenantId: session.tenantId, status: { in: ["OPEN", "IN_PROGRESS"] }, scheduledAt: { lt: new Date() } } }) : 0,
      configuration.modules.inventory.lowStockAlerts && allowed("transport:maintenance:read") ? prisma.inventoryItem.findMany({ where: { tenantId: session.tenantId, OR: [{ branchId: session.branchId }, { branchId: null }], active: true }, select: { stock: true, minimumStock: true } }) : [],
      notify("EXPENSE_APPROVAL") && allowed("transport:finance:write") ? prisma.transportExpense.count({ where: { tenantId: session.tenantId, status: "PENDING" } }) : 0,
      prisma.transportDataJob.count({ where: { tenantId: session.tenantId, actorId: session.userId, status: "FAILED" } }),
      allowed("transport:operations:read") ? prisma.transportTrip.count({ where: { tenantId: session.tenantId, branchId: session.branchId, appointmentStartAt: { lte: appointmentHorizon }, appointmentStatus: { in: ["PENDING", "CONFIRMED", "REPROGRAMMED"] }, status: { notIn: ["DELIVERED", "CANCELLED"] } } }) : 0,
      allowed("transport:operations:read") ? prisma.transportTrip.count({ where: { tenantId: session.tenantId, branchId: session.branchId, scheduledStartAt: { lte: appointmentHorizon }, status: { in: ["DRAFT", "PLANNED"] }, assignments: { none: { status: "ACTIVE" } } } }) : 0,
      allowed("transport:operations:read") ? prisma.transportTrip.count({ where: { tenantId: session.tenantId, branchId: session.branchId, scheduledEndAt: { lt: new Date() }, actualEndAt: null, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }) : 0,
      allowed("transport:operations:read") ? prisma.transportCustomFieldValue.findMany({ where: { tenantId: session.tenantId, definition: { duplicatePolicy: { in: ["WARN", "BLOCK"] } }, normalizedValue: { not: null } }, select: { definitionId: true, normalizedValue: true } }) : [],
    ]);
    const lowStock = inventory.filter((record) => record.stock <= record.minimumStock).length;
    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();
    for (const value of duplicateValues) { const key = `${value.definitionId}:${value.normalizedValue}`; if (seenKeys.has(key)) duplicateKeys.add(key); else seenKeys.add(key); }
    if (incidents) items.push({ id: "transport-incidents", tone: "critical", title: `${incidents} incidente${incidents === 1 ? "" : "s"} de alta prioridad`, message: "Hay eventos abiertos que requieren resolución operativa.", href: path("operations") });
    if (documents) items.push({ id: "transport-documents", tone: "warning", title: `${documents} documento${documents === 1 ? "" : "s"} por vencer`, message: `Vencidos o con vigencia menor a ${configuration.documents.defaultAlertDays} días.`, href: path("documents") });
    if (maintenance) items.push({ id: "transport-maintenance", tone: "warning", title: `${maintenance} mantenimiento${maintenance === 1 ? "" : "s"} atrasado${maintenance === 1 ? "" : "s"}`, message: "Órdenes abiertas con fecha programada vencida.", href: path("maintenance") });
    if (lowStock) items.push({ id: "transport-stock", tone: "warning", title: `${lowStock} repuesto${lowStock === 1 ? "" : "s"} con stock bajo`, message: "El inventario alcanzó o bajó su nivel mínimo.", href: path("maintenance") });
    if (expenses) items.push({ id: "transport-expenses", tone: "info", title: `${expenses} gasto${expenses === 1 ? "" : "s"} por aprobar`, message: "Hay rendiciones pendientes asignadas a los roles responsables.", href: path("finance") });
    if (failedJobs) items.push({ id: "transport-jobs", tone: "warning", title: `${failedJobs} exportación${failedJobs === 1 ? "" : "es"} fallida${failedJobs === 1 ? "" : "s"}`, message: "Revisa o vuelve a generar los archivos pendientes.", href: path("reports") });
    if (appointmentRisk) items.push({ id: "transport-appointment-risk", tone: "warning", title: `${appointmentRisk} cita${appointmentRisk === 1 ? "" : "s"} requiere${appointmentRisk === 1 ? "" : "n"} atención`, message: "Citas próximas, reprogramadas o vencidas dentro del horizonte operativo.", href: path("operations") });
    if (unassignedTrips) items.push({ id: "transport-unassigned", tone: "critical", title: `${unassignedTrips} viaje${unassignedTrips === 1 ? "" : "s"} sin unidad`, message: "La salida está próxima y aún no existe un ensamble activo.", href: path("operations") });
    if (delayedTrips) items.push({ id: "transport-delayed", tone: "critical", title: `${delayedTrips} viaje${delayedTrips === 1 ? "" : "s"} demorado${delayedTrips === 1 ? "" : "s"}`, message: "Superaron su llegada estimada y siguen abiertos.", href: path("operations") });
    if (duplicateKeys.size) items.push({ id: "transport-duplicates", tone: "warning", title: `${duplicateKeys.size} referencia${duplicateKeys.size === 1 ? "" : "s"} duplicada${duplicateKeys.size === 1 ? "" : "s"}`, message: "Revisa los campos externos marcados para detectar duplicidad.", href: path("operations") });
  } else if (session.tenantType === "RESTAURANT") {
    const configuration = await getRestaurantConfiguration(session.tenantId);
    const notify = (event: string) => configuration.notifications.rules.some((rule) => rule.active && rule.event === event && rule.channels.includes("IN_APP") && (!rule.roleKeys.length || rule.roleKeys.includes(session.roleKey)));
    const delayedBefore = new Date(Date.now() - configuration.kitchen.warningMinutes * 60_000);
    const activeOrderStatuses = configuration.orders.statuses.filter((status) => status.active && !status.terminal).map((status) => status.key);
    const [kitchen, orders, inventory] = await Promise.all([
      notify("KITCHEN_DELAY") && allowed("restaurant:kitchen:read") ? prisma.kitchenTicket.count({ where: { tenantId: session.tenantId, branchId: session.branchId, status: { in: ["QUEUED", "PREPARING"] }, createdAt: { lte: delayedBefore } } }) : 0,
      allowed("restaurant:orders:read") ? prisma.restaurantOrder.count({ where: { tenantId: session.tenantId, branchId: session.branchId, status: { in: activeOrderStatuses } } }) : 0,
      notify("LOW_STOCK") && configuration.inventory.lowStockAlerts && allowed("inventory:read") ? prisma.inventoryItem.findMany({ where: { tenantId: session.tenantId, OR: [{ branchId: session.branchId }, { branchId: null }], active: true, trackStock: true }, select: { stock: true, minimumStock: true } }) : [],
    ]);
    const lowStock = inventory.filter((record) => record.stock <= record.minimumStock).length;
    if (kitchen) items.push({ id: "restaurant-kitchen", tone: "warning", title: `${kitchen} comanda${kitchen === 1 ? "" : "s"} demorada${kitchen === 1 ? "" : "s"}`, message: `Superaron el umbral preventivo de ${configuration.kitchen.warningMinutes} minutos.`, href: path("kitchen") });
    if (orders) items.push({ id: "restaurant-orders", tone: "info", title: `${orders} pedido${orders === 1 ? "" : "s"} activo${orders === 1 ? "" : "s"}`, message: "Atenciones aún no cerradas.", href: path("orders") });
    if (lowStock) items.push({ id: "restaurant-stock", tone: "warning", title: `${lowStock} insumo${lowStock === 1 ? "" : "s"} con stock bajo`, message: "El inventario alcanzó o bajó su nivel mínimo.", href: path("inventory") });
  } else if (allowed("barbershop:appointments:read")) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);
    const [pending, overdue] = await Promise.all([
      prisma.appointment.count({ where: { tenantId: session.tenantId, branchId: session.branchId, startsAt: { gte: start, lt: end }, status: { in: ["PENDING", "CONFIRMED"] } } }),
      prisma.appointment.count({ where: { tenantId: session.tenantId, branchId: session.branchId, endsAt: { lt: new Date() }, status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] } } }),
    ]);
    if (overdue) items.push({ id: "barber-overdue", tone: "warning", title: `${overdue} cita${overdue === 1 ? "" : "s"} sin cerrar`, message: "La hora terminó y la atención sigue abierta.", href: path("appointments") });
    if (pending) items.push({ id: "barber-today", tone: "info", title: `${pending} cita${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"} hoy`, message: "Agenda activa de la sucursal actual.", href: path("appointments") });
  }
  return items.slice(0, 10);
}
