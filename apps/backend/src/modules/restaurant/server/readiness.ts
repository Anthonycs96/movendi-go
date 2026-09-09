import "server-only";

import type { RestaurantReadiness, RestaurantReadinessCheck } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import { getRestaurantConfiguration } from "./configuration";

const check = (key: string, section: string, label: string, detail: string, status: RestaurantReadinessCheck["status"], action: string): RestaurantReadinessCheck => ({ key, section, label, detail, status, action });

export async function getRestaurantReadiness(scope: Pick<TenantScope, "tenantId" | "branchId">): Promise<RestaurantReadiness> {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const [areas, categories, products, unresolvedCategories, unresolvedProducts, diningTables, users, roles, printerAreas, recipes, inventoryItems, sunatCredential] = await Promise.all([
    prisma.preparationArea.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } }),
    prisma.category.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } }),
    prisma.product.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true, productType: { not: "ADDON" } } }),
    prisma.category.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true, preparationAreaId: null } }),
    prisma.product.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true, areaAssignmentMode: "SPECIFIC_AREA", preparationAreaId: null, category: { preparationAreaId: null } } }),
    prisma.diningTable.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } }),
    prisma.membership.count({ where: { tenantId: scope.tenantId, active: true, user: { active: true } } }),
    prisma.role.findMany({ where: { tenantId: scope.tenantId }, select: { key: true } }),
    prisma.preparationArea.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true, dispatchMode: "PRINTER", printerLinks: { none: { active: true, printer: { active: true } } } } }),
    prisma.productRecipe.count({ where: { active: true, product: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } } }),
    prisma.inventoryItem.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } }),
    prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } }, select: { status: true } }),
  ]);
  const acceptances = await prisma.auditLog.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, action: "OPERATION_ACCEPTANCE", entityType: "RestaurantReadiness" }, orderBy: { createdAt: "desc" }, take: 30, select: { entityId: true, createdAt: true } });
  const roleKeys = new Set(roles.map((role) => role.key));
  const approvalRolesMissing = configuration.sales.approvalRoleKeys.filter((role) => !roleKeys.has(role));
  const dineInEnabled = configuration.orders.sources.some((source) => source.active && source.key === "DINE_IN");
  const checks: RestaurantReadinessCheck[] = [
    check("AREAS", "OPERATIONS", "Áreas operativas", areas ? `${areas} área${areas === 1 ? "" : "s"} activa${areas === 1 ? "" : "s"}.` : "No existe un área activa para preparar productos.", areas ? "READY" : "BLOCKED", "Configurar áreas"),
    check("CATALOG", "CATALOG", "Carta publicable", categories && products ? `${categories} categorías y ${products} productos principales activos.` : "La carta necesita al menos una categoría y un producto.", categories && products ? "READY" : "BLOCKED", "Completar carta"),
    check("ROUTING", "CATALOG", "Rutas de preparación", unresolvedCategories || unresolvedProducts ? `${unresolvedCategories} categorías y ${unresolvedProducts} productos usan la ruta general porque no tienen un área específica.` : "Toda la carta tiene un destino de preparación.", unresolvedCategories || unresolvedProducts ? (configuration.kitchen.requirePreparationArea ? "BLOCKED" : "WARNING") : "READY", "Corregir rutas"),
    check("TEAM", "TEAM", "Equipo y permisos", users ? `${users} usuario${users === 1 ? "" : "s"} activo${users === 1 ? "" : "s"}.` : "No existe ningún usuario activo en la empresa.", users ? "READY" : "BLOCKED", "Agregar usuarios"),
    check("APPROVAL_ROLES", "RESTAURANT_SALES", "Responsables de aprobación", approvalRolesMissing.length ? `No existen los roles: ${approvalRolesMissing.join(", ")}.` : "Todos los roles aprobadores existen.", approvalRolesMissing.length ? "BLOCKED" : "READY", "Revisar roles"),
    check("FLOOR", "TABLES", "Salón", !dineInEnabled || diningTables ? (dineInEnabled ? `${diningTables} mesas activas.` : "El canal salón está deshabilitado.") : "El canal salón está activo, pero no existen mesas.", !dineInEnabled || diningTables ? "READY" : "BLOCKED", "Configurar mesas"),
    check("PAYMENTS", "RESTAURANT_SALES", "Métodos de pago", configuration.sales.paymentMethods.some((method) => method.active) ? "Existe al menos un método habilitado." : "No existe ningún método de pago activo.", configuration.sales.paymentMethods.some((method) => method.active) ? "READY" : "BLOCKED", "Configurar pagos"),
    check("PRINTING", "PRINTING", "Rutas de impresión", printerAreas ? `${printerAreas} áreas configuradas para imprimir no tienen impresora activa.` : "Las áreas de impresión tienen un destino válido.", printerAreas ? "BLOCKED" : "READY", "Configurar impresión"),
    check("KITCHEN_THRESHOLDS", "RESTAURANT_KITCHEN", "Alertas de cocina", configuration.kitchen.criticalMinutes > configuration.kitchen.warningMinutes ? "El umbral crítico es mayor que el preventivo." : "La alerta crítica debe ocurrir después de la preventiva.", configuration.kitchen.criticalMinutes > configuration.kitchen.warningMinutes ? "READY" : "BLOCKED", "Corregir tiempos"),
    check("INVENTORY", "RESTAURANT_CONTROL", "Inventario y recetas", configuration.inventory.autoDeductRecipes && (!inventoryItems || !recipes) ? "El descuento automático está activo, pero faltan insumos o recetas." : `${inventoryItems} insumos y ${recipes} recetas configuradas.`, configuration.inventory.autoDeductRecipes && (!inventoryItems || !recipes) ? "WARNING" : "READY", "Revisar inventario"),
    check("SUNAT", "RESTAURANT_INTEGRATIONS", "Facturación electrónica", !configuration.integrations.sunatEnabled ? "La emisión electrónica está deshabilitada." : sunatCredential?.status === "CONNECTED" ? "Conexión validada. Falta comprobar emisión, consulta y devolución con comprobantes del proveedor." : sunatCredential ? "Las credenciales existen, pero falta validar la conexión." : "SUNAT está habilitado, pero faltan las credenciales de NubeFact.", !configuration.integrations.sunatEnabled ? "READY" : sunatCredential ? "WARNING" : "BLOCKED", "Configurar SUNAT"),
  ];
  for (const [key, label] of [["TEAM_TRAINING", "Capacitación del equipo"], ["FIRST_SHIFT", "Primer turno acompañado"]]) {
    const acceptance = acceptances.find((entry) => entry.entityId === key);
    checks.push(check(key, "OPERATIONS", label, acceptance ? `Confirmado por un responsable el ${acceptance.createdAt.toISOString().slice(0,10)}.` : "Pendiente de confirmar con el equipo del restaurante.", acceptance ? "READY" : "WARNING", "Registrar validación"));
  }
  const blockers = checks.filter((item) => item.status === "BLOCKED");
  const warnings = checks.filter((item) => item.status === "WARNING");
  const score = Math.round(checks.reduce((total, item) => total + (item.status === "READY" ? 1 : item.status === "WARNING" ? 0.5 : 0), 0) / checks.length * 100);
  return { ready: blockers.length === 0, score, checkedAt: new Date().toISOString(), checks, blockers, warnings };
}
