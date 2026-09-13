# Minimarket: comprobantes, devoluciones y cola fiscal

Entrega del 13 de septiembre de 2026. Implementación para NubeFact, con precios que incluyen el impuesto configurado y clasificaciones gravada, exonerada e inafecta. La validación con respuestas simuladas no equivale a aceptación de comprobantes reales por el proveedor.

## Uso

1. En **Ajustes**, guardar la ruta y el token NubeFact del ambiente correspondiente. Las credenciales se cifran y pertenecen al negocio; sus datos sensibles no aparecen en Ventas ni en el POS.
2. Configurar ambiente, tasa y series de esta sucursal, y habilitar la emisión. Los productos existentes quedan pendientes de clasificar: completar su clasificación en **Catálogo**.
3. Registrar DNI/RUC y nombre o razón social en **Clientes**. La factura requiere RUC de 11 dígitos; la boleta admite consumidor final en el alcance del emisor actual.
4. Elegir ticket, boleta o factura en el POS. La venta y su solicitud fiscal se confirman juntas. En **Ventas → Ver ticket** se ven estado, ambiente y enlaces PDF/XML/CDR devueltos por el proveedor.
5. El botón **Consultar / reenviar** procesa un documento de manera inmediata. **Actualizar estado** solo actualiza la pantalla. La entrega automática requiere mantener el trabajador fiscal en ejecución.

El ticket imprimible conserva su identificación como documento interno. Los archivos fiscales corresponden a los enlaces del proveedor; un PDF recibido no significa que SUNAT haya aceptado el documento.

## Entrega durable

```text
Transacción del cobro: venta + pagos + stock/lotes + caja + snapshot + correlativo + FiscalJob + auditoría
Trabajador: toma con vencimiento → consulta/envío NubeFact fuera de la transacción
Transacción del resultado: estado fiscal + archivos + auditoría
```

Desde la raíz del repositorio:

```powershell
npm run jobs:fiscal:once
npm run jobs:fiscal:worker
```

El proceso necesita la misma base de datos y `INTEGRATION_ENCRYPTION_KEY` que el backend. En producción debe ejecutarse como un servicio supervisado; esta entrega no lo despliega ni deja un proceso permanente instalado.

El trabajador revisa la cola periódicamente. Los reintentos esperan desde 30 segundos hasta una hora; tras diez intentos no confirmados, el documento pasa a revisión y deja de reintentarse automáticamente. Las tomas caducan a los 60 segundos y se recuperan consultando primero la identidad original. Los operadores autorizados pueden solicitar conciliación manual.

Cada trabajo conserva tipo, serie, número, ambiente, ruta del proveedor y trama. Si cambia la cuenta/ruta o el ambiente de las credenciales, los trabajos anteriores se detienen antes de enviar; requieren restaurar las credenciales correspondientes a su cuenta original. No se redirige un documento anterior a una cuenta nueva.

El almacenamiento garantiza una identidad por operación y toma protegida contra resultados tardíos. No promete una sola llamada HTTP frente a pausas de proceso o fallos de red.

## Devoluciones parciales

Una venta fiscal requiere su comprobante original aceptado antes de devolver mercadería o dinero. Cada devolución confirmada reserva su propia nota en la misma transacción de caja, inventario e idempotencia. No usa `SaleRefund`, cuyo emisor anterior representa devoluciones totales de Restaurante.

La nota toma las líneas, moneda, comprador, bases e impuestos del comprobante original. La distribución acumulada de céntimos usa enteros y conserva exactamente el impuesto original al terminar de devolver todos los artículos. Para ventas por peso/volumen se convierten también las cantidades a KGM/LTR usando el factor histórico de la presentación.

Se utiliza el motivo de devolución por ítem del [catálogo 09 de SUNAT](https://www.sunat.gob.pe/legislacion/superin/2014/anexo8-300-2014.pdf), incluyendo devoluciones de una parte de la cantidad vendida, según la [guía de notas de crédito UBL 2.1](https://cpe.sunat.gob.pe/sites/default/files/inline-files/guia%2Bxml%2Bnota%20de%20cr%C3%A9dito%2Bversion%202-1%2B1%2B0_0_0%20%282%29.pdf). El formato y las consultas corresponden al [API de NubeFact](https://www.nubefact.com/integracion).

Las devoluciones de tickets internos siguen funcionando sin nota fiscal. Un fallo al reservar la nota revierte todos los cambios de esa devolución; un fallo posterior de red conserva la devolución confirmada y su trabajo pendiente.

## Datos y compatibilidad

- Migración aditiva `20260913030000_minimarket_fiscal_outbox`: dos tablas, `FiscalConfiguration` y `FiscalJob`, y una columna de clasificación en `RetailProduct`. SQLite usa `ALTER TABLE`; no reconstruye tablas de inventario.
- La base local se actualizó después del respaldo `backups/sqlite/movendi-go-2026-09-13T05-49-13-849Z.db`. Se compararon las columnas anteriores de 116 tablas y sus 643 registros: permanecieron iguales; integridad y claves foráneas correctas. Evidencia: `output/fiscal/local-migration-verification.json`.
- Las ventas anteriores sin contexto fiscal no se rellenan con clasificaciones o clientes supuestos. El cambio de catálogo, comprador, moneda o tasa no reescribe el snapshot de una venta cobrada.
- Se reutilizan cálculo, numeración, cifrado, cliente HTTP y caso de uso de entrega de `modules/invoicing`. El cobro y la devolución solo agregan la intención dentro de sus transacciones existentes.

## Verificación

- Backend: 131 pruebas aprobadas y 19 escenarios exclusivos de PostgreSQL omitidos solo en SQLite.
- PostgreSQL 17 real y aislado: 91 pruebas aprobadas, sin omisiones. Incluyen cobros fiscales y devoluciones concurrentes, disputa entre trabajadores, aislamiento por empresa/sucursal y reversión ante fallos de reserva o auditoría.
- Las 40 migraciones SQLite y 20 PostgreSQL coinciden con el esquema esperado. El respaldo local se verificó antes y después de migrar.
- E2E en Chromium: 35 escenarios distintos aprobados, 31 de Restaurante y 4 de Minimarket. La interfaz verifica clasificación, credenciales, RUC y factura en cola sin enviar al proveedor; se corrigió la edición de clasificación tributaria detectada por esta prueba.
- Builds de producción de ambos servicios, TypeScript y lint del código afectado aprobados. Capturas de Ventas revisadas en escritorio y móvil; el escenario móvil comprueba que la página no desborda horizontalmente.
- Ejecución única del trabajador aprobada sobre la cola local vacía. Las respuestas fiscales de las pruebas están simuladas; no se instalaron procesos permanentes ni se enviaron comprobantes reales.

## Límites y continuación

Queda pendiente la validación con una cuenta real de pruebas antes de habilitar la emisión productiva. Esta entrega no envió documentos reales ni publicó servicios. No incluye agentes de impresión física, conciliación bancaria, notas por descuentos/correcciones ni edición de tramas reservadas.

La continuación ya conecta los nuevos cobros y devoluciones de Restaurante a esta misma cola: véase [Restaurante y emisión durable](INVOICING-RESTAURANT-OUTBOX.md). Los documentos anteriores conservan una conciliación compatible. También se extrajo el [canal compartido de impresión](PRINTING-HEXAGONAL-PHASE-1.md), cuyo consumidor actual es Restaurante; Minimarket conserva su ticket por navegador. La validación operativa con el proveedor, equipos reales y servicios supervisados sigue pendiente antes de declarar completa la etapa 6 global. Las etapas 7, 8 y 9 continúan registradas por separado en el plan.
