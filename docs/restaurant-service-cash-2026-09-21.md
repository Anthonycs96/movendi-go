# Restaurante: preparación, servicio y cajas

## Flujo operativo

- Cada producto avanza de **Pendiente → En preparación → Listo para servir → Servido**. Cocina y Bar tienen botones por producto; las observaciones siguen siendo observaciones y los adicionales existentes conservan su ruta de preparación.
- **Marcar todos listos** pide confirmación y solo afecta los productos pendientes o en preparación del área seleccionada. El backend rechaza una selección que mezcle áreas.
- Una comanda puede quedar **Parcialmente lista**. El estado general del pedido continúa siendo `PREPARING` mientras hay preparación pendiente, para conservar la compatibilidad con la configuración existente.
- Salón y Pedidos muestran el estado de cada producto. **Servir** y **Marcar listos como servidos** solo afectan productos `READY`; no adelantan productos pendientes ni en preparación.
- Preparar, servir y cobrar son operaciones independientes. Cobrar conserva la preparación y entrega pendientes. La mesa se libera o pasa a limpieza cuando el pedido está pagado y servido.
- Se registran `startedAt`, `readyAt`, `servedAt` y los identificadores de los responsables de cada etapa. Repetir un estado no sobrescribe su hora. No se inventan fechas para eventos antiguos.
- Las transacciones leen y reclaman la versión del pedido dentro del mismo intento; los conflictos reintentables vuelven a leer el estado confirmado. Se conserva el mecanismo de actualización en vivo y revalidación existente.

## Configurar permisos

En **Configuración → Roles**, editar los permisos del rol. Los nombres de los roles no determinan la autorización:

| Acción | Permiso |
| --- | --- |
| Preparar productos | `restaurant:kitchen:write` |
| Servir productos listos | `restaurant:orders:serve` |
| Cobrar pedidos | `restaurant:orders:charge` |
| Cancelar pedidos | `restaurant:orders:cancel` |
| Consultar caja | `restaurant:cash:read` |
| Abrir turno | `restaurant:cash:open` |
| Cerrar turno | `restaurant:cash:close` |
| Registrar movimientos | `restaurant:cash:movement` |
| Aprobar retiros y diferencias | `restaurant:cash:approve` |
| Administrar cajas físicas | `restaurant:configuration:write` |
| Aprobar descuentos excepcionales | `restaurant:promotions:approve` (existente) |

Para que un mozo cobre, asignar **Cobrar pedidos**. Para que solo Caja cobre, quitar ese permiso del mozo y asignarlo al cajero. Abrir, cerrar y registrar movimientos se conceden por separado. Cocina no recibe permiso de servir ni cobrar automáticamente.

El permiso anterior **Caja completa y cobros** (`restaurant:cash:write`) se mantiene por compatibilidad y concede todas las operaciones básicas de caja y cobro. Para restringir un rol, quitar ese permiso amplio y seleccionar los permisos específicos. El permiso `*` continúa concediendo acceso administrativo completo. No existe un flujo nuevo para reabrir pedidos pagados: se conservan las devoluciones y sus controles actuales.

## Cajas por sucursal

En **Configuración → Cajas de esta sucursal** se crean, editan y desactivan cajas. Se muestra qué caja está abierta y quién abrió el turno. No hay eliminación de cajas con historial. Una caja con turno abierto debe cerrarse antes de cambiar su configuración.

**Abrir caja** exige seleccionar una caja activa de la sucursal, ingresar el fondo inicial y, opcionalmente, una observación de hasta 500 caracteres. Acepta cero, punto o coma decimal; rechaza negativos, texto y más de dos decimales. La persona, empresa, sucursal y hora proceden del servidor.

Cada caja puede tener un solo turno abierto. Distintas cajas de una sucursal pueden operar simultáneamente. La restricción única existente `tenantId + branchId + activeSlot` usa ahora `REGISTER_ID:<id>` para las cajas del restaurante y protege aperturas concurrentes.

Al cobrar se selecciona el turno que recibirá la venta. Si solo existe uno se preselecciona; con varios turnos el backend exige una selección. El efectivo siempre exige una sesión abierta. Los pagos no efectivos respetan además la configuración `requireOpenCash`. El registro de venta conserva el cajero y la fecha existentes.

## Migración y compatibilidad

Migración: `20260921000000_restaurant_item_service_cash_registers`, disponible para SQLite y PostgreSQL.

- Añade los seis campos opcionales de trazabilidad a `OrderItem`.
- Crea `CashRegister`, con empresa, sucursal, nombre normalizado, estado y fechas.
- Añade la relación opcional `CashSession.cashRegisterId`; conserva la compatibilidad de Barbería y Minimarket con el servicio compartido.
- Recupera las cajas anteriores agrupando los nombres de sus sesiones por empresa y sucursal. Vincula las sesiones y conserva sus nombres históricos, importes, responsables y fechas.
- Crea Caja principal en sucursales de restaurante sin cajas históricas. Los nuevos restaurantes reciben esa caja en el alta inicial.
- Los roles existentes con edición de pedidos conservan la capacidad de servir mediante un permiso explícito. Los roles que solo operan Cocina no lo reciben. Cancelar requiere ahora el permiso específico o acceso administrativo.
- Si hubiera dos turnos abiertos para el mismo nombre de caja, la restricción única detiene la migración para conciliarlos; no se cierran turnos ni se ajustan importes automáticamente. El respaldo de producción verificado no tenía ese conflicto.

## Verificación

Se utilizan bases de pruebas aisladas. El respaldo de producción se restaura únicamente en una base local vacía; no se crean ventas de prueba en producción.

- Typecheck, lint y builds de backend/frontend.
- Suite unitaria y pruebas de dominio de transiciones y estados agregados.
- PostgreSQL: aperturas concurrentes, idempotencia, retiros, cierres y actualización simultánea de Cocina, Bar y servicio.
- Playwright: permisos por API, aislamiento de empresa/sucursal, caja inactiva, validación monetaria, responsable/fecha forzados, vínculo venta-turno, controles táctiles, entrega parcial y uso de pedidos antiguos.
- Migraciones desde base vacía y desde una restauración del respaldo de producción; comparación del contenido histórico de ventas, pagos, pedidos, productos del pedido, sesiones de caja, movimientos, mesas y comandas.
- Evidencia visual local en `outputs/restaurant-service/`.

La validación con impresora física y proveedores externos continúa siendo independiente de estos cambios. Las marcas de tiempo antiguas permanecen vacías hasta que ocurre una nueva transición real.

## Resultado final de QA

La entrega conjunta con reventa aprobó 50 pruebas Playwright, 228 de la suite general, 33 de integración PostgreSQL de Inventario y 13 de Caja. Typecheck, lint y builds completados. La auditoría incluye la operación completa de compra, pedido, cocina, servicio, cobro, cierre y devolución desde frontend, además de navegación sin desbordamiento en PC, tablet y móvil.

## Archivos de la entrega conjunta

- `apps/backend/prisma/migrations/20260921000000_restaurant_item_service_cash_registers/migration.sql`
- `apps/backend/prisma/migrations/20260921010000_restaurant_resale_inventory/migration.sql`
- `apps/backend/prisma/postgresql/migrations/20260921000000_restaurant_item_service_cash_registers/migration.sql`
- `apps/backend/prisma/postgresql/migrations/20260921010000_restaurant_resale_inventory/migration.sql`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/seed.ts`
- `apps/backend/src/app/api/auth/login/route.ts`
- `apps/backend/src/app/api/data/restaurant-cash/route.ts`
- `apps/backend/src/app/api/data/restaurant-history/route.ts`
- `apps/backend/src/app/api/data/tenant/route.ts`
- `apps/backend/src/app/api/operations/[...segments]/route.ts`
- `apps/backend/src/app/api/public/sites/[slug]/route.ts`
- `apps/backend/src/core/auth/permissions.ts`
- `apps/backend/src/core/platform/onboarding.ts`
- `apps/backend/src/core/tenancy/commands.ts`
- `apps/backend/src/modules/cash/application/operations.ts`
- `apps/backend/src/modules/cash/application/ports/cash-repository.ts`
- `apps/backend/src/modules/cash/infrastructure/prisma/prisma-cash-repository.ts`
- `apps/backend/src/modules/cash/server/service.test.ts`
- `apps/backend/src/modules/inventory/application/ports/inventory-purchase-repository.ts`
- `apps/backend/src/modules/inventory/application/use-cases/register-inventory-purchase.ts`
- `apps/backend/src/modules/inventory/server/commands.ts`
- `apps/backend/src/modules/inventory/server/data.ts`
- `apps/backend/src/modules/inventory/server/schemas.ts`
- `apps/backend/src/modules/inventory/server/service.test.ts`
- `apps/backend/src/modules/restaurant/domain/preparation-transition.test.ts`
- `apps/backend/src/modules/restaurant/domain/preparation-transition.ts`
- `apps/backend/src/modules/restaurant/infrastructure/prisma/checkout.ts`
- `apps/backend/src/modules/restaurant/infrastructure/prisma/preparation.ts`
- `apps/backend/src/modules/restaurant/infrastructure/prisma/refund.ts`
- `apps/backend/src/modules/restaurant/server/access.ts`
- `apps/backend/src/modules/restaurant/server/cash-commands.ts`
- `apps/backend/src/modules/restaurant/server/cash-registers.ts`
- `apps/backend/src/modules/restaurant/server/commands.ts`
- `apps/backend/src/modules/restaurant/server/data.ts`
- `apps/backend/src/modules/restaurant/server/inventory-commands.ts`
- `apps/backend/src/modules/restaurant/server/inventory-data.ts`
- `apps/backend/src/modules/restaurant/server/inventory-schemas.ts`
- `apps/backend/src/modules/restaurant/server/menu-history.ts`
- `apps/backend/src/modules/restaurant/server/order-state.ts`
- `apps/backend/src/modules/restaurant/server/preparation.test.ts`
- `apps/backend/src/modules/restaurant/server/preparation.ts`
- `apps/backend/src/modules/restaurant/server/product-stock.ts`
- `apps/backend/src/modules/restaurant/server/sale-inventory.ts`
- `apps/backend/src/modules/restaurant/types.ts`
- `apps/frontend/src/app/globals.css`
- `apps/frontend/src/core/platform/components/BusinessSetupWizard.tsx`
- `apps/frontend/src/core/rbac/permissions.ts`
- `apps/frontend/src/core/tenancy/components/CoreSettingsWorkspace.tsx`
- `apps/frontend/src/modules/inventory/InventoryWorkspace.tsx`
- `apps/frontend/src/modules/inventory/ResaleTools.tsx`
- `apps/frontend/src/modules/restaurant/RestaurantWorkspace.tsx`
- `apps/frontend/src/modules/restaurant/components/CashRegisters.tsx`
- `apps/frontend/src/modules/restaurant/components/CashWorkspace.tsx`
- `apps/frontend/src/modules/restaurant/components/CheckoutForm.tsx`
- `apps/frontend/src/modules/restaurant/components/FloorWorkspace.tsx`
- `apps/frontend/src/modules/restaurant/components/KitchenWorkspace.tsx`
- `apps/frontend/src/modules/restaurant/components/OrderService.tsx`
- `apps/frontend/src/modules/restaurant/components/ProductEditor.tsx`
- `apps/frontend/src/modules/restaurant/components/RestaurantDirectory.tsx`
- `apps/frontend/src/modules/restaurant/manifest.ts`
- `apps/frontend/src/modules/restaurant/types.ts`
- `docs/restaurant-resale-2026-09-21.md`
- `docs/restaurant-service-cash-2026-09-21.md`
- `e2e/real-attentions-40.spec.ts`
- `e2e/restaurant-cash-club.spec.ts`
- `e2e/restaurant-configuration.spec.ts`
- `e2e/restaurant-frontend-journey.spec.ts`
- `e2e/restaurant-item-service-cash.spec.ts`
- `e2e/restaurant-production-audit.spec.ts`
- `e2e/restaurant-resale.spec.ts`
- `packages/contracts/src/index.ts`
