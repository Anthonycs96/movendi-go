# Comprobantes compartidos: primera entrega de la etapa 6

Fecha: 2026-09-13. La etapa 6 sigue en curso. Esta entrega extrae el emisor y corrige su coordinación; no habilita todavía comprobantes fiscales en la interfaz de Minimarket.

Documento histórico de la primera entrega. La continuación ya integra la interfaz de Minimarket, notas parciales y cola durable: véase [operación fiscal de Minimarket](MINIMARKET-FISCAL-OPERATIONS.md) para el estado actualizado.

## Implementación

`modules/invoicing` contiene dominio fiscal, el caso de uso `deliverDocument`, los puertos `FiscalProvider` y `DeliveryRepository`, el adaptador NubeFact y la persistencia Prisma. Restaurante conserva un adaptador de su configuración y de las ventas anteriores. Los comprobantes nuevos pueden construirse desde un contrato de snapshot independiente del rubro; la integración verifica también una venta con origen retail.

Se reutilizan las tablas `RestaurantElectronicDocument`, `RestaurantDocumentSequence`, `RestaurantIntegrationCredential` y `SaleRefund`. Se mantienen sus nombres físicos para conservar datos, relaciones y correlativos sin una migración cosmética. `SaleRefund` solo representa devoluciones totales en este emisor: no sirve para las devoluciones parciales de Minimarket.

Las nuevas ventas de Restaurante que contienen tasa histórica guardan cliente, documento, tasa e inclusión del impuesto en su snapshot comercial. La primera emisión usa ese snapshot. Las ventas anteriores sin contexto fiscal conservan el adaptador explícito de compatibilidad; no se inventan datos históricos ni se rellenan con supuestas clasificaciones de Minimarket.

## Comportamiento ante fallos

- Reserva de correlativo, trama y auditoría en una transacción serializable, antes de llamar al proveedor.
- El envío HTTP ocurre fuera de la transacción de base de datos. La venta, caja e inventario no se revierten por un corte de red fiscal.
- Cada reintento consulta primero el mismo tipo, serie y número. Un error ambiguo queda `UNKNOWN`; solo la ausencia explícita permite reenviar exactamente la trama reservada.
- La respuesta solo se persiste si el intento sigue siendo dueño del trabajo. La cabecera usa el número de intento; la nota total usa estado y fecha de toma comparados en conjunto.
- Resultado y auditoría se confirman juntos. Si falla la persistencia después de que el proveedor responde, queda una toma recuperable; no se registra un falso rechazo fiscal.
- Las devoluciones de Restaurante se bloquean mientras el comprobante tenga resultado incierto, incluido el antiguo estado `FAILED`, que no prueba ausencia en el proveedor.
- Se vuelven a comprobar ambiente y URL oficial antes de enviar credenciales. Su actualización y auditoría son atómicas.

La integración conserva la garantía práctica de una identidad y una trama por comprobante. No promete una única llamada HTTP frente a pausas del proceso o fallos de red.

El código de ausencia 24 y los códigos de moneda PEN/USD se contrastaron con el [manual JSON enlazado por NubeFact](https://www.nubefact.com/integracion), consultado el 13 de septiembre de 2026. Las pruebas usan respuestas simuladas: no acreditan aceptación tributaria real.

## Limpieza

Se retiraron el emisor, el cálculo fiscal y el reparto de importes locales sustituidos en Restaurante. `allocateInvoiceAmounts` no tenía consumidores operativos; se eliminó y su cobertura de redondeo ahora ejercita el cálculo fiscal utilizado por el emisor. No se mantienen implementaciones paralelas para los rubros.

## Validación

Resultado final: **123 pruebas de backend aprobadas** (17 casos exclusivos de PostgreSQL omitidos en SQLite), **81 pruebas PostgreSQL aprobadas sin omisiones** y **40 E2E aprobados** (6 configuración, 31 auditoría de Restaurante, 3 Minimarket). Builds de frontend/backend y lint del código afectado aprobados. El build final de backend se repitió después del endurecimiento de respuestas inválidas del proveedor.

Evidencia local ignorada por Git: `invoicing-backend-check.log`, `invoicing-postgres-check.log`, `invoicing-e2e-check.log`, `invoicing-build-check.log` e `invoicing-lint-check.log`.

La suite de integración de Comprobantes cubre emisión/repetición, aislamiento por empresa/sucursal, ambiente/tipo, rollback de correlativo y auditoría, pérdida de conexión, consulta ambigua, ausencia explícita, respuesta tardía, URL inválida y notas totales. PostgreSQL comprueba solicitudes simultáneas de comprobantes y notas; las demás capacidades conservan sus pruebas concurrentes.

Las suites PostgreSQL se ejecutan por archivo sobre la base descartable para evitar interferencia entre fixtures de módulos distintos. Cada prueba concurrente continúa iniciando operaciones simultáneas dentro de su suite. No se desactivó ninguna comprobación de concurrencia.

## Trabajo pendiente para cerrar la etapa 6

1. Clasificación tributaria y unidades fiscales del catálogo de Minimarket, identidad del comprador, configuración por sucursal y emisión desde su interfaz. El ticket actual sigue siendo interno.
2. Notas de crédito por cada devolución parcial, con sus importes e impuestos históricos y sin exceder el comprobante original.
3. Intención de emisión registrada junto al cobro/devolución y trabajador durable con reintentos programados, recuperación de tomas, revisión y estado visible. Esta entrega conserva la ejecución solicitada por el usuario; no incorpora aún un outbox automático.
4. Terminar los adaptadores de entrega externa previstos, incluido el alcance de impresión; validar con proveedor en ambiente de pruebas antes de habilitar emisión real. La asociación persistente entre ambiente, cuenta/ruta del proveedor y cada documento también debe completarse antes de permitir cambios de cuenta con trabajos pendientes.

No se publicaron cambios ni se enviaron comprobantes reales. Esta entrega no añadió migraciones ni modificó la base operativa local.
