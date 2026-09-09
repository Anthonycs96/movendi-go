# Caja, carta, promociones y club de clientes

Auditoría inicial del 8 de septiembre de 2026, sobre `43c305c`.

## Estado encontrado

| Área | Backend existente | Frontend existente | Brecha |
| --- | --- | --- | --- |
| Caja | Apertura con fondo inicial y responsable; cierre con conteo y tolerancia | Formularios de apertura/cierre | Faltaban punto de venta, observaciones, confirmación del arqueo y protección de apertura concurrente |
| Cobros | Venta transaccional, pagos configurables y mixtos, actualización del pedido, inventario y puntos | Cobro desde pedidos/salón | Caja no ofrecía acceso directo a pendientes; faltaba registrar recibido/vuelto |
| Movimientos | Ingresos/retiros persistidos, reintentos por clave, permiso de aprobación para retiros | Acciones y últimas entradas | Faltaban observaciones y desglose completo del turno |
| Historial | Endpoint paginado de ventas, cajas y movimientos | Selector de historial junto a la operación | Faltaba detalle completo de sesión y separación visual de tareas |
| Devoluciones | Reversión de dinero, puntos e inventario; auditoría transaccional | Acciones de devolución y comprobantes | Devoluciones sin efectivo no se vinculaban a una caja activa |
| Clientes | Contactos, segmentos, saldo de puntos; acumulación al cobrar y reversión al devolver | Directorio y edición | Faltaban ficha, historial de compras y resumen de recurrencia |
| Productos | Precio, costo, afectación tributaria y rutas de preparación | Formularios persistentes | Edición omitía afectación tributaria y podía restablecerla al valor por defecto |
| Promociones | Porcentaje, importe y cantidad, horarios, vigencia, alcance y cupón | Formulario único con todos los campos | Campos irrelevantes visibles y configuración difícil de interpretar |

No se encontró una caja ficticia: sus operaciones ya tenían persistencia. La presentación mezclaba consultas y trabajo diario. El cálculo visual de vuelto y el resumen del arqueo son ayudas de interfaz; los importes, validaciones y movimientos se verifican en backend.

## Modelos y endpoints

Se reutilizan `CashSession`, `CashMovement`, `Sale`, `SalePayment`, `SaleRefund`, `RestaurantOrder`, `KitchenTicket`, `Customer`, `User`, `Membership`, `Role`, `Branch`, `AuditLog`, `Promotion`, `Product` y la configuración versionada de restaurante.

Endpoints existentes conservados:

- `POST /api/operations/restaurant/cash`
- `POST /api/operations/restaurant/cash/:id/movement`
- `POST /api/operations/restaurant/cash/:id/close`
- `POST /api/operations/restaurant/orders/:id/checkout`
- `POST /api/operations/restaurant/sales/:id/refund`
- `GET /api/data/restaurant-history?kind=sales|cash|movements|orders`
- Alta/edición de `customers`, `products`, `promotions` y `PATCH configuration/customers` bajo `/api/operations/restaurant/`.

Nuevas consultas protegidas: `GET /api/data/restaurant-cash[?id=…]` y `GET /api/data/restaurant-club[?id=…]`. Se limitan a empresa y sede; la ficha conserva el saldo de puntos del cliente a nivel de empresa, mientras las compras y visitas se muestran para la sede actual.

## Cambios

- Caja actual prioriza apertura, pendientes de pago, movimientos, efectivo esperado y resumen por medio de pago. Ventas e historial se cargan al elegir su pestaña.
- La apertura guarda nombre de caja, fondo, observación y responsable autenticado. Se mantiene una sola caja activa por sede, sin introducir una operación simultánea de múltiples cajas que el sistema anterior no soportaba.
- Arqueo con fondo, cobros en efectivo, ingresos, egresos, devoluciones y diferencia. Cierre con confirmación, motivo fuera de tolerancia y comprobación del efectivo esperado para rechazar un resumen obsoleto.
- Índice de unicidad y transacciones para nuevas aperturas; claves de reintento en apertura y movimientos. El cobro conserva el control de versión del pedido y la unicidad de venta por pedido. Una repetición de cobro se rechaza como ya pagada, sin duplicar dinero.
- Cobro con medios de pago configurados, pago mixto y efectivo recibido/vuelto persistidos. El efectivo esperado aumenta solo por el importe cobrado en efectivo, sin contar el vuelto como ingreso.
- Los retiros no pueden superar el efectivo disponible. Apertura, movimiento y cierre escriben su auditoría dentro de la transacción.
- Historial de cierres requiere el permiso existente `restaurant:reports:read`; operar requiere `restaurant:cash:write`; retiros y diferencias fuera de tolerancia conservan `restaurant:cash:approve`. Devoluciones mantienen las reglas de aprobación del negocio. El frontend refleja las restricciones aplicadas por la API.
- Productos agrupados en información, precio y preparación, conservando afectación tributaria. Promociones con presets y campos condicionales; vigencia y horarios se presentan como opciones ampliables.
- Clientes con ficha, compras, recurrencia, segmentos y puntos; configuración del club desde la pantalla para quien tiene permiso de configuración. La activación afecta compras futuras; no recalcula puntos históricos ni envía campañas.
- Acciones de mesa con tamaños consistentes y etiquetas explícitas para reserva rápida y reserva con datos. Las claves de operación funcionan también en HTTP dentro de la red doméstica.

Se añaden migraciones compatibles con SQLite y PostgreSQL para observaciones/nombre de caja, unicidad de sesión activa y recibido/vuelto. La base local se respaldó antes de migrar. No se utiliza seed sobre bases operativas.

## Alcance de validación

La verificación cubre apertura → pedido → cobro mixto → movimiento → arqueo → cierre → historial, devolución en otro turno, puntos, permisos, reintentos y formularios adaptables. Los casos se ejecutan sobre bases desechables con servicios reales del proyecto; no se simulan respuestas de caja.

No se añaden canje de puntos, campañas automáticas ni integración externa de pagos. Las propinas no se muestran como una cifra inventada: no existe un registro independiente de propinas en el modelo actual. Los comprobantes y devoluciones siguen usando los servicios existentes.

## Resultado de la verificación

- Migraciones: esquema SQLite consistente; migraciones equivalentes de PostgreSQL incluidas.
- Compilación de backend y frontend, TypeScript y ESLint aprobados.
- 55 pruebas unitarias aprobadas.
- 100 casos de integración y navegador aprobados: caja/club (5), formularios accesibles (4), jornada exclusivamente desde frontend (6), auditoría de restaurante (31), configuración (6), validaciones (6), aplicación (11), personal (7), navegación/tema (15) y accesibilidad adaptable (9).
- Chromium, Firefox y WebKit: navegación y pantallas de restaurante verificadas a 1366, 768 y 390 píxeles. Formularios de producto, promociones, clientes y cierre revisados con axe y capturas; revisión adicional en modo oscuro.
- Las pruebas móviles de desplazamiento usan la tabla de clientes, que realmente desborda; las nuevas tablas de caja caben en la pantalla de prueba.
- Capturas locales en `outputs/restaurant-ux/` y `outputs/restaurant-browser-review/`. No se enviaron operaciones a proveedores reales ni a impresoras físicas.
