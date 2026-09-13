# Minimarket: módulo operativo

## Alcance

La etapa 5 deja de ser un piloto de checkout. Minimarket se incorpora como cuarto rubro del SaaS, con alta de empresa, asistente, roles, navegación y diez secciones operativas. Comparte las capacidades de Inventario, Ventas/Pagos y Caja ya extraídas.

| Área | Implementación |
| --- | --- |
| Catálogo | SKU por sucursal, categoría, unidad base UND/KG/L, stock mínimo, activación, precios y presentaciones |
| Presentaciones | Unidad, paquete/caja mediante factor, código de barras por sucursal y venta fraccionada por peso/volumen |
| Inventario | Stock normalizado a seis decimales, Kardex, conteo protegido contra cambios y auditoría |
| Lotes | Recepción con código y vencimiento, consumo FEFO, rechazo de vencidos, conteo por lote |
| Compras | Proveedor y documento en cada recepción, cantidades en unidad base y costo promedio ponderado; API hasta 100 productos, formulario de una recepción/producto por vez |
| Punto de venta | Búsqueda por nombre/SKU/barcode, carrito, consumidor final o cliente, pagos divididos, referencias, efectivo y vuelto |
| Ventas | Origen minorista propio, snapshot histórico, consulta paginada y ticket imprimible desde el navegador |
| Devoluciones | Parciales por línea, redondeo acumulado, uno o varios métodos originales, límite contra lo cobrado y reposición opcional en el lote de origen |
| Caja | Un turno abierto por sucursal, fondo, ingresos/retiros, saldo solo de efectivo, arqueo y aprobación de diferencias |
| Clientes | Directorio compartido por empresa y alta desde Minimarket |
| Reportes | Ventas brutas/netas, devoluciones, operaciones, alertas de stock/vencimientos y CSV de la página consultada |
| Administración | Roles de administración/caja/almacén, permisos editables y separación de sucursales |
| Sitio público | Catálogo de hasta 100 presentaciones activas de la primera sede, sujeto al plan y publicación existentes |

La lectura de códigos usa un lector que escribe como teclado o el ingreso manual. El peso se introduce manualmente; no se ha integrado una balanza física.

## Arquitectura y patrones

Se mantiene el **monolito modular con arquitectura hexagonal ligera**:

- `domain/retail.ts`: cantidades, importe por presentación, FEFO y cálculo proporcional de devolución, sin Prisma ni HTTP.
- `application/checkout.ts`: caso de uso de cobro y puerto `CheckoutPort`.
- `infrastructure/prisma/checkout-port.ts`: adaptador que coordina el detalle minorista con Inventario, Ventas y Caja en la misma transacción.
- `server`: composición, esquemas HTTP, consultas y CRUD sencillo. Las devoluciones y recepciones reutilizan reglas de dominio y las capacidades comunes.
- `RetailOperation`: clave idempotente limitada a empresa/sucursal, hash del contenido y resultado durable, confirmado junto con los efectos y auditoría.

No se creó una segunda cabecera financiera: `RetailSale` representa el origen y sus líneas; `Sale` conserva el cobro y `SalePayment` sus pagos. No se añadieron Strategy/Factory ni repositorios genéricos sin necesidad.

## Reglas comprobadas

1. Cobrar confirma o revierte conjuntamente origen, venta, pagos, lotes, stock, caja, cuota e historial de solicitud.
2. El replay de una solicitud confirmada devuelve el mismo resultado. Cambiar el contenido con la misma clave se rechaza, incluso después de cerrar caja.
3. Los precios se obtienen del servidor. Un cambio de precio que desajuste el pago exige actualizar el carrito; no se acepta un total enviado como autoridad por el navegador.
4. No se permite stock negativo. Las presentaciones indivisibles y los artículos UND exigen unidades enteras.
5. El lote vigente de vencimiento más cercano se consume primero. Una devolución vencida puede registrarse como no vendible, sin volver a sumar stock.
6. Una devolución nunca supera cantidad ni importe originales; varias fracciones no producen céntimos adicionales. Un fallo de caja revierte también la reposición.
7. El acceso genérico de Inventario está bloqueado para Minimarket: todas sus escrituras deben conservar la concordancia entre lote y artículo.
8. Un cajero no consulta reportes/costos ni cambia a una sede ajena a su asignación. Los tickets por API omiten costos internos.
9. El ticket conserva la moneda del snapshot. Los reportes agregan la moneda actual, sin sumar monedas diferentes, y explican su criterio de devoluciones.

## Migraciones y recuperación

`20260913020000_minimarket_operations` añade seis tablas y el origen nullable de `Sale`. En SQLite se utiliza `ALTER TABLE ADD COLUMN`: no se reconstruye ni elimina la tabla histórica. PostgreSQL dispone de la migración equivalente.

La base local se actualizó después del respaldo verificado `backups/sqlite/movendi-go-2026-09-13T05-11-17-626Z.db`. Se compararon las filas y todos los campos previos de **110 tablas** contra el respaldo; permanecieron iguales. `integrity_check` y `foreign_key_check` aprobaron. Evidencia local: `output/minimarket/local-migration-verification.json`.

La recuperación usa el procedimiento existente de restauración del respaldo con la aplicación detenida. Restaurar una copia anterior descarta operaciones posteriores a esa copia; para revertir solo el código, las tablas nuevas pueden permanecer sin uso. No se migró ni publicó producción.

## Verificación

- Backend: 110 pruebas aprobadas; 15 escenarios exclusivos de PostgreSQL se omiten únicamente en SQLite.
- PostgreSQL 17 real, aislado: 68 pruebas aprobadas entre Inventario, Ventas, Caja y Minimarket, sin omisiones. Incluye últimas unidades disputadas, cobros repetidos, compras y devoluciones simultáneas.
- Las 39 migraciones SQLite y 19 PostgreSQL coinciden con el esquema esperado.
- Jornada completa de Minimarket en Chromium, restricciones de cajero y reintentos por API aprobados; cobro legacy de Barbería aprobado.
- Regresión E2E: 41 escenarios distintos aprobados (6 configuración de Restaurante, 31 operación de Restaurante, 3 Minimarket y 1 cobro de Barbería). Última pasada de Minimarket: 3/3.
- Builds de producción de ambos servicios, TypeScript y lint del código afectado aprobados. POS revisado visualmente en escritorio y móvil, sin desborde horizontal; corregida la indicación de espera del carrito vacío.
- Durante la navegación de la regresión de Restaurante persiste el mensaje no fatal de Next “The destination stream closed early”, ya observado en etapas anteriores. No falló ningún escenario; no se declara resuelto ese diagnóstico.

Se corrigieron pruebas antiguas de Inventario que contaban compras/conteos de todas las empresas cuando las suites compartían PostgreSQL. Ahora cada verificación utiliza su empresa; no se relajó la comprobación de rollback.

## Límites explícitos

La continuación de la etapa 6 añadió boletas/facturas desde el POS, clasificación tributaria, DNI/RUC, notas de crédito parciales y entrega durable. Su configuración, trabajador, migraciones y verificación están en [operación fiscal de Minimarket](MINIMARKET-FISCAL-OPERATIONS.md). Las cifras de la sección anterior corresponden al cierre original de la etapa 5.

Este es un módulo operativo, no una certificación fiscal ni un ERP completo. Quedan fuera de esta entrega:

- Validación de aceptación con una cuenta real del proveedor fiscal y puesta en servicio del trabajador. Los flujos electrónicos están implementados; el ticket imprimible sigue siendo interno.
- Confirmación bancaria automática: CARD/YAPE/PLIN registran el método y la referencia; no invocan una pasarela.
- Varias cajas simultáneas por sucursal, sincronización offline, balanzas y agente de impresión física.
- Transferencias entre sucursales, cuentas por pagar, devoluciones al proveedor, promociones automáticas y carga masiva de catálogo.
- El proveedor se conserva en cada recepción; no existe todavía un maestro de proveedores independiente. El CSV exporta la página visible y las listas operativas muestran sus límites.

Los artículos desactivados deben reactivarse antes de reponer una devolución: la política compartida de Inventario solo mueve artículos activos. La unidad base y el control de lotes quedan fijos al crear el producto para evitar reinterpretar stock histórico.

## Uso local

Desde **Negocios → Nuevo negocio**, selecciona **Minimarket**. Completa empresa, módulos, equipo y operación. El catálogo se carga en el espacio del negocio; luego registra una compra, abre Caja y entra en Punto de venta. Los usuarios de almacén/caja reciben solo sus secciones permitidas.

La creación del rubro requiere ejecutar las migraciones en cada entorno antes de iniciar la versión nueva. Las verificaciones utilizaron bases desechables y no crearon negocios ficticios en la base local del usuario.
