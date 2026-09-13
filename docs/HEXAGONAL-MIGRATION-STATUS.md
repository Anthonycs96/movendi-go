# Estado de la migración hexagonal

## Cómo contar las etapas

El plan detallado tiene una etapa 0 de línea base y nueve etapas de implementación. Están completadas la línea base, Inventario, Ventas, Caja, Pagos, Minimarket operativo y las adaptaciones de Restaurante y Barbería dentro del alcance documentado. Quedan **dos etapas abiertas**: la aceptación externa de Comprobantes/integraciones y la evaluación de Transporte. La validación local no equivale a publicación ni a aceptación del proveedor.

| Etapa | Estado | Alcance pendiente |
| --- | --- | --- |
| 1. Inventario | Completada | Extracción verificada; mejoras funcionales adicionales se registran aparte |
| 2. Ventas | Completada | Registro financiero común y snapshot de pedido/cita verificados |
| 3. Caja | Completada | Aperturas, cierres, movimientos y efectos transaccionales compartidos; concurrencia verificada |
| 4. Pagos | Completada | Distribución, efectivo/vuelto y persistencia transaccional dentro de Ventas |
| 5. Minimarket operativo | Completada | Catálogo/presentaciones, lotes, compras, POS, devoluciones, caja, clientes, reportes y permisos implementados |
| 6. Comprobantes e integraciones | En validación externa | Motor, impresión y ejecutor HTTP preparados; faltan cuenta BETA, servicio supervisado en el entorno elegido, proveedor y equipos reales |
| 7. Restaurante | Completada en el alcance de adaptación | Pedidos/adiciones, cobro, cocina, cancelación y devolución con casos de uso y capacidades comunes; CRUD y acciones auxiliares conservados |
| 8. Barbería | Completada en el alcance de adaptación | Cobro hexagonal, pagos registrados, caja de efectivo y transición explícita de turnos históricos; agenda verificada |
| 9. Transporte | Pendiente | Evaluar cambios concretos, conservando liquidaciones propias |

La etapa 5 incorpora una operación minorista utilizable; las nueve corresponden al plan arquitectónico completo. Los comprobantes fiscales de Minimarket siguen dentro de la etapa 6: el ticket interno no equivale a una boleta/factura electrónica.

Pagos se adelantó junto con Ventas porque la distribución y las filas de pago pertenecen a su misma transacción. Barbería ahora usa efectivo físico en los turnos nuevos y conserva la interpretación de los anteriores: hay que cerrar los turnos históricos antes de volver a cobrar. Minimarket ya tiene origen minorista y devoluciones parciales por líneas, sin duplicar la cabecera financiera de Ventas.

## Última entrega: etapas 6, 7 y 8

Casos de uso y adaptadores de Restaurante y Barbería extraídos, auditorías críticas integradas en sus transacciones y DTO de Barbería consolidado. Se eliminaron los bloques sustituidos del manejador de Restaurante y el cobro de Barbería que sumaba todos los medios a caja. La migración aditiva conserva 643 filas y todos los campos preexistentes de 118 tablas locales, comprobados contra un respaldo.

Verificación: 149 pruebas backend, 113 PostgreSQL, 41 E2E distintos y dos pruebas del ejecutor/migración aprobadas, además de tipos, lint, builds y revisión visual. Detalle: [Restaurante y Barbería](RESTAURANT-BARBERSHOP-HEXAGONAL.md).

El [ejecutor fiscal](FISCAL-RUNNER-OPERATIONS.md) dispone de proceso independiente, endpoint autorizado e imagen preparada. No se instaló ni publicó un servicio permanente. La base local no tiene credenciales fiscales: la aceptación externa de la etapa 6 permanece pendiente. Los apartados siguientes conservan las cifras e hitos de entregas anteriores.

## Avance de Comprobantes

Emisor compartido con dominio, puertos y adaptadores; reserva y resultados auditados de forma atómica, consulta antes del reintento y protección contra respuestas tardías. Minimarket incorpora clasificación tributaria, comprador, boletas/facturas desde el POS, notas parciales y una cola fiscal transaccional con trabajador recuperable. Se conservan cantidades, bases e impuestos históricos, también en presentaciones por peso/volumen. Detalle y límites: [operación fiscal de Minimarket](MINIMARKET-FISCAL-OPERATIONS.md). La [primera entrega de Comprobantes](INVOICING-HEXAGONAL-PHASE-1.md) conserva el historial de la extracción.

Verificación de la entrega fiscal de Minimarket: 131 pruebas de backend, 91 PostgreSQL y 35 E2E aprobadas, con builds, TypeScript, lint y revisión visual de escritorio/móvil. Migración aditiva verificada en ambos motores; la base local conserva las 116 tablas y 643 registros preexistentes, comparados contra un respaldo. No se publicó ni se enviaron documentos reales. El trabajador está implementado; requiere ejecutarse como servicio para entregar automáticamente.

## Continuación: Restaurante fiscal

La continuación de Comprobantes conecta también el cobro y las devoluciones nuevas de Restaurante a la cola transaccional. Se eliminó la emisión automática posterior al commit y la reserva nueva duplicada; la conciliación de documentos anteriores permanece compatible. El historial distingue espera, procesamiento y revisión. Verificación: 137 pruebas de backend, 98 de PostgreSQL y 36 E2E aprobadas, además de TypeScript, lint y builds. Sin migraciones adicionales ni publicación. Detalle: [Restaurante y cola fiscal](INVOICING-RESTAURANT-OUTBOX.md).

## Continuación: impresión compartida

Control de entrega extraído a dominio, caso de uso, puerto y adaptador Prisma. Restaurante conserva sus reglas de ruteo; navegador y agente comparten reserva, confirmación y reintento. Las reservas vencidas requieren revisión en papel y cada respuesta queda ligada a su intento. Se eliminaron los bloques duplicados y un script de validación puntual sin referencias. Sin migraciones adicionales. Verificación: 143 pruebas de backend, 106 en PostgreSQL, una prueba del proceso del agente con red local y 37 escenarios E2E aprobados, además de TypeScript, lint y builds. Detalle y actualización obligatoria del protocolo del agente: [Impresión compartida](PRINTING-HEXAGONAL-PHASE-1.md).

## Entrega de Minimarket

Cuarto rubro integrado en altas, asistente, permisos, sesiones, límites del plan y navegación. Cobro hexagonal con puerto propio y adaptador a las capacidades compartidas. Catálogo/presentaciones, lotes FEFO, compras, conteos, devoluciones parciales, caja y ticket interno con auditoría e idempotencia atómicas.

Migraciones aditivas verificadas; base local actualizada después de respaldo y comparación de las 110 tablas preexistentes. No se publicó producción. Se eliminaron selecciones implícitas de otro rubro en los accesos afectados y se corrigieron conteos globales de las pruebas que impedían aislar suites en PostgreSQL.

Verificación: 110 pruebas de backend, 68 de PostgreSQL y 41 E2E aprobadas, con revisión visual de escritorio/móvil y builds de producción.

Alcance funcional, pruebas y límites comerciales: [Minimarket operativo](MINIMARKET-OPERATIONS.md).

## Entrega de Caja

- Dominio, casos de uso, puerto `CashRepository` y adaptador Prisma compartidos por Restaurante y Barbería. Los cobros y devoluciones usan la misma capacidad dentro de sus transacciones.
- Eliminados los bloques anteriores de apertura/cierre/movimiento y las escrituras repetidas de saldo. Las escrituras operativas de caja se concentran en el repositorio.
- Apertura única mediante el slot existente; cierres protegidos frente a cambios del saldo; retiros limitados al disponible. Auditoría de apertura/cierre de Barbería ahora atómica.
- La política de diferencias de Restaurante entra como datos. Barbería conserva su saldo histórico de todos los métodos; su conciliación pendiente no se considera resuelta por esta extracción.
- Verificación final: 97 pruebas de backend, 54 de integración PostgreSQL y 38 E2E aprobadas, además de TypeScript, lint y builds. No se añadieron migraciones ni se publicó una versión en esta entrega.

Detalles: [Caja compartida](CASH-HEXAGONAL-PHASE-1.md).

## Entrega de Ventas y Pagos

- Registro común con dominio, caso de uso, puerto `SaleRepository` y adaptador Prisma. Restaurante y Barbería lo consumen dentro de sus transacciones.
- Snapshot comercial versionado con moneda, líneas e importes; migraciones aditivas verificadas en SQLite y PostgreSQL. Ventas anteriores intactas.
- Validación compartida de distribución, efectivo recibido y vuelto; configuración de métodos conservada en su rubro.
- Eliminados los bloques sustituidos de creación de ventas, el checkout anterior de citas y el cálculo local de pagos/vuelto.
- Verificación: 88 pruebas de backend, 42 de integración PostgreSQL y 38 E2E aprobadas; builds de producción, TypeScript y lint del código afectado aprobados.
- La base local se actualizó después de un respaldo verificado; no se publicó una versión ni se migró producción.

Detalles y límites: [Ventas y distribución de pagos](SALES-HEXAGONAL-PHASE-1.md).

## Entregas dentro de Inventario

- Movimiento de stock: completado, con dominio, caso de uso y repositorio.
- Compras: completado, con aislamiento, idempotencia y rollback verificados.
- Conteos: completado; la consulta de reservas físicas está en Restaurante mediante un puerto.
- Recetas, consumos, devoluciones y consultas de productos/ventas: trasladados a Restaurante. La composición conecta las políticas del rubro con Inventario.
- Ejecutor transaccional: trasladado a infraestructura compartida, con consumidores actualizados y contratos conservados. Se eliminó el ejecutor anterior y no quedan referencias a su nombre en código.
- Validación final: 76 pruebas de backend aprobadas, 31 en PostgreSQL sin omisiones y 68 escenarios E2E aprobados. Builds de producción y lint del código afectado aprobados. PostgreSQL verifica consumos, compras y conteos concurrentes, aislamiento y reversión de escrituras ante fallos.

El CRUD sencillo y las consultas permanecen en `server`; la etapa no exige envolver operaciones simples en capas adicionales. La auditoría posterior al commit y los indicadores sobre consultas acotadas siguen siendo limitaciones funcionales documentadas; no se declaran corregidas por esta extracción.

Los archivos `INVENTORY-HEXAGONAL-PHASE-1/2/3/4.md` describen entregas internas de Inventario, no las etapas principales de esta tabla. El cierre se detalla en [entrega 4](INVENTORY-HEXAGONAL-PHASE-4.md).

Cada entrega exige comportamiento compatible, aislamiento entre empresas/sucursales, rollback, pruebas de concurrencia PostgreSQL y regresiones relevantes. Se elimina el código sustituido; no se declara código muerto sin verificar referencias y uso.
