# Ventas y distribución de pagos

## Alcance implementado

`modules/sales` contiene el dominio comercial, la validación de pagos, `recordSaleUseCase`, el puerto específico `SaleRepository` y `PrismaSaleRepository`. La fachada transaccional participa en la transacción del llamador. No abre una transacción interna ni confirma venta/pagos por separado.

Restaurante y Barbería usan el mismo registro financiero. Sus adaptadores conservan el control del pedido o cita, la selección de caja y sus reglas particulares. Ventas no importa esos módulos ni conoce cocina, mesas, agenda, impresoras o proveedores fiscales. El adaptador Prisma comprueba el ámbito de las relaciones existentes (pedido/cita, cliente y caja); las capas internas no reciben tipos de Prisma.

Pagos permanece como subárea de Ventas: suma exacta, importes en centavos, medio principal, efectivo recibido y vuelto. La configuración de métodos habilitados y el permiso para dividir pagos permanecen en Restaurante. La venta y sus `SalePayment` se guardan juntas mediante el mismo repositorio; no se agregó un `PaymentRepository` redundante ni una jerarquía de estrategias.

## Histórico y migración aditiva

La columna opcional `Sale.commercialSnapshot` conserva una versión JSON del detalle vendido: moneda, identificación de líneas de origen, nombre, cantidad, precio, costo cuando existe, clasificación fiscal cuando existe, subtotal, descuento, cargos y total. La moneda se obtiene del negocio en la transacción. Se comprueba que las líneas y los importes concilien. Los cargos de Restaurante conservan los importes ya autorizados de impuestos, servicio y delivery, sin recalcularlos con la configuración actual.

La ampliación se justifica porque `Sale` no disponía de detalle histórico propio y el nombre del servicio de una cita podía cambiar en el catálogo. Se agregaron migraciones equivalentes para SQLite y PostgreSQL. No se reescriben ventas anteriores: su snapshot queda nulo. Los lectores anteriores conservan sus contratos; la pantalla de Barbería todavía muestra su resumen anterior. El uso del snapshot comercial por facturación y por nuevas vistas se integra en sus etapas respectivas.

Barbería mantiene por compatibilidad sus columnas financieras anteriores (`subtotalCents` por defecto en cero), el cobro único sin nuevas filas `SalePayment`, y el incremento de caja por todos los métodos. Su snapshot sí contiene el subtotal real. No se interpreta ese saldo legacy como efectivo físico; armonizarlo corresponde a Caja y la adaptación de Barbería.

## Concurrencia y cambios intencionales

El cobro de una cita ahora relee cita y caja en una transacción Serializable, reclama la cita si su estado y fecha de actualización coinciden, y exige que la caja siga abierta al incrementar el saldo. Antes esas lecturas quedaban fuera de la transacción. Los reintentos reutilizan el ejecutor compartido. El código de venta conserva el prefijo `VTA-N-` y agrega un sufijo aleatorio para evitar colisiones entre citas cobradas en el mismo milisegundo.

Restaurante conserva su reclamación por versión, pagos divididos, reservas de stock, puntos, preparación pendiente, auditoría transaccional y emisión fiscal posterior al commit. Se conservan los códigos de error existentes para pagos y los rechazos de segundo cobro; un conflicto concurrente de pedido continúa devolviendo `ORDER_CHANGED`.

## Código sustituido

- Creaciones directas de ventas en los controladores de Restaurante y Barbería.
- Implementación anterior de checkout de cita en `barbershop/server/commands.ts`.
- Cálculo de suma de pagos, efectivo y vuelto en el controlador de Restaurante.
- Runner exclusivo `scripts/check-inventory-postgres.mjs`: reemplazado por `check-backend-postgres.mjs`, compartido por Inventario y Ventas. El comando npm anterior sigue ejecutando su suite, sin duplicar scripts.
- Preparación PostgreSQL mediante `db push` en ese runner: ahora aplica el historial real de migraciones y verifica que no haya diferencias con el esquema.

Se conserva código útil de devoluciones, preparación, cierres de caja y comprobantes. Su traslado no forma parte de una eliminación de código muerto. El manejo general de devoluciones por líneas y el origen minorista se incorporan con el piloto y las adaptaciones posteriores; no se implementaron aquí como funciones ficticias.

## Evidencia disponible

- Tres caracterizaciones aprobadas antes y después de la extracción: cobro de Barbería, cobro dividido de Restaurante y aislamiento/rollback de ambos.
- Backend: 88 pruebas aprobadas; seis exclusivas de PostgreSQL omitidas en SQLite.
- PostgreSQL: 42 pruebas aprobadas, sin omisiones (31 de Inventario y 11 de Ventas). Incluyen dos cobros sincronizados de una cita, dos cobros de un pedido y cierre de caja después de leerla durante un cobro; además de las pruebas concurrentes de inventario.
- SQLite: 38 migraciones aplicadas desde cero y comparación sin diferencias.
- PostgreSQL: 18 migraciones aplicadas desde cero y comparación sin diferencias. Se utiliza un cluster local desechable que se detiene y elimina al terminar.
- Builds de producción de backend y frontend, comprobación TypeScript y lint del código afectado aprobados. Se probaron los límites ESLint con importaciones prohibidas.
- E2E: 38 escenarios aprobados (1 de cobro de Barbería desde la agenda, 6 de configuración de Restaurante y 31 de auditoría de Restaurante). Incluyen cobro mixto, cuotas, stock, devoluciones, aislamiento y contratos de UI/API.
- Los logs E2E mantienen mensajes de transacción cerrada en la importación de carta y `The destination stream closed early` en navegación, sin fallos en las pruebas; no se declara corregido su origen.

La migración aditiva también se aplicó a `apps/backend/prisma/dev.db`, después de generar el respaldo consistente `backups/sqlite/movendi-go-2026-09-13T04-07-37-875Z.db` y su manifiesto. Se compararon las ventas antes/después: todos los campos anteriores permanecen iguales, los snapshots históricos siguen nulos y las comprobaciones de integridad y claves foráneas pasan.

No se ejecutaron cambios contra una base productiva ni se publicó una versión. Antes de usar el nuevo código en otra base existente debe aplicarse la migración aditiva. Un rollback de código puede dejar la columna adicional sin eliminar datos históricos.

Se cierran las etapas 2 (registro financiero y snapshot) y 4 (distribución de pagos como subárea de Ventas) con esta evidencia. Pagos se adelantó porque su validación y persistencia forman parte de la misma operación de venta. Caja sigue pendiente; tampoco se consideran cerradas las adaptaciones completas de Restaurante o Barbería por haber conectado sus cobros al registro común.

El avance global se registra en [estado de migración](HEXAGONAL-MIGRATION-STATUS.md).
