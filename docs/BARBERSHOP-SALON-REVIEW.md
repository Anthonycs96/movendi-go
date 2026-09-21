# Barbería y Salón: revisión y entrega operativa

Fecha: 21 de septiembre de 2026. Alcance: Movendi Go, comparación con Restaurante y Minimarket, implementación de la primera etapa, validación y publicación. Evidencia de pruebas y despliegue en [BARBERSHOP-SALON-VALIDATION.md](BARBERSHOP-SALON-VALIDATION.md).

## 1. Diagnóstico del módulo anterior

Barbería tenía ficha de clientes, profesionales con porcentaje de comisión, horario semanal, servicios con duración/precio, citas individuales, cambio de estado, reprogramación, cobro de una cita, apertura/cierre de caja e Inventario compartido. El cobro ya reutilizaba Ventas y Caja con transacción serializable.

No existía una venta directa de productos/servicios múltiples, detalle por profesional, cálculo histórico de comisiones, consumo de insumos del servicio, expediente de cliente visible, promociones del salón, reportes propios ni bloqueos de agenda. La descripción «Historial y preferencias» de Clientes mostraba solo una nota: no era un historial real. El porcentaje de comisión se almacenaba, pero no producía una liquidación.

Problemas comprobados en el código anterior:

- La comprobación de horario y solapamiento se hacía antes de abrir la transacción de creación/reprogramación.
- La agenda usaba la zona horaria del proceso del servidor para fechas sin offset y días semanales.
- Resumen calculaba ingresos sobre 50 ventas y citas sobre 100 registros; no garantizaba el total del día.
- El endpoint de cobro de citas requería permiso de edición de agenda, no de caja.
- El endpoint de datos no comprobaba permisos por sección para Barbería.
- La plantilla de alta asignaba a Caja los permisos de Restaurante.
- Una cita cancelada podía aparecer entre próximas citas del resumen.

## 2. Comparación y reutilización

| Capacidad | Restaurante | Minimarket | Barbería: resultado de esta entrega |
|---|---|---|---|
| Productos | Carta, categorías, recetas, áreas de preparación | Catálogo, presentaciones, códigos, lotes | Oferta comercial vinculada al mismo InventoryItem; no crea otro stock |
| Inventario | Motor compartido y recetas | Motor compartido, lotes y transferencias | Misma pantalla, Kardex, compras, conteos, mínimos, ajustes; consumo por servicio |
| Proveedores | Compra con proveedor textual | Directorio y cuentas por pagar | Se extiende Inventario compartido con directorio y relación a compras |
| Ventas | Pedido con múltiples líneas | Ticket con múltiples productos | Ticket mixto, con/sin cita, profesional por servicio y vendedor opcional por producto |
| Pagos | SalePayment y distribución | SalePayment y distribución | Mismo validador de pagos, efectivo/Yape/Plin/tarjeta/transferencia/otro, combinación y vuelto |
| Caja | Sesiones, movimientos, cierre con control | Cajas y turnos individuales | Mismo servicio de Caja; turno por sucursal, movimientos, control de saldo al cerrar |
| Clientes | Customer compartido y club | Customer compartido e historial comercial | Ficha, notas, búsqueda por nombre/teléfono/DNI, citas y compras paginadas |
| Promociones | Motor sobre pedidos y carta | Reglas sobre productos/presentaciones | Misma entidad Promotion, alcance SALON, porcentaje/monto y vigencia; sin alterar reglas de otros rubros |
| Roles y sucursales | Núcleo de identidad, roles, sucursales | Mismo núcleo | Reutilizados; permisos propios de reportes, descuentos, devoluciones y liquidaciones |
| Reportes | Ventas, productos, margen, operación | Ventas, productos, margen, stock | Producción, servicios/productos, medios de pago, recurrencia, comisiones y margen de contribución |
| Importación masiva | Herramientas específicas de carta y maestros | Importador de catálogo | Pendiente de adaptación; no se exponen importadores de otro rubro como si fueran compatibles |
| Facturación electrónica | Outbox fiscal e integración configurada | Mismo núcleo fiscal con configuración propia | Ticket interno imprimible; la integración fiscal de salón queda expresamente pendiente |

## 3. Funciones completadas en esta etapa

### Atención y agenda

- Fecha/hora interpretadas en la zona horaria del negocio, independientes del servidor.
- Citas con cliente, servicio, duración, profesional y nota de atención; búsqueda, filtro por estado/profesional y consulta de cualquier fecha.
- Profesionales habilitados por servicio. Una lista vacía habilita a todos los profesionales activos.
- Horario semanal y días no laborables; bloqueos por descansos, vacaciones y ausencias con inicio/fin y motivo.
- Sugerencias de horarios según servicio, horario, citas y bloqueos. La confirmación definitiva siempre se valida en servidor.
- Reprogramación y cancelación. Una cita cobrada o cerrada no puede modificarse.
- El bloqueo rechaza citas pendientes en el intervalo; el cambio de horario no deja citas vigentes fuera de disponibilidad.
- Próximas citas visibles en Resumen. Es un recordatorio dentro del sistema, no un envío automático externo.

### Venta y caja

- Venta sin cita o cobro de cita con servicios/productos adicionales.
- El servicio reservado se agrega una vez con el precio de la cita; cada servicio adicional tiene su propio profesional y precio vigente.
- Cliente opcional en venta directa; cliente obligatorio y coincidente al cobrar una cita.
- Pagos combinados con suma exacta en céntimos, vuelto de efectivo y medios habilitados por negocio.
- Descuento manual con permiso y motivo; promoción vigente por porcentaje o monto. No se acumula con descuento manual.
- Idempotencia del cobro: el reenvío del mismo contenido devuelve la misma venta; una clave reutilizada con otro contenido se rechaza.
- Caja e inventario se confirman en la misma transacción que la venta, las líneas, los pagos, las comisiones y la auditoría.
- Solo la parte en efectivo incrementa el efectivo esperado. Se conservan las cajas históricas ALL_PAYMENTS y se exige conciliarlas antes de nuevos cobros.
- Historial paginado de ventas y detalle imprimible/guardable como PDF desde el navegador.
- Devolución completa de las nuevas ventas; reposición opcional de productos recibidos, sin reponer insumos ya usados. Se revierte producción/comisiones pendientes al excluir la venta devuelta. No se devuelve dinero digital automáticamente: el operador debe devolverlo por el proveedor y registrar la operación.
- Una venta con comisiones ya pagadas no se devuelve automáticamente: requiere conciliación administrativa.

### Gestión

- Clientes con historial paginado de citas y ventas, productos/servicios, profesionales, gasto total, última visita y notas.
- Inventario compartido para productos e insumos, stock mínimo, movimientos, compras, ajustes y conteos.
- Consumo configurable por servicio, en la unidad del artículo. Descuento al cobrar y rechazo de stock insuficiente; todo el cobro se revierte si falla.
- Proveedores con documento, contacto, dirección y estado; compras asociadas al proveedor y costo promedio compartido.
- Comisión porcentual o fija por profesional para servicios y productos, con sobrescritura opcional por servicio. Se guarda el importe al vender y no se recalcula el pasado.
- Comisión sobre importe después del descuento, con reparto exacto de céntimos y tope en el neto de la línea. Un importe fijo tiene prioridad sobre el porcentaje.
- Lista de comisiones pendientes y registro de liquidación con referencia del pago externo. Si el pago salió de caja, el egreso se registra con la misma referencia.
- Gestión de sucursales, usuarios, roles y auditoría desde el núcleo existente.

## 4. Cambios de backend y base de datos

Migración aditiva `20260921010000_salon_operations` para SQLite y PostgreSQL. No rellena importes ni inventa comisiones históricas.

- `ServiceStaff`: habilitación profesional/servicio.
- `ServiceSupply`: consumo unitario de inventario por servicio.
- `StaffTimeBlock`: intervalos de indisponibilidad por sucursal y profesional.
- `SalonProduct`: precio comercial vinculado al InventoryItem existente.
- `SalonSale`: origen comercial con clave de idempotencia y hash de solicitud.
- `SalonSaleLine`: servicio/producto, profesional, nombres históricos, cantidad, importes, descuento, costo, comisión y estado de liquidación.
- `Sale.salonSaleId`: vincula el nuevo origen al registro compartido de Ventas y sus pagos.
- `StaffMember`: versión de agenda y reglas de comisión de servicios/productos.
- `Service`: comisión opcional específica del servicio.

Se amplía el puerto de Ventas con origen SALON; los rubros no se importan desde sus capas internas. Inventario recibe proveedor opcional y conserva su independencia del salón. Clientes, proveedores, pagos, caja, compras, promociones, roles y sucursales siguen en sus entidades compartidas.

La agenda usa transacciones serializables y actualización de la versión del profesional; los bloqueos se adquieren en orden estable al reasignar. Los cobros participan del bloqueo de Caja y los movimientos optimistas de Inventario. Se incluyen ventas directas en el consumo de operaciones del plan, sin volver a contar ventas provenientes de citas.

La migración corrige el rol Caja únicamente cuando coincide exactamente con los permisos de Restaurante que asignaba la plantilla antigua a una barbería; respeta roles personalizados. El ejecutor compartido incorpora hasta seis intentos con espera breve y variable ante conflictos serializables, verificado con las altas simultáneas de Minimarket y las operaciones concurrentes de Barbería.

## 5. Validaciones y permisos

- Todas las referencias se comprueban contra empresa y sucursal; el cliente es compartido entre sucursales de la misma empresa.
- Horas reales, rango válido, fecha futura para reservas, duración completa dentro del horario, profesional activo y habilitado.
- Sin solapamiento con otra cita vigente ni con ausencias; intervalos contiguos sí son válidos.
- Servicios/productos activos, cantidades positivas y acotadas, stock suficiente, insumos no duplicados y montos enteros en céntimos.
- Pagos suman exactamente el total; efectivo recibido suficiente; vuelto solo para efectivo.
- Separación de edición de agenda y cobro; permisos específicos de descuentos, devoluciones, reportes y liquidación.
- Lectura de datos por sección y permisos, además de controles de navegación. Un rol de recepción no obtiene reportes financieros por llamar al endpoint directamente.
- No se puede desactivar un servicio o retirar profesionales habilitados si quedan citas pendientes afectadas.
- El cambio de sucursal/usuario reinicia el estado de la pantalla y su carrito.

## 6. Interfaz y experiencia

Los nuevos flujos utilizan los componentes existentes de formularios, diálogos, tablas, campos, botones y errores. La venta guía cliente → servicios/productos → distribución del pago. Servicios explica el vínculo con Inventario y la unidad de consumo; Equipo indica cuándo falta configurar horarios. El historial deja visible el detalle del trabajo y las preferencias.

Las pantallas responden a móvil/tablet y las tablas conservan desplazamiento dentro de su contenedor. Los botones de edición se ocultan a roles de consulta, sin depender de eso para la autorización del backend.

## 7. Reportes disponibles y límites de interpretación

- Hoy, últimos 7 y últimos 30 días de la sucursal, con zona horaria del negocio.
- Ventas netas, número de tickets, descuentos y pagos por medio.
- Servicios más realizados y productos más vendidos.
- Producción, cantidad de servicios/productos y comisión por profesional.
- Comisiones pendientes y liquidaciones referenciadas; exportación CSV de producción.
- Clientes nuevos en el período; frecuentes con 3 o más compras; sin volver desde hace 60 días; ocasionales.
- Cancelaciones e inasistencias.
- Margen de contribución: venta neta menos costo de productos/insumos y comisiones. No es utilidad contable y no incluye alquileres, impuestos ni gastos generales.
- Las ventas antiguas sin detalle de costos no forman parte del margen estimado; su importe se informa por separado. No se reconstruyen costos/comisiones con precios actuales.

El historial de visitas comercial cuenta tickets pagados: una compra de productos también cuenta. Las citas están separadas en el expediente. Los datos de segmentación se calculan sobre el historial completo de la sucursal, no sobre una muestra de 50/100 ventas.

## 8. Requisitos para operar desde el primer día

1. Crear sucursal y roles; asignar caja a la persona responsable.
2. Registrar profesionales, horario semanal y descansos.
3. Crear servicios, precios, duración y profesionales habilitados.
4. Registrar inventario inicial o compras, unidades y costos; configurar consumo de insumos por servicio.
5. Publicar precios de productos de venta desde Servicios y productos.
6. Configurar medios de pago, registrar clientes y abrir caja con efectivo físico.
7. Agendar o atender sin cita; cobrar cada servicio con su profesional y registrar productos en el mismo ticket.
8. Revisar diferencias de caja, stock bajo, producción y comisiones al finalizar el día.

Si el negocio necesita emisión electrónica SUNAT desde el sistema para su operación, esa integración debe completarse antes de ofrecerle ese alcance: el ticket interno no reemplaza un comprobante fiscal.

## 9. Segunda etapa: funciones pendientes, sin presentarlas como terminadas

| Función | Trabajo necesario |
|---|---|
| Paquetes/combos de servicios | Composición por servicios, asignación individual, precio/costo/comisión por componente y devolución consistente |
| Membresías y planes frecuentes | Saldo de beneficios, vigencias, límites, cobro/renovación, canjes idempotentes, reversos y contabilidad del prepago |
| Recordatorios automáticos | Consentimiento, proveedor WhatsApp/SMS/correo, outbox, reintentos y registro de entrega; no enviar mensajes sin configuración |
| Reserva pública/depósitos | Disponibilidad pública limitada, protección antiabuso, anticipo, política de cancelación y conciliación |
| Servicios en varios tramos | Una reserva con varios profesionales/servicios y recursos, bloqueos y tiempos de exposición |
| Agenda visual avanzada | Vista semanal por columnas, arrastrar/reprogramar, lista de espera y gestión de sillas/cabinas |
| Importación masiva | Adaptar validación/vista previa de los importadores existentes a servicios, habilidades, clientes y consumos |
| Fiscal del salón | Adaptador del origen SALON al outbox compartido, configuración y pruebas con el proveedor fiscal |
| Compras a crédito y transferencias | Exponer libro compartido de cuentas por pagar, pagos de proveedor y flujo de traslados entre sucursales |
| Devoluciones parciales y reversión de comisiones pagadas | Cantidades por línea, devolución parcial del dinero y saldo del profesional sin alterar liquidaciones |
| Reportes avanzados | Rango arbitrario, comparación de sedes, ocupación, retención por cohortes, gastos generales y rentabilidad contable |

## 10. Evidencia de pruebas y publicación

Ver el registro final `BARBERSHOP-SALON-VALIDATION.md`. No se considera publicada una entrega por el solo hecho de compilar: se verifica el commit desplegado y salud de frontend/backend.
