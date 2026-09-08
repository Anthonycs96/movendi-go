# Reporte de correcciones pendientes: backend y frontend

Fecha: 7 de septiembre de 2026. Proyecto: multi-business-saasV2.

## Alcance y conclusión

El flujo de restaurante ensayado puede operarse desde el frontend: alta, configuración, usuarios, pedido, preparación, cobro, inventario, cierre y reportes. Sigue pendiente completar capacidades necesarias para ofrecerlo como restaurante integral con emisión SUNAT y preparación independiente de cocina/barra.

Este reporte contrasta el código actual con los resultados conservados de la auditoría y sus seguimientos. En esta revisión se inspeccionaron código y registros; no se volvió a ejecutar toda la batería. El alcance es Restaurante y los componentes compartidos afectados, incluida la separación entre empresas y superadministración. No constituye una auditoría exhaustiva de Barbería y Transporte.

Clasificación:

- **Confirmado:** comportamiento o limitación visible en código o en el recorrido ejecutado.
- **Riesgo:** mecanismo susceptible de fallar; falta reproducir el escenario concreto.
- **Validación pendiente:** falta evidencia del entorno o proveedor real; no implica por sí sola un defecto.
- **Alta:** afecta integridad, reglas de negocio o una capacidad crítica ofrecida. **Media:** afecta consulta, claridad, escalabilidad o una capacidad dependiente del alcance contratado.

## Evidencia ya disponible

| Validación | Resultado documentado | Alcance |
| --- | --- | --- |
| Unitarias del seguimiento UI/UX | 32 backend + 18 frontend aprobadas | 50 pruebas; no repetidas en esta revisión documental. |
| Regresión del seguimiento UI/UX | 57 E2E aprobadas al completar las suites | Incluye 5 escenarios del recorrido exclusivamente por frontend y regresión compartida. |
| Separación empresa / plataforma | 19 de plataforma + 6 de validación aprobadas | Último seguimiento: 25 E2E, incluidos tres administradores locales y superadministrador. |
| Regresión ampliada anterior | 132 E2E aprobadas | Incluye otros módulos; no son 132 funciones distintas de Restaurante. |
| Compilación y calidad | Builds, TypeScript y ESLint aprobados en los seguimientos | Ver informes y registros; no demuestra integración externa. |
| Base de datos | 30 migraciones SQLite desde vacío; esquema sin diferencias | PostgreSQL solo tiene validación de esquema, sin ejecución real. |

Las baterías se solapan: **no deben sumarse como pruebas únicas**. Los logs conservan fallos de iteraciones previas; los informes explican sus ajustes y las ejecuciones finales aprobadas.

El recorrido por interfaz verificó administración, mesero, cocina y caja; venta de S/ 40, apertura de S/ 100 y cierre de S/ 140 sin diferencia; consumo de receta, compra de insumos, retiro autorizado, exportación CSV y periodos de reportes. Se revisaron escritorio, móvil y tablet en Chromium. No se observaron excepciones JavaScript ni HTTP 5xx en ese recorrido final.

## Backend: pendientes

| ID / prioridad | Estado y hallazgo | Corrección y criterio de cierre |
| --- | --- | --- |
| B01 — Alta: emisión fiscal | **Confirmado:** `sunatEnvironment` se guarda, pero el emisor utiliza la URL/token configurados sin vincularlos explícitamente a ese ambiente; envía `enviar_automaticamente_a_la_sunat: true`. La clasificación de cada línea está fija en `tipo_de_igv: 1`. **Riesgo:** la secuencia por sede puede repetir serie/número entre sedes del mismo emisor. | Asociar ambiente y credenciales de forma inequívoca; modelar las clasificaciones soportadas; garantizar numeración coherente entre sedes. Validar boleta, factura, descuentos/cargos, rechazo, reintento y XML/CDR con cuenta de pruebas. La etiqueta “Pruebas” actual no basta para garantizar aislamiento. No se afirma que se haya emitido o rechazado un documento real. |
| B02 — Alta: cocina/barra | **Confirmado, capacidad incompleta:** un ticket por pedido; cambiar su estado cambia todas las líneas no canceladas. La impresión sí tiene rutas por área. | Mantener avance por área o línea y calcular el estado agregado del pedido. Probar cocina y barra simultáneas: terminar una bebida no debe terminar los platos. |
| B03 — Alta según operación: inventario y devolución | **Confirmado:** el consumo automático usa la receta vigente al cobrar; no reserva insumos al tomar/preparar el pedido. Existe devolución de inventario, pero falta el circuito integral de reembolso, caja, venta y documento fiscal cuando corresponda. | Definir el momento de reserva/consumo y conservar la receta aplicable. Resolver cancelación de preparados y merma. Implementar devolución integral con permisos, trazabilidad e idempotencia. Probar falta de stock antes de preparar y que un reintento no duplique dinero ni existencias. |
| B04 — Alta para reglas de venta; media para opciones: configuración | **Confirmado en código:** `autoQueue`, `maxDiscountPct` e `includeCancelledOrders` tienen configuración sin consumidor operativo equivalente. Delivery externo, reservas externas, contabilidad y webhook no tienen adaptadores operativos encontrados en el módulo. | Aplicar las reglas en el servidor y probar cada cambio de configuración. Implementar los conectores ofrecidos o retirar su disponibilidad comercial y visual hasta completarlos. No considerar una integración funcionando porque su configuración se guarde. |
| B05 — Media: historial y cierres | **Confirmado:** se entregan hasta 100 pedidos cerrados y 50 ventas. Caja carga la sesión abierta y hasta 50 movimientos; no ofrece el historial completo de cierres en ese flujo. Los pedidos activos sí se conservan. | Añadir consultas paginadas y filtros de servidor para pedidos, ventas, movimientos y cierres. Comprobar que una venta antigua y un cierre previo puedan localizarse desde la interfaz sin consultas manuales. |
| B06 — Media: reportes | **Confirmado:** rankings usan importes de línea; el total general incluye descuentos/cargos. Líneas antiguas sin costo guardado recurren al costo actual. **Riesgo de escala:** se cargan hasta 730 días con detalle para agregar en memoria. | Definir y mostrar bruto/neto, o repartir descuentos/cargos para conciliar. Identificar costos históricos estimados; no inventar costos que nunca se guardaron. Agregar en base de datos o limitar consultas y medir rendimiento con volumen representativo. |
| B07 — Media: cuotas del plan | **Riesgo por revisión estática:** usuarios y operaciones se cuentan antes de crear; dos solicitudes simultáneas pueden superar el límite. No se reprodujo este exceso en una prueba específica. | Hacer atómica la comprobación y el consumo de cuota. Probar solicitudes concurrentes cuando queda una sola plaza u operación disponible. |

## Frontend y UI/UX: pendientes

| ID / prioridad | Estado y hallazgo | Corrección y criterio de cierre |
| --- | --- | --- |
| F01 — Alta: configuración y disponibilidad | **Confirmado:** se pueden configurar capacidades cuyo comportamiento no está conectado, incluidas las de B04. | Mostrar como disponibles únicamente las capacidades implementadas; deshabilitar y explicar las pendientes. Para SUNAT, mostrar el ambiente vinculado a las credenciales y distinguir conexión de emisión verificada. |
| F02 — Alta si existen ambas estaciones: pantalla de cocina | **Confirmado:** la acción representa el ticket completo, sin avance independiente de cocina/barra. | Añadir vista por estación, estados parciales y acciones por línea/área sobre B02. Probar un pedido mixto con dos usuarios. |
| F03 — Alta según operación: devolución integral | **Capacidad incompleta:** hay devolución de stock, pero no un recorrido que concilie toda la devolución comercial. | Incorporar un flujo desde la venta con motivo, conceptos, importe, autorización, resultado y trazabilidad, conectado a B03. Explicar el efecto sobre dinero e insumos. |
| F04 — Media: consulta histórica | **Confirmado:** la paginación visual trabaja con una lista parcial; falta acceso completo a ventas/pedidos antiguos y cierres anteriores. | Conectar búsqueda, fechas y paginación a B05; permitir abrir el detalle y resultado de cierres previos. El aviso del último cierre ya fue corregido, pero no sustituye un historial. |
| F05 — Media: errores de formularios | **Observado:** algunos rechazos muestran “Revisa los datos ingresados” sin señalar el campo. El contenido se conserva y se puede reenviar. | Mostrar mensajes junto al campo, enfocar el primer error y anunciarlo de forma accesible. Probar corrección con teclado y móvil. |
| F06 — Media: selector de sucursales | **Confirmado:** sesión devuelve todas las sedes activas del negocio y el selector las ofrece, aunque el usuario no pueda operar en todas. El backend sí rechaza accesos no autorizados. | Entregar/ofrecer solo las sedes autorizadas y resolver claramente el caso de una sede asignada desactivada. Es una inconsistencia de experiencia, no evidencia de acceso exitoso a datos de otra sede. |
| F07 — Media: interpretación de reportes | **Confirmado por B06:** los rankings y totales no tienen necesariamente la misma base; los costos antiguos pueden ser estimaciones. | Etiquetar bruto/neto y costo estimado, explicar descuentos/cargos y conciliar las cifras que se presenten como equivalentes. Las fechas y periodos del gráfico ya están corregidos. |

Las reservas básicas de mesa funcionan en el alcance ensayado. Una agenda con múltiples reservas, planificación e historial es una ampliación pendiente si se ofrece ese servicio; no debe confundirse con un fallo de la reserva básica. Registrar tarjeta, Yape o Plin tampoco demuestra confirmación bancaria automática: esa integración requiere su propia implementación y validación si forma parte de la oferta.

## Validación externa pendiente

1. **PostgreSQL real:** aplicar migraciones, comprobar restricciones, concurrencia, aislamiento entre empresas/sedes y rendimiento. Las pruebas SQLite no sustituyen esta evidencia.
2. **Proveedores reales de prueba:** emisión fiscal; pagos de suscripción y entrega de correo donde estén contratados. El E2E utilizó billing simulado y correo a log.
3. **Impresoras y red:** salida térmica 58/80 mm, conexión USB/LAN, desconexión y recuperación del agente local en el equipo del cliente.
4. **Compatibilidad y accesibilidad:** Firefox, Safari y dispositivos físicos; recorrido completo por teclado, lector de pantalla y contraste. La evidencia actual es Chromium con varios tamaños de pantalla y mejoras puntuales de accesibilidad.
5. **Preparación operativa:** carga prolongada, restauración de backup, seguridad en staging y aceptación de una jornada por el restaurante piloto. Son verificaciones pendientes, no fallos ya demostrados.
6. **Runtime soportado:** se comprobó Node 22.12.0; `package.json` exige al menos 22.13. Repetir la validación de release en una versión compatible.

## Correcciones que ya no están pendientes

- Crear empresas independientes queda en el centro de control del **superadministrador**. Se retiró el formulario duplicado de Configuración; administradores locales reciben 403 en el backend al intentar crear otra empresa. “Datos de la empresa” edita su negocio. Crear sucursales del negocio sigue siendo una capacidad distinta, sujeta a permisos y límites.
- Se corrigieron permisos de acciones visibles, restricciones del mesero, retiro de caja, permanencia del resultado del cierre y legibilidad de cocina.
- Se corrigieron fechas/periodos del gráfico, cálculos monetarios auditados, reintentos del carrito, conflictos concurrentes de pedidos/cobros/caja y aislamiento de operaciones revisadas.
- Se conserva el costo de nuevas líneas de pedido; la limitación de costos históricos sin datos guardados sigue indicada en B06.

## Orden recomendado

1. Completar B01/F01 antes de ofrecer emisión fiscal y corregir las opciones que prometen comportamientos inexistentes, especialmente límites de descuento.
2. Completar B02/F02 y B03/F03 según el circuito operativo que se vaya a contratar.
3. Resolver historial, reportes, cuotas, sucursales y errores de formularios.
4. Ejecutar las validaciones externas y el piloto antes de dar por listo el lanzamiento completo.

**Conclusión:** la operación diaria ensayada es utilizable desde el frontend; el módulo todavía no está listo para ofrecerse como restaurante completo con SUNAT y cocina/barra independientes. No se asigna un porcentaje de avance porque no existe una matriz exhaustiva cerrada de todas las capacidades comercializadas.

## Referencias y trazabilidad

- [Auditoría técnica y pruebas](RESTAURANT-PRODUCTION-AUDIT.md).
- [Revisión UI/UX, recorrido por roles, capturas y seguimiento de empresas](RESTAURANT-UI-UX-REVIEW.md).
- [Emisión fiscal](../apps/backend/src/modules/restaurant/server/sunat.ts): solicitud al proveedor y reserva/emisión de documentos.
- [Operaciones de restaurante](../apps/backend/src/modules/restaurant/server/commands.ts): ticket, cambios de estado y checkout.
- [Inventario](../apps/backend/src/modules/inventory/server/service.ts): consumo de receta y reversión de movimientos.
- [Configuración](../apps/backend/src/modules/restaurant/server/configuration.ts) y [pantalla de configuración](../apps/frontend/src/modules/restaurant/components/RestaurantConfiguration.tsx).
- [Carga de datos](../apps/backend/src/modules/restaurant/server/data.ts) y [cálculo de reportes](../apps/backend/src/modules/restaurant/server/reports.ts).
- [Cuotas](../apps/backend/src/core/platform/entitlements.ts).
- [Sucursales en sesión](../apps/backend/src/app/api/auth/session/route.ts) y [selector de navegación](../apps/frontend/src/shared/components/layout/AppShell.tsx).
- Resultados: `.codex_tmp/restaurant-ui-backend-unit.log`, `.codex_tmp/restaurant-ui-frontend-unit-final.log`, `.codex_tmp/restaurant-ui-regression-final.log`, `.codex_tmp/restaurant-ui-regression-completion.log`, `.codex_tmp/tenant-platform-boundary.log` y `.codex_tmp/tenant-platform-validation-final.log`.
