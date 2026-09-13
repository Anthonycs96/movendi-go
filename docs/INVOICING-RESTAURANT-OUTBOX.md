# Restaurante: emisión fiscal durable

Entrega del 13 de septiembre de 2026, continuación de la etapa 6. Restaurante y Minimarket comparten ahora la reserva y entrega de los comprobantes nuevos mediante `FiscalJob`.

## Cambio operativo

Con SUNAT habilitado y emisión automática, el cobro confirma venta, pagos, caja, inventario, correlativo, trama fiscal y trabajo pendiente dentro de la misma transacción. La respuesta indica que el comprobante está en cola. El proceso ya no depende de una llamada HTTP posterior al cobro para dejar constancia de la solicitud.

Una clasificación, identidad o configuración fiscal inválida impide confirmar ese cobro automático y revierte sus escrituras. Un fallo posterior del proveedor conserva la venta y la solicitud pendiente. El tipo automático se determina por el documento histórico del comprador: RUC de once dígitos genera factura; el resto sigue las validaciones de boleta.

El historial conserva los endpoints y permite consultar/reintentar. Para las emisiones manuales nuevas también se guarda primero el trabajo durable. La entrega automática utiliza los comandos `npm run jobs:fiscal:worker` y `npm run jobs:fiscal:once`, con la misma base y clave de cifrado del backend. No se instaló un servicio permanente en esta entrega.

El historial distingue en cola, procesando, pendiente de aceptación, resultado por confirmar y revisión requerida, tanto para comprobantes como para notas. La revisión indica que el reintento automático se detuvo y requiere intervención del operador.

## Devoluciones

Las ventas con comprobante deben tener aceptación confirmada antes de devolver. Esto incluye el estado de revisión, que anteriormente podía quedar fuera de la comprobación.

Para los comprobantes nuevos, la devolución total confirma conjuntamente el dinero, la reposición autorizada, `SaleRefund` y su nota en cola. Una repetición devuelve la operación existente y no vuelve a reservar correlativo. La nota conserva cuenta, ambiente, comprador, líneas e impuestos del original. Las notas totales nuevas usan el motivo de devolución total, código 6 del [catálogo 09 de SUNAT](https://www.sunat.gob.pe/legislacion/superin/2014/anexo8-300-2014.pdf).

El trabajador actualiza conjuntamente `FiscalJob`, la proyección que consume el historial y la auditoría. Si falla esa confirmación local, la toma vence y el siguiente intento consulta la misma identidad. Un error de red después de devolver no vuelve a cobrar ni revierte artificialmente la devolución.

## Compatibilidad y limpieza

- Eliminada la emisión automática HTTP posterior al commit y su captura genérica de errores.
- Eliminada la reserva nueva duplicada del repositorio anterior. La reserva común admite el adaptador histórico explícito de Restaurante.
- Consolidada la construcción de notas totales en una función de dominio.
- Los comprobantes reservados antes de la cola conservan su conciliación anterior, sin cambiar número ni trama. Siempre se consultan antes de reenviar, incluso si su contador antiguo de intentos es cero.
- Las notas antiguas ya reservadas conservan su trama; las devoluciones ligadas a comprobantes anteriores siguen su emisión manual compatible. No se importó automáticamente ese historial a una cuenta del proveedor inferida.
- Sin migraciones adicionales ni modificación de datos operativos locales. Se utiliza el esquema de la entrega fiscal de Minimarket.

## Verificación

Backend: 137 pruebas aprobadas; 20 escenarios exclusivos de PostgreSQL omitidos solo en SQLite. PostgreSQL 17 real y aislado: 98 pruebas aprobadas, sin omisiones, con las 20 migraciones y comparación de esquema correctas.

Los escenarios nuevos cubren empresa/sucursal ajena, interrupción de red, trama histórica, doble cobro, dos trabajadores, devoluciones simultáneas, clasificación inválida y fallos de auditoría tanto al reservar como al confirmar una nota. Se comprueban venta, caja, inventario, correlativos y estados fiscales después de cada fallo.

E2E en Chromium: 36 escenarios aprobados en la ejecución final, 32 de Restaurante y 4 de Minimarket. La emisión automática se comprobó por API y en el historial sin enviar al proveedor. Se corrigió la navegación de la prueba nueva para abrir primero la pestaña Ventas. La captura `output/fiscal/restaurant-fiscal-queue.png` fue revisada visualmente.

TypeScript, lint del código afectado y builds de producción de ambos servicios aprobados. Durante la navegación general persiste el diagnóstico no fatal de Next «The destination stream closed early», observado antes de esta entrega; los escenarios finalizaron correctamente y no se declara resuelto ese diagnóstico.

## Operación y reversión

Las pruebas usan bases desechables y respuestas fiscales simuladas. No se enviaron comprobantes reales ni se publicó producción. Las pruebas de rollback son transaccionales: no sustituyen la aceptación con una cuenta real de pruebas ni una prueba del servicio supervisado en su entorno de destino.

Para revertir código, detener primero el trabajador y resolver o conservar los trabajos pendientes. No ejecutar un emisor anterior que desconozca la cola en paralelo ni borrar solicitudes fiscales para liberar una venta. Mantener una versión capaz de consultar las identidades reservadas; no renumerar ni regenerar documentos al recuperar una operación.

La continuación ya extrajo el [canal compartido de impresión](PRINTING-HEXAGONAL-PHASE-1.md). La etapa 6 global permanece en validación por las pruebas con el proveedor, equipos reales y operación supervisada. Las etapas 7, 8 y 9 conservan su alcance independiente en el [plan de migración](HEXAGONAL-MIGRATION-STATUS.md).
