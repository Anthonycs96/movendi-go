# Cierre de correcciones de Restaurante

Fecha: 7 de septiembre de 2026, America/Lima.

Seguimiento de [RESTAURANT-PENDING-CORRECTIONS.md](RESTAURANT-PENDING-CORRECTIONS.md). El usuario indicó validar primero lo local y dejar proveedores y equipo para después. Los cambios están implementados en el workspace. Esta tarea no ejecutó despliegues ni emisiones fiscales reales.

Alcance: Restaurante, superadministración y componentes compartidos afectados. Las regresiones compartidas no equivalen a una auditoría exhaustiva de Barbería o Transporte.

## Cambios implementados

| Pendiente | Resultado |
| --- | --- |
| B01 / F01 — Emisión fiscal | Credenciales vinculadas a BETA o PRODUCTION; las antiguas quedan UNVERIFIED. Se impide emitir con ambientes distintos. BETA desactiva el envío automático a SUNAT. Se guardan el payload y la numeración para consultar/reintentar sin renumerar; aceptación y recepción pendiente son estados distintos. Numeración por empresa, tipo y serie, compartida entre sedes. Clasificación gravada, exonerada e inafecta por producto; distribución en centavos de descuentos/cargos y tratamiento del impuesto incluido o adicional. |
| B02 / F02 — Cocina y barra | Área y estado por línea, filtro por estación y acciones independientes. El pedido refleja el avance agregado. Las adiciones conservan el trabajo anterior. Para pedidos antiguos aún abiertos sin snapshot de área se usa la asignación actual del catálogo. Cobrar anticipadamente conserva la comanda hasta su entrega. |
| B03 / F03 — Inventario y devolución | Reserva transaccional al tomar el pedido, receta guardada por línea y consumo sin descontar dos veces. Cancelar libera insumos sin preparar; los preparados se registran como merma. Devolución total desde la venta, con motivo, autorización, confirmación de dinero y destino de insumos. Salida de efectivo en la caja abierta, reversión del consumo recuperable, actualización de venta/puntos de fidelidad y trazabilidad idempotente. Nota de crédito sobre el documento aceptado, con consulta/reintento y archivos disponibles desde la interfaz. El conteo físico conserva las reservas sin preparar y su formulario reutiliza la solicitud cuando se pierde la respuesta. |
| B04 / F01 — Configuración efectiva | Cola manual/automática, límite máximo de descuento y opción de pedidos cancelados aplicada a reportes. Los conectores sin adaptador dejan de ofrecerse como activos y el servidor rechaza su activación. Notificaciones de Restaurante limitadas al canal implementado IN_APP. |
| B05 / F04 — Historial | Consultas de servidor en páginas de 25 registros para pedidos, ventas, cajas/cierres y movimientos, filtradas por empresa/sede, código o motivo y fechas del negocio. Desde el cierre se consultan sus movimientos, importes y responsables. |
| B06 / F07 — Reportes | Rankings conciliados con el importe neto de la venta; ventas devueltas excluidas del resultado neto. Costos históricos sin snapshot identificados como estimados. Lecturas de detalle en lotes de 500, acumulación progresiva y conteos de estados en base de datos. |
| B07 — Cuotas | Bloqueo transaccional de la empresa antes de contar y crear usuarios/operaciones. Aplicado a los puntos de creación compartidos afectados. El reintento idempotente de un pedido ya creado funciona incluso al alcanzar la cuota. |
| F05 — Formularios | Errores de servidor identificados por campo, resumen accesible, foco en el primer error y conservación de los datos. Etiquetas explícitas para campos simples y selectores con búsqueda. |
| F06 — Sucursales | La sesión ofrece al operador de Restaurante su sede asignada. Una asignación desactivada muestra un rechazo claro al iniciar sesión. Los permisos del servidor siguen siendo obligatorios. |
| Empresa / plataforma | Crear empresas independientes corresponde al superadministrador. Configuración del negocio permite editar su empresa y administrar sus sucursales según permisos. Un administrador local no puede crear otra empresa por API. |

Las devoluciones implementadas son **totales**. Tarjeta, transferencia, Yape o Plin requieren devolver y verificar el dinero con el proveedor antes de confirmar el registro: no se anuncia un reembolso bancario automático. Un documento fiscal pendiente debe resolverse antes de devolver la venta. Datos históricos que no guardaron costo, ambiente o payload requieren conciliación; no se reconstruyen como si se conocieran.

El contrato fiscal local se contrastó con los [ejemplos oficiales de integración de NubeFact](https://www.nubefact.com/integracion). Una prueba simulada no sustituye la aceptación de una cuenta real ni certifica el tratamiento tributario del restaurante.

## Evidencia local

- Runtime de las comprobaciones: Node 22.23.2, compatible con el mínimo del proyecto. El Node global del equipo sigue siendo independiente de este runtime local.
- Unitarias: **37 backend y 18 frontend aprobadas**. Incluyen centavos, fechas, series de reportes, clasificación fiscal y estados parciales de preparación.
- SQLite: **79 escenarios funcionales aprobados**: 31 de auditoría, 6 del recorrido por frontend, 6 de configuración, 19 de plataforma, 6 de validación y 11 de flujos compartidos. El escenario adicional verifica el conteo físico con reservas y el reintento del formulario tras perder una respuesta.
- PostgreSQL 17 local: **30 escenarios de auditoría de Restaurante aprobados**, incluidos concurrencia, cuotas, aislamiento, permisos, reservas, devolución, cocina por área, cobro anticipado e historial. Recorrido completo exclusivamente por frontend: **6 aprobados**. Además, 6 de configuración, 19 de plataforma, 6 de validación y 11 de flujos compartidos: **78 escenarios funcionales aprobados** entre las suites.
- Migraciones: **32 SQLite** desde vacío y **12 PostgreSQL**, con comparación sin diferencias frente al esquema correspondiente. PostgreSQL requirió una migración adicional para alinear cinco nombres de índices antiguos.
- Respaldo/restauración PostgreSQL: copia restaurada en otra base desechable; **106 tablas y 189 registros idénticos** al origen.
- Volumen de reportes: **1.500 ventas adicionales**, cinco cálculos completos de **234, 232, 222, 225 y 207 ms**; totales y ranking neto conciliados atravesando varios lotes. Muestra local, no prueba prolongada ni garantía de latencia en producción.
- Conteos y reservas: verificación adicional en PostgreSQL de existencias físicas, reservas pendientes, insumos en preparación y reintento después de otro movimiento; `.codex_tmp/restaurant-reserved-count-pg-final.log`.
- Cuota de usuarios: dos altas concurrentes con una plaza disponible; exactamente una admitida y otra rechazada por límite del plan.
- Servicio fiscal con PostgreSQL y proveedor simulado: BETA sin envío automático, recepción pendiente frente a aceptación, payload y número conservados, exclusión de emisiones concurrentes, devolución y nota de crédito idempotente. Sin llamadas a NubeFact real.
- Dependencias: `npm audit` sin vulnerabilidades reportadas al cierre de la corrección. Se fijó UUID 11.1.1 para ExcelJS y Gaxios; comprobados UUID v4 y escritura/lectura de Excel con formato condicional. Fuente: [aviso del mantenedor de UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
- Compilación de producción, TypeScript y ESLint aprobados. La compilación final del frontend incluye la corrección de contraste del menú oscuro.
- Conciliación final de auditoría: 124 pedidos y 109 ventas; S/ 2.210,00 registrados, S/ 20,00 devueltos y S/ 2.190,00 netos. El archivo `outputs/restaurant-completion-ledger.json` registra `balanced: true` junto a caja e inventario.

Compatibilidad y accesibilidad: **9 de 9 ejecuciones aprobadas**, en Chromium, Firefox y WebKit a 1366, 768 y 390 px. Se recorrieron seis pantallas por combinación y además el modo oscuro en Chromium de escritorio: **60 análisis axe sin infracciones detectadas** de las reglas WCAG 2 A/AA y 2.1 AA seleccionadas. Pasaron navegación por la interfaz, ausencia de errores JavaScript/HTTP 5xx, ausencia de desbordamiento horizontal de página, desplazamiento de tablas con teclado en móvil y apertura/cierre de diálogos con restitución del foco. Se inspeccionaron capturas de cocina, caja/devolución y reportes. Esto no certifica accesibilidad completa ni sustituye Safari/dispositivos físicos o lector de pantalla.

La comprobación definitiva está en `.codex_tmp/restaurant-browser-final.log`: 9 aprobados después de corregir etiquetas, foco y contraste, incluido el menú expandido del modo oscuro. El servidor de pruebas usa HTTPS efímero en loopback para WebKit, conservando las cookies seguras de producción. No se suman ejecuciones repetidas como escenarios únicos.

## Base local y reversibilidad

La base `apps/backend/prisma/dev.db` fue respaldada antes de aplicar las migraciones. Se conservaron **102 tablas existentes y 643 registros**; `integrity_check` y `foreign_key_check` aprobaron. No se ejecutó el seed sobre esta base del usuario.

Respaldo: `backups/sqlite/restaurant-before-completion-20260907-202558.db`. La evidencia del respaldo está en `.codex_tmp/restaurant-local-db-backup.json`. Las pruebas E2E se ejecutan en bases desechables separadas.

Al cierre se dejó el entorno de desarrollo local en `http://localhost:3000`, usando Node 22.23.2 y la base original migrada. Se verificó HTTP 200 en `/login` del frontend y `/api/health` del backend. Registros de ejecución: `.codex_tmp/restaurant-dev-final.log` y `.codex_tmp/restaurant-dev-final.err.log`. El PostgreSQL desechable de auditoría quedó detenido.

## Evidencia y reproducción

- `e2e/restaurant-production-audit.spec.ts`: integridad y reglas del servidor, con conciliación directa final.
- `e2e/restaurant-frontend-journey.spec.ts`: alta/configuración y jornada por roles, sin escrituras manuales por API.
- `e2e/restaurant-browser-accessibility.spec.ts`: motores de navegador, tamaños, teclado y comprobación automatizada WCAG.
- `scripts/check-restaurant-fiscal.mts`: servicio fiscal simulado sobre la base local desechable indicada por su guardia.
- `.codex_tmp/restaurant-completion-pg-final.log`, `.codex_tmp/restaurant-completion-pg-ui-final.log`, `.codex_tmp/restaurant-app-pg-final.log`: ejecuciones PostgreSQL. El primero conserva una interrupción del seed después de las 30 pruebas aprobadas; se corrigió el orden de limpieza de promociones y se continuó la regresión. El flujo compartido de cocina se actualizó para preparar y entregar ambas estaciones; su repetición aprobada está en `restaurant-app-pg-final.log`.
- `.codex_tmp/restaurant-completion-backend-unit-final.log`, `.codex_tmp/restaurant-completion-frontend-unit-final.log`, `.codex_tmp/restaurant-completion-lint-final.log`.
- `.codex_tmp/restaurant-completion-sqlite-shared.log`: regresión funcional compartida aprobada. `.codex_tmp/restaurant-completion-sqlite-final.log`: repetición de auditoría y recorrido frontend, con 31 y 6 aprobados. Ambos conservan fallos de iteraciones previas de la suite de navegadores; su comprobación definitiva se registra por separado en `.codex_tmp/restaurant-browser-final.log`. No se suman repeticiones como escenarios nuevos.
- `.codex_tmp/restaurant-volume-validation.log`, `.codex_tmp/restaurant-restore-validation.log`, `.codex_tmp/restaurant-fiscal-service.log`, `.codex_tmp/restaurant-pg-diff-final.log`, `.codex_tmp/restaurant-migrations-final.log`.
- Capturas: `outputs/restaurant-completion-ui/` y `outputs/restaurant-browser-review/`.

Con Node compatible: `npm run e2e:restaurant:ui`, `npm run e2e:restaurant:audit` y `npm run db:check:migrations`. La suite de navegadores admite `E2E_CROSS_BROWSER=1`; requiere los navegadores de Playwright instalados. `E2E_DATABASE_URL` debe apuntar exclusivamente a una base de pruebas: el runner la migra y reinicia sus datos.

## Etapa posterior acordada

1. Cuenta de pruebas NubeFact: boleta/factura/nota, rechazo real, contingencia y validación de PDF/XML/CDR con los datos fiscales del negocio.
2. Equipos: impresoras físicas 58/80 mm, USB/LAN, desconexión/recuperación y dispositivos reales.
3. Proveedores contratados: pagos de suscripción y entrega real de correo; los E2E usan billing simulado y correo a log.
4. Aceptación operativa: jornada del restaurante piloto, carga prolongada y revisión de seguridad en staging. La revisión automatizada de accesibilidad se complementa con lector de pantalla y dispositivos físicos.

Estas verificaciones externas quedan aplazadas por decisión del usuario. No se declara validado el lanzamiento con proveedores y hardware.
