# Inventario, entrega 3: conteos físicos

## Implementación

El endpoint de conteos conserva su esquema Zod, respuesta y auditoría. Se eliminó su implementación transaccional anterior de `server/commands.ts`; ahora delega en la fachada `registerInventoryCount` y el caso de uso `registerInventoryCountUseCase`.

El caso de uso no importa Next.js, Prisma ni Restaurante. Consume el repositorio existente de stock, un repositorio específico de documentos/líneas y un puerto de reservas aún físicamente presentes. Todos los adaptadores reciben la misma transacción y scope.

`RestaurantOnHandReservations` interpreta los estados `PENDING`/`HELD` y devuelve cantidades, sin exponer pedidos al caso de uso de Inventario. Comprueba empresa y sucursal tanto en movimientos como en pedidos. La composición temporal permanece en la fachada legacy; todavía falta separar las restantes funciones de recetas/consumos/devoluciones.

## Comportamiento y cambios intencionales

- Cantidad física esperada = stock disponible + reservas sin preparar. La diferencia ajusta el disponible; no libera nuevamente lo reservado.
- Se conservan conteos sin diferencias, redondeo de movimientos, costo del artículo y rechazo de stock negativo.
- Repetir un conteo compara artículos y cantidades; las notas y la fecha no forman parte de su comparación legacy. No recalcula ni revierte movimientos posteriores.
- Los códigos de conteo conservan el hash de sucursal y clave de solicitud. Los documentos anteriores se reconocen sin migraciones.
- Los nuevos movimientos usan `COUNT:<countId>:<itemId>`. Antes, `COUNT:<requestKey>:<index>` chocaba entre sucursales de una misma empresa. Cada sucursal puede ahora registrar su propio conteo con la misma clave.
- Un fallo en una línea posterior o después del caso de uso revierte documento, líneas y movimientos. La auditoría mantiene su ubicación anterior, después del commit.

## Evidencia

- Tres pruebas de caracterización aprobadas antes y después de extraer: ajustes/documento/costos, repetición sin diferencias y rollback por relaciones ajenas o artículos inválidos.
- Backend: 71 pruebas aprobadas; los tres casos exclusivos de PostgreSQL se omiten en SQLite.
- PostgreSQL 17.5: 26 pruebas de servicio aprobadas sin omisiones. Se incluyen dos conteos concurrentes con la misma clave, con y sin diferencia: un documento y, cuando corresponde, un único ajuste.
- Aislamiento de empresa/sucursal, compatibilidad de conteos históricos, reservas pendientes/retenidas frente a estados preparados, y fallo posterior del llamador verificados con base real.
- Lint del código afectado y builds de producción/TypeScript de backend y frontend aprobados.
- E2E: 31 escenarios de Restaurante y 1 de compatibilidad de inventario de Transporte aprobados. Incluyen conteo repetido, conservación de reservas físicas, recuperación del formulario tras perder la respuesta y conciliación de stock/caja/pagos. El runner terminó con código 0 y restauró los datos iniciales de su base E2E.
- Se observaron mensajes de Next.js `The destination stream closed early` durante navegación, sin fallos de las pruebas; no se declara resuelto su origen.

La entrega de conteos queda completada con esta evidencia.

Se utiliza `npm run test:inventory:postgres`, que crea y elimina un cluster local aislado. No se publicaron cambios ni se alteró el esquema productivo. En esta entrega la extracción completa seguía en curso; su cierre posterior está documentado en la [entrega 4](INVENTORY-HEXAGONAL-PHASE-4.md) y el [estado de migración](HEXAGONAL-MIGRATION-STATUS.md).
