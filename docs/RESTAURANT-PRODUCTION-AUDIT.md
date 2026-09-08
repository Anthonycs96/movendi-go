# Auditoría técnica y funcional de Restaurante

Periodo de trabajo: 6–7 de septiembre de 2026, America/Lima. Alcance: código local de `multi-business-saasV2`, Superadmin, Restaurante y componentes compartidos afectados. No se desplegó código ni se modificó una base de producción.

## Estado general

El flujo local de alta, configuración y operación puede ejecutarse mediante interfaces y APIs del producto. Se encontraron y corrigieron fallos de integridad, autorización, reintentos y cálculo del tablero. La existencia del asistente y su estado `READY` no certifica el módulo completo: quedan defectos y capacidades incompletas en facturación electrónica, separación de preparación por área y otras opciones configurables.

Esta auditoría distingue tres tipos de evidencia: ejecución real de navegador/API/base de datos; revisión estática del código; y validaciones externas pendientes. No equivale a una certificación fiscal, una prueba de carga en producción ni una garantía de ausencia de vulnerabilidades.

## Entorno y método

- Dos aplicaciones Next.js 16.3.1: frontend con BFF `/api/*`, backend con autenticación, autorización y módulos de negocio. Contratos compartidos en `packages/contracts`; Prisma para persistencia.
- Se leyeron las instrucciones AGENTS y la documentación instalada de Next.js antes de editar. Se utilizó la guía Playwright del proyecto.
- Builds optimizados y servidores locales independientes: frontend 3100, backend 3001. Navegador Chromium. SQLite aislado en `apps/backend/prisma/restaurant-audit.db`.
- La base se preparó con migraciones y seed local. El restaurante auditado, sus usuarios, carta, mesas, insumos y recetas se crearon mediante UI/APIs reales. No se insertaron registros comerciales a mano en SQL.
- La prueba de sesión expirada y la de concesión de impresión vencida sí alteran deliberadamente fechas en la base aislada para inyectar esas fallas. La conciliación final es de solo lectura.
- Las peticiones del carrito llegaron al backend real; se interrumpió su respuesta después de confirmar la escritura para simular pérdida temporal de conexión.
- Billing `mock`, correo `log` y almacenamiento local se limitaron al entorno E2E. No se cobraron tarjetas ni se enviaron comprobantes o correos reales.

## Funcionalidades y cobertura

| Área | Comprobación realizada | Límite de la evidencia |
| --- | --- | --- |
| Superadmin | Login, rutas protegidas, directorio/filtro, suspensión/reactivación, suscripción, creación de tenant y acceso del administrador | No se verificó un pago real del plan |
| Alta de Restaurante | Restaurante nuevo desde formulario; empresa/sede, módulos, cocina/barra, categorías/platos, mesas, roles, usuarios y 13 etapas hasta READY | La suite de configuración recorre el asistente en navegador; la suite operativa combina alta UI con configuración por API |
| Configuración | Reglas centrales/por módulo, versionado por sede, permisos, catálogo grande y materialización de áreas | Guardar una opción no demuestra que exista su integración externa |
| Usuarios y roles | Administrador, mesero, cajero, cocina; cambio obligatorio de contraseña temporal; acceso denegado según rol | No es una enumeración exhaustiva de cada combinación posible de permisos personalizados |
| Multitenancy | Uso de IDs reales de otro negocio en productos/clientes; acceso anónimo; restricción de cambio de sede del cajero | El aislamiento depende principalmente del scope de aplicación; no se validó RLS en PostgreSQL |
| Salón y reservas | Capacidad, reserva/recepción, rechazo de mesa ocupada, traslado, cancelación y limpieza; repetición y concurrencia de reservas | La reserva vive en la mesa; no existe agenda multirreserva con historial completo |
| Carta y carrito | Catálogos del onboarding, formulario/búsqueda, notas, creación y adiciones, reintento después de perder respuesta | No se ensayaron todos los dispositivos físicos ni todas las combinaciones de promociones |
| Cocina y barra | Productos de ambas áreas, ticket, PREPARING/READY/SERVED, cancelación y sincronización de líneas | El KDS comparte el estado del pedido completo; no prueba preparación independiente por área |
| Delivery y clientes | Cliente creado/buscado en formulario, teléfono/dirección, cargo delivery, despacho, entrega y cobro | Delivery interno; no conecta un operador logístico externo |
| Ventas y caja | Pago mixto, efectivo/tarjeta, permisos, doble cobro concurrente, entradas/salidas, cierre y apertura concurrente | Tarjeta/Yape/Plin son registros del medio recibido, no validación bancaria del abono |
| Inventario | Insumos/recetas, consumo al cobrar, compra repetida, conteo repetido, reposición y stock insuficiente con rollback | No reserva stock al tomar pedido; no registra automáticamente merma por anular comida preparada |
| Reportes y dashboard | Más de 100 pedidos, más de 50 ventas, pedido antiguo aún activo, suma completa, costo histórico, corte por zona horaria | Sin prueba de carga de miles de tenants; historial de pantalla acotado |
| Impresión | Rutas/credenciales en configuración; cola, exclusión entre estaciones, fallo/reintento, confirmación y vencimiento de lease | No se imprimió papel ni se probó una impresora térmica/agente físico |
| SUNAT | Configuración, acceso por permisos y protección del token | No hubo emisión externa, XML/CDR aceptado ni homologación |
| Frontend | 11 secciones a 1440, 768 y 390 px: respuesta 200, contenido y ausencia de errores JS/desborde horizontal; formularios/modales/búsqueda en flujos | No es auditoría exhaustiva de accesibilidad o comparación visual píxel a píxel |

## Fallos corregidos

La severidad corresponde al riesgo anterior a la corrección. La columna de comprobación evita presentar una revisión de código como prueba de fallo en producción.

| Hallazgo / severidad | Causa raíz | Corrección | Comprobación |
| --- | --- | --- | --- |
| Pedidos concurrentes con importe distinto de sus líneas — crítica | Mutaciones calculadas a partir de lecturas previas sin control de versión | Versión del pedido, actualización condicional y transacción con reintento | Adiciones simultáneas; el total coincide con todas las líneas aceptadas |
| Cierre de pedido sin venta — alta | La ruta genérica de estados admitía COMPLETED | COMPLETED requiere checkout | Solicitud directa devuelve 409; pedido no queda cerrado sin venta |
| Autorización de cobro incorrecta — alta | Checkout heredaba permiso de escritura de pedidos | Requiere `restaurant:cash:write`; emisión requiere `restaurant:sunat:write` | Mesero ya autenticado y con contraseña renovada recibe FORBIDDEN; cajero cobra |
| Duplicados por reintento — alta | Creación/adiciones sin clave persistente; guardas UI solo basadas en render | Claves idempotentes, hash de payload, unicidad; referencias y guardas síncronas en UI | Mismo ID al repetir; payload diferente con misma clave rechazado; pérdida de respuesta no duplica pedido |
| Riesgo de doble cobro y carrera con caja — crítica | Lecturas previas y escrituras separadas | Reclamo de versión, venta/pagos/stock/caja en transacción y actualización condicional de caja abierta | Dos cobros: un éxito y un conflicto; conciliación de venta/pagos/inventario |
| Dos cajas abiertas y cierre con saldo cambiado — alta | Restricción solo en aplicación | Índice único parcial y cierre condicionado al saldo leído | Dos aperturas: 200/409; caja y movimientos conciliados |
| Repetir movimiento/conteo de inventario — alta | No se identificaba un conteo sin diferencias; reutilización de claves sin comprobar payload | Identidad estable del documento y validación de contenido | Repetir conteo después de reponer stock conserva mismo documento y stock posterior |
| Repetir movimiento de caja — alta | Sin identidad estable de solicitud | ID derivado de sede/caja/clave y validación de tipo, importe y motivo | Entrada repetida suma una sola vez; saldo final correcto |
| Módulo deshabilitado accesible directamente — alta | Navegación ocultaba módulo sin bloqueo equivalente en rutas | Comprobación de módulo en operaciones y sección de datos | Inventario deshabilitado rechaza lectura/escritura por API |
| Cambio a sucursal no asignada — alta | Solo se comprobaba que la sede perteneciera al tenant | Comprueba asignación para usuarios de restaurante sin administración; valida rol/tenant de sesión | Cajero asignado recibe BRANCH_ACCESS_DENIED |
| Dashboard incompleto y pedidos activos invisibles — alta | Métricas derivadas de ventas limitadas a 50 y pedidos limitados a 100 | Agregado DB para ingresos y consulta separada de todos los pedidos activos | Se crean/cobran 102 pedidos adicionales; suma completa y pedido antiguo aún visible en cocina |
| Corte diario incorrecto — media | Día calculado sin corte comercial/zona del negocio | Función de día comercial por timezone y hora de corte | Tres tests: Lima, corte horario y cambio DST de Nueva York |
| Utilidad histórica mutable — alta | Reportes multiplicaban por costo actual del producto | Snapshot nullable del costo en la línea del pedido | Cambiar costo a 99 conserva métricas de ventas anteriores; después se restaura catálogo |
| Reportes costosos en cada pantalla — media | Se pasaba null en lugar de undefined y se ejecutaba el reporte completo | Solo se calcula al pedir la sección reports | Dashboard entrega reports null; reports entrega métricas |
| Alta parcialmente inicializada — alta | Inicialización de negocio fuera de transacción del tenant | Alta y configuración inicial comparten transacción | Alta E2E completa; no se realizó inyección específica de fallo intermedio |
| Rol aprobador inexistente en plantilla simple — media | Configuración requería MANAGER y la plantilla no lo creaba | Plantilla incluye MANAGER | Asistente de 13 pasos y validación READY |
| Reserva repetida podía liberarse / carreras de mesa — alta | Toggle por estado leído y actualización no condicionada | Reenvío con datos rechazado; reservar/recibir/limpiar/desactivar comprueban estado al escribir | Reenvío 409; reservas simultáneas 200/409; mesa sigue reservada |
| Confirmación de impresión con concesión vencida — media | Se comprobaba estación/estado, pero no vencimiento | Confirmación exige lease vigente | Vencimiento inyectado: confirmación 409 y recuperación por otra estación |
| Colisión eventual de códigos — media | Sufijo corto del timestamp repetible | Timestamp completo más componente aleatorio | Alta masiva y unicidad aplicada por base; no prueba probabilística exhaustiva |
| Desborde de configuración en desktop — media | Reglas de layout compartidas imponían anchos mínimos | Grid/flex mínimos y ajuste responsive circunscritos al módulo | 33 combinaciones sección/tamaño sin desborde |
| Descuadre de céntimos en comprobante — alta | Redondeo independiente de líneas y precio unitario reducido a dos decimales | Distribución determinista de restos con enteros; bases e impuestos suman el total; mayor precisión unitaria | Tres tests de asignación, límites, importes grandes, ceros y suma de impuestos; aceptación externa pendiente |
| Tasa cero sustituida por 18 — alta | Uso de `taxRatePct || 18` | Se conserva la tasa configurada al calcular importes | Caso de tasa cero en el cálculo utilizado por el emisor; clasificación tributaria aún pendiente |
| Runner E2E frágil — media | Dependencia de npm/cmd y reutilización implícita de servidor | Node directo, migración antes del seed, procesos locales propios y comprobación de puertos | Suites ejecutadas sobre builds de producción y base aislada |

Nota sobre evidencia inicial: una primera comprobación del mesero encontró el bloqueo por contraseña temporal. No se cuenta ese resultado como evidencia de cobro sin permisos. La regresión final renueva la contraseña y exige específicamente el error FORBIDDEN.

## Pendientes y riesgos para lanzamiento

### 1. Facturación electrónica — alta, bloqueante para venderla como funcionalidad completa

Revisión de `apps/backend/src/modules/restaurant/server/sunat.ts` y `configuration.ts`:

- `sunatEnvironment` se guarda como BETA/PRODUCTION, pero la solicitud usa la misma credencial/URL y envía `enviar_automaticamente_a_la_sunat: true`. Seleccionar “Pruebas” no garantiza aislamiento del destino configurado.
- La clasificación tributaria por línea permanece fija en `tipo_de_igv: 1`; no se implementó una selección de gravada/exonerada/inafecta por producto. Corregir la aritmética de tasa cero no certifica esos regímenes.
- Se corrigió el prorrateo: tres líneas de 100 céntimos y total final de 100 ahora distribuyen 34 + 33 + 33 = 100. El precio unitario conserva mayor precisión. Falta validar el payload resultante con el proveedor, incluidos descuentos, delivery y clasificación fiscal. No se afirma que NubeFact haya aceptado o rechazado un comprobante: no se emitió uno real.
- La secuencia se identifica por tenant/sede/tipo/serie. Debe comprobarse que dos sedes del mismo emisor no reutilicen serie y número ante el proveedor.
- Una consulta de prueba exitosa y el estado CONNECTED no equivalen a aceptación de un comprobante por SUNAT.

Cerrar requiere definir los escenarios fiscales soportados, validar composición/series, vincular de forma inequívoca credenciales al ambiente y verificar boleta, factura, rechazo, reintento y XML/CDR con cuenta de pruebas. La documentación oficial presenta la integración mediante ruta, token y trama JSON/TXT, con ejemplos de operaciones de distinta clasificación; esa cobertura debe comprobarse en el producto. [Integración oficial NubeFact](https://www.nubefact.com/integracion). No se inventaron respuestas fiscales ni se utilizaron credenciales de producción para simular aceptación.

### 2. Cocina y barra independientes — alta para restaurantes que operan ambas estaciones

El modelo mantiene un KitchenTicket por pedido y la transición actualiza todas sus líneas. La impresión avanzada sí enruta por áreas, pero el KDS no mantiene un avance independiente de cocina y barra. Completar una bebida puede representar como listos platos aún sin terminar si el usuario interpreta la acción como propia de su estación. Falta un flujo por área/línea con agregación del estado del pedido y su prueba multiactor. No se añadió una segunda arquitectura de tickets como parche dentro de esta auditoría.

### 3. Configuración que excede la ejecución disponible — media

Los campos para proveedor externo de delivery, reservas, contabilidad y webhook se persisten, sin adaptadores operativos encontrados en el módulo. Las notificaciones de restaurante consultadas se producen dentro de la aplicación; configurar EMAIL/SMS/WEBHOOK no implementa su entrega. Se detectaron opciones sin consumidor operativo equivalente, como `kitchen.autoQueue`, `sales.maxDiscountPct` y `reports.includeCancelledOrders`. Deben implementarse con aceptación propia o presentarse explícitamente como no disponibles. No deben comercializarse por el mero hecho de aparecer en configuración.

### 4. Inventario y devoluciones — media/alta según operación contratada

El consumo ocurre al cobrar con la receta vigente en ese momento. Es posible tomar/preparar un pedido y encontrar stock insuficiente recién en caja; la prueba verifica rollback, no reserva previa de insumos. No existe un circuito completo de devolución que concilie reembolso, caja, inventario y nota de crédito. La anulación de un pedido preparado tampoco equivale automáticamente a merma. Definir y probar estos procedimientos antes de operar establecimientos que los necesiten.

### 5. Historial, reportes y escala — media

Las pantallas reciben hasta 100 pedidos cerrados recientes y 50 ventas; la paginación visual no recupera todo el historial del servidor. Los activos se preservaron, pero el historial necesita filtros y paginación de backend. El reporte carga hasta 730 días con líneas en memoria. El costo de líneas anteriores a esta migración queda NULL y usa costo actual como estimación; no es posible reconstruirlo de forma fiable con datos que nunca se guardaron. Rankings de productos/categorías usan importe bruto de línea, mientras el total general incluye descuentos/cargos: no deben interpretarse como una conciliación neta exacta por producto.

### 6. Aislamiento, cuotas y operación real — verificaciones pendientes

- PostgreSQL: esquemas/migraciones revisados y schema validado; no se ejecutó un servidor PostgreSQL real. La concurrencia demostrada aquí corresponde a SQLite local.
- Las cuotas de operaciones se leen antes de la escritura y pueden sobrepasarse con concurrencia; no se ensayó ni corrigió un contador transaccional global de cuotas. El cobro de un pedido existente dejó de contar como operación nueva.
- La lista de sedes conserva todas las sedes activas del negocio aunque el cajero no pueda cambiarse a ellas. Revisar experiencia de usuarios cuya sede asignada se desactive.
- No se hicieron pentest completo, pruebas prolongadas de carga, restauración de backup de producción ni validación de infraestructura desplegada.
- Falta prueba en impresoras y red del cliente, incluidas desconexión/reconexión del agente local y salida térmica de 58/80 mm.
- Runtime usado: Node 22.12.0, inferior al mínimo declarado 22.13. Las verificaciones locales realizadas no sustituyen repetir release con versión soportada. Se observaron avisos `punycode` de dependencias.

## Base de datos y compatibilidad

Se agregaron tres migraciones equivalentes SQLite/PostgreSQL:

1. `20260907020000_restaurant_integrity`: versión, clave/hash idempotente del pedido; unicidad de solicitud; una caja abierta por tenant/sede.
2. `20260907023000_restaurant_order_requests`: solicitudes de adición con clave única por pedido, FK y borrado en cascada.
3. `20260907030000_restaurant_cost_snapshot`: costo nullable de línea para no inventar costos históricos.

Las 30 migraciones SQLite se aplicaron desde una base vacía y `migrate diff --exit-code` no encontró diferencias con el esquema. La conciliación ejecuta también `PRAGMA foreign_key_check`. Las relaciones operativas preservan historia mediante estados/desactivación; no se introdujo borrado masivo.

Antes de aplicar el índice de caja en un ambiente existente, consultar:

```sql
SELECT "tenantId", "branchId", COUNT(*)
FROM "CashSession"
WHERE "status" = 'OPEN'
GROUP BY "tenantId", "branchId"
HAVING COUNT(*) > 1;
```

Si hay filas, conciliar y cerrar cajas con el responsable antes de migrar. La migración falla ante duplicados; no elimina saldos automáticamente. Hacer backup y probar restauración/migraciones en una copia de staging. El código requiere las nuevas columnas: aplicar la migración antes de activar el build. No se ejecutaron esas acciones sobre producción.

## Resultados y evidencia

| Verificación | Resultado |
| --- | --- |
| Superadmin | 15/15 E2E aprobadas |
| Configuración integral Restaurante | 6/6 E2E aprobadas |
| Flujos críticos generales | 11/11 E2E aprobadas |
| Atenciones transaccionales compartidas | 40/40 E2E aprobadas |
| Matriz de escenarios y variantes | 40/40 E2E aprobadas |
| Nueva auditoría Restaurante | 20/20 E2E aprobadas |
| Total de regresión ampliada | **132/132**, sin retries configurados |
| Tests backend | **29/29** |
| Tests frontend | **18/18** |
| Migraciones SQLite desde vacío | **30 aplicadas**, sin diferencia con schema |
| Schema PostgreSQL | Válido; ejecución en PostgreSQL pendiente |
| Typecheck | Backend, frontend y contratos aprobados |
| ESLint y diff | Aprobados; `git diff --check` sin errores |
| Build final y repetición tras ajuste fiscal | **Backend y frontend compilan**; auditoría repetida **20/20** aprobada |

Evidencia conservada:

- `.codex_tmp/restaurant-regression-final.log`: las seis suites E2E y sus builds. Las suites de 40 incluyen regresión de Barbería; no son 132 funcionalidades distintas de Restaurante.
- `.codex_tmp/restaurant-release-audit.log`: build/repetición final después del último ajuste fiscal.
- `.codex_tmp/restaurant-backend-tests-final.log` y `restaurant-frontend-tests-final.log`: **47 tests unitarios aprobados** en total.
- `.codex_tmp/restaurant-migrations-final.log` y `restaurant-postgresql-validate.log`: comprobaciones de esquema.
- `.codex_tmp/restaurant-*-typecheck-final.log` y `restaurant-lint-final.log`: comprobaciones estáticas.
- [restaurant-audit-ledger.json](restaurant-audit-ledger.json): conciliación del tenant sintético `audit-mtqkwtwz`: **115 pedidos, 106 ventas, S/ 2 150,00 vendidos**, estado READY y `balanced: true`. La caja cerrada concilia S/ 130,00 esperados y contados; la segunda caja se abrió para continuar las pruebas y quedó abierta con S/ 100,00. Stock final: insumo 895, conteo 15, insumo escaso 0. No hay violaciones de claves foráneas en la comprobación.

La última regresión ampliada aprobó también las comprobaciones de stock insuficiente, 200/409 en cobros/aperturas/reservas concurrentes, reintento del carrito, cesión de impresión vencida y sesión expirada. Una iteración anterior falló porque el escenario desactivaba/reactivaba módulos y dejaba el onboarding en DRAFT: el fixture ahora vuelve a ejecutar REVIEW antes de exigir READY. No fue una discrepancia de saldos del producto.

Los conflictos controlados pueden producir logs Prisma por restricciones únicas; un caso negativo aprobado exige la respuesta esperada y la integridad final. En la prueba de catálogo se provocan rollbacks deliberados. No se cuentan esos logs por sí solos como ventas perdidas ni se ocultan pruebas fallidas: los registros de iteraciones anteriores permanecen en `.codex_tmp`.

## Archivos modificados y pruebas

- `apps/backend/prisma/migrations/20260907020000_restaurant_integrity/migration.sql`
- `apps/backend/prisma/migrations/20260907023000_restaurant_order_requests/migration.sql`
- `apps/backend/prisma/migrations/20260907030000_restaurant_cost_snapshot/migration.sql`
- `apps/backend/prisma/postgresql/migrations/20260907020000_restaurant_integrity/migration.sql`
- `apps/backend/prisma/postgresql/migrations/20260907023000_restaurant_order_requests/migration.sql`
- `apps/backend/prisma/postgresql/migrations/20260907030000_restaurant_cost_snapshot/migration.sql`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/app/api/data/tenant/route.ts`
- `apps/backend/src/app/api/operations/[...segments]/route.ts`
- `apps/backend/src/core/auth/session.ts`
- `apps/backend/src/core/platform/commands.ts`
- `apps/backend/src/core/platform/onboarding.ts`
- `apps/backend/src/modules/inventory/server/commands.ts`
- `apps/backend/src/modules/inventory/server/service.ts`
- `apps/backend/src/modules/restaurant/server/access.ts`
- `apps/backend/src/modules/restaurant/server/business-day.test.ts`
- `apps/backend/src/modules/restaurant/server/business-day.ts`
- `apps/backend/src/modules/restaurant/server/commands.ts`
- `apps/backend/src/modules/restaurant/server/data.ts`
- `apps/backend/src/modules/restaurant/server/reports.ts`
- `apps/backend/src/modules/restaurant/server/sunat.ts`
- `apps/backend/src/modules/restaurant/server/money-allocation.ts`
- `apps/backend/src/modules/restaurant/server/money-allocation.test.ts`
- `apps/frontend/src/app/globals.css`
- `apps/frontend/src/modules/restaurant/components/FloorWorkspace.tsx`
- `apps/frontend/src/modules/restaurant/components/RestaurantConfiguration.tsx`
- `apps/frontend/src/shared/components/ui/OperationForm.tsx`
- `docs/RESTAURANT-PRODUCTION-AUDIT.md`
- `docs/restaurant-audit-ledger.json`
- `e2e/restaurant-configuration.spec.ts`
- `e2e/restaurant-production-audit.spec.ts`
- `package.json`
- `playwright.config.ts`
- `scripts/run-e2e.mjs`

Se agregaron 20 escenarios E2E de auditoría, tres tests del día comercial y tres de cálculo monetario. Se actualizó el fixture de configuración para habilitar explícitamente los módulos que usa. Se preservaron los archivos previos del usuario en outputs, .codex_tmp y su presentación.

Reproducción del núcleo de auditoría:

```powershell
$env:E2E_DATABASE_URL='file:C:/ruta/al/proyecto/apps/backend/prisma/restaurant-audit.db'
node scripts/run-e2e.mjs e2e/platform-superadmin.spec.ts e2e/restaurant-configuration.spec.ts e2e/restaurant-production-audit.spec.ts
```

Usar exclusivamente una base desechable: el runner aplica migraciones y restablece datos entre suites. No apuntar E2E_DATABASE_URL a producción. El script de package `e2e:restaurant:audit` ejecuta esas suites.

## Seguimiento: operación íntegra desde el frontend

Se añadió una [revisión de UI/UX y operación por roles](RESTAURANT-UI-UX-REVIEW.md), con un restaurante creado desde cero por el asistente visual. Incluye administración, mesero, cocina, cajero, móvil, tablet, inventario, reportes y exportación.

La revisión corrigió controles que ofrecían operaciones sin permiso, la visibilidad del retiro de caja, la permanencia del resultado del cierre, nombres accesibles en navegación, legibilidad de comandas y fechas/periodos del gráfico. Los reportes ahora utilizan días del calendario local y el rango elegido. Se añadieron tres pruebas unitarias de series temporales, incluyendo medianoche y cambio horario.

Los límites fiscales, de preparación por áreas e integraciones señalados en este informe siguen vigentes. El detalle y las evidencias del seguimiento se documentan en el informe de UI/UX.

## Recomendación de salida

Completar primero el circuito fiscal y la independencia de preparación, delimitar las integraciones realmente soportadas, probar PostgreSQL y hardware en staging, y repetir la jornada con aceptación del restaurante piloto. Los arreglos de integridad son necesarios y la jornada local aporta evidencia útil, pero no resuelven esas capacidades pendientes. No se recomienda vender el módulo actual como un restaurante completo con SUNAT y cocina/barra independientes.

**VEREDICTO: NO LISTO PARA VENDER**

La evidencia respalda que la operación local ensayada puede registrar pedidos, cobrarlos y conciliar sus datos después de las correcciones. El veredicto se debe a flujos críticos todavía incompletos y defectos fiscales identificados en código, junto con validaciones externas pendientes; no se basa únicamente en si compila o carga una pantalla.
