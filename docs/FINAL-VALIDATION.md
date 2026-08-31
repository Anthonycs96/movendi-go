# Validación final de Movendi Go V2

Fecha: 16 de agosto de 2026.

## Dictamen

**APROBADO para ejecución local y preparación de despliegue.** La solución incluye Core SaaS, Barbería, Restaurante, Transporte/Logística y una consola Super Admin global conectada a la base real. La compilación de producción, el esquema SQLite local y el esquema PostgreSQL generado son válidos.

Railway y Google Cloud Run quedaron configurados en el repositorio, pero un despliegue externo efectivo requiere las cuentas, base PostgreSQL y secretos del propietario; por tanto no se afirma que exista una URL pública ya desplegada.

## Negocios disponibles

| Negocio base | Rubro | Flujo operativo comprobado | Plan inicial |
| --- | --- | --- | --- |
| Nova Studio | Barbería y salón | Clientes, profesionales, horarios, servicios, citas, estados, cobro y caja | Profesional |
| Brasa Norte | Restaurante | Clientes, ambientes, mesas, carta, pedidos, traslado, KDS, cobro y caja | Inicial / prueba |
| Andes Cargo | Transporte y logística | Maestros, rutas, flota, jornadas, viajes, tracking, finanzas, combustible, mantenimiento, repuestos y neumáticos | Profesional |

El catálogo de plataforma permite crear nuevos tenants de los tres rubros. La prueba global creó además un restaurante temporal completo, ingresó con su administrador y luego el seed final restauró la base E2E a los tres negocios base.

## Consola Super Admin implementada

Ruta: `/platform/dashboard`. Acceso local: `superadmin@multisaas.local`, contraseña `Nexo2026!`, usando `nova-studio` o `brasa-norte` para iniciar la sesión.

| Sección | Capacidades verificadas |
| --- | --- |
| Resumen | Total/estado de negocios, MRR, operaciones y ventas del mes, distribución por plan y salud comercial. |
| Negocios | Búsqueda/filtros, detalle, consumo, edición regional/comercial, suspensión y reactivación con protección del tenant actual. |
| Planes | Crear y editar precio, límites, disponibilidad y beneficios. |
| Suscripciones | Asignar plan, estado, periodo de prueba, vencimiento y cancelación al fin de ciclo. |
| Cobranza | Checkout, facturas, pagos, eventos idempotentes, fallos y correo transaccional. |
| Equipo | Crear accesos globales y gestionar rol/estado. |
| Auditoría | Actividad consolidada de todos los tenants y acciones de plataforma. |
| Rubros y módulos | Catálogo funcional de Barbería/Salón, Restaurante y Transporte/Logística. |
| Configuración | Estado de aislamiento, auditoría, suscripciones, catálogo y preparación de despliegue. |

La interfaz fue comprobada en tema claro y oscuro y conserva el diseño profesional, responsive y accesible del sistema V2.

## Pruebas ejecutadas

| Batería | Resultado |
| --- | --- |
| Super Admin global | **15/15**: seguridad, navegación de 8 secciones, métricas, filtros, suspensión/reactivación, suscripción y alta completa de tenant. |
| Escenarios generales | **40/40**: autenticación, RBAC, aislamiento, validaciones, vistas y responsive. |
| Atenciones transaccionales | **40/40**: ciclos reales de Barbería y Restaurante, incluidos 6 medios de pago por vertical. |
| Transporte y logística | **30/30**: 11 áreas, cuatro perfiles, aislamiento, CRUD operativo, descansos, solapamientos, tracking, liquidación, combustible, OT, inventario y neumáticos. |
| Escala / Fase 2 | **10/10**: consultas paginadas, filtros de servidor, importación, exportaciones y cola. |
| Confiabilidad / Fase 3 | **15/15**: health, readiness, request ID, alertas, reintentos, concurrencia y recuperación. |
| Almacenamiento / Fase 4 | **16/16**: validación binaria, aislamiento, descargas, objetos, expiración y métricas. |
| Comercial / Fase 5 | **22/22**: planes públicos, checkout, firma, aprovisionamiento, idempotencia, deuda, recuperación, cancelación, RBAC y outbox. |
| Recorridos críticos adicionales | **6/6**: acceso, ciclos completos, RBAC, aislamiento y visual responsive. |
| Validación ampliada | **6/6**: CRUD lógico, reglas negativas, administración, tablas, modales, temas y matriz responsive. |
| Total E2E validado | **200/200** escenarios ejecutables aprobados; 1 comparación viva opcional se omitió porque el original no estaba levantado. |
| Pruebas unitarias | **5/5 PASS**. |
| ESLint | **PASS**. |
| TypeScript | **PASS**. |
| Build Next.js 16.3.1 | **PASS**. |
| Prisma SQLite | Migración, seed y consultas **PASS**. |
| Prisma PostgreSQL | Esquema generado y validado de **54 modelos**, incluidos **23 de Transporte** y 7 comerciales: **PASS**. |
| Healthcheck localhost | HTTP 200, base `reachable`. |
| Healthcheck IP `192.168.1.119` | HTTP 200, base `reachable`. |
| Login local Transporte | `admin@andes.local` → `/t/andes-cargo/dashboard`, tenant `TRANSPORT`, dashboard HTTP 200: **PASS**. |

## Estado de datos tras las pruebas

La base desechable `e2e.db` quedó restaurada. La base principal `dev.db` no recibió las transacciones temporales de Playwright; después de crear un backup recuperable se restauró deliberadamente al seed vigente para incluir `nova-studio`, `brasa-norte` y `andes-cargo`. La aplicación local puede levantarse en:

- `http://localhost:3000`
- `http://192.168.1.119:3000` en la red validada, con `npm run dev:network`
- Salud: `http://localhost:3000/api/frontend-health`

## Defectos encontrados y corregidos durante la validación

- Se corrigió el layout que seleccionaba el manifiesto de Restaurante para tenants de Transporte; ahora los 11 enlaces operativos se verifican explícitamente.
- Se sustituyó la carga completa de Transporte en cada pantalla por planes de consulta por sección, con reducciones de respuesta de hasta 85% en la base validada.
- Se incorporaron rate limiting persistente, límites de plan/suscripción, headers de seguridad, medición `Server-Timing`, estado de carga accesible y backup local no destructivo.
- Se eliminó la concentración técnica de Transporte: el workspace de ~42 KB quedó como selector de 1,6 KB y el archivo de comandos de ~40 KB como despachador de 1,2 KB; la implementación vive ahora en módulos por dominio.
- Se corrigió el cálculo de ciclos de trabajo/descanso para usar componentes UTC estables y evaluar la fecha real del viaje.
- Se corrigió el enrutamiento de movimientos de inventario y eventos de neumáticos para que no fueran interceptados por el alta del recurso padre.
- Se corrigió el runner E2E de Windows para no invocar rutas de Node con `shell` y para trabajar sobre `e2e.db` aislada.
- Se estabilizó la prueba de entrega de Cocina: ahora comprueba que la comanda sale del KDS y que el pedido persiste como servido, en lugar de buscar un mensaje dentro de una tarjeta ya desmontada.
- Se corrigió el alta rápida de empresas sin `planId`: ahora asigna el plan activo de entrada y evita crear tenants que luego no podían escribir por falta de entitlement.
- Se sustituyeron los estados comerciales puramente administrativos por checkout, suscripción histórica, facturas, pagos, webhooks idempotentes y outbox de correo.

Cada flujo afectado fue repetido después de su corrección. Tras la modularización y Fase 5, la batería específica de Transporte volvió a aprobar 30/30 escenarios y la evidencia consolidada alcanzó 200/200 aprobados.

## Límites externos pendientes

- Desplegar realmente en una cuenta Railway o Google Cloud y comprobar su URL pública.
- Conectar claves sandbox/live de Stripe y registrar el webhook público; el adaptador, la firma y los eventos ya están implementados.
- Conectar un proveedor real de correo al adaptador webhook; el outbox, reintentos y retención ya están implementados.
- Configurar PostgreSQL, almacenamiento, secretos, dominio/HTTPS, backups y observabilidad en las cuentas externas.
- Probar Firefox, WebKit/Safari y dispositivos físicos; la batería automatizada usó Chromium.
- Integrar recuperación de contraseña, SUNAT/GRE, GPS externo y telemetría si pasan a formar parte del producto.

Estos pendientes no afectan la operación local validada ni la preparación técnica incluida en `Dockerfile.frontend`, `Dockerfile.backend`, `railway.frontend.json`, `railway.backend.json`, `cloudbuild.yaml` y `docs/DEPLOYMENT.md`.

El comando `npm run e2e` copia primero `dev.db` a `e2e.db`, restaura el seed antes de cada archivo y nuevamente al terminar. Esto evita contaminación entre suites sin destruir la base principal. `npm run e2e:transport:30` repite sólo el bloque de Transporte con el mismo aislamiento.
