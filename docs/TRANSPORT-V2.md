# Informe funcional — Transporte V2

Fecha de validación: 16 de agosto de 2026.

## Resultado

El vertical **Transporte y logística** está operativo en local con persistencia Prisma, aislamiento multi-tenant, permisos por rol y una interfaz responsive integrada al mismo Core SaaS de Barbería y Restaurante. El tenant demostrativo es `andes-cargo`.

La última repetición específica terminó con **30/30 escenarios aprobados en Chromium**. La regresión existente de Core, Super Admin, Barbería y Restaurante mantiene **107/107 aprobados**. También aprobaron 5/5 pruebas unitarias, TypeScript, ESLint y los builds de producción de frontend y backend.

## Comparación cuantificada con el original

| Métrica | Proyecto original | V2 | Resultado |
| --- | ---: | ---: | --- |
| Modelos totales Prisma | 189 | 46 | V2 conserva un núcleo más pequeño y auditable; los modelos transversales protegen el login y procesan datos pesados. |
| Modelos de Transporte | 111 | 23 | 88 tablas menos, reducción de 79,3%, incluyendo la cola durable de Fase 2. |
| Pantallas/áreas de Transporte | 16 páginas | 11 áreas integradas | Menos navegación duplicada y mayor continuidad entre flujos. |
| Asignaciones | `TransportTripAssignment` y `TransportMovementAssignment` | `TransportAssignment` | Una fuente de verdad por viaje e intervalo. |
| Gastos y pagos | Varios circuitos y `TransportPaymentRecord` adicional | `TransportExpense` y `TransportPayment` | Registro financiero único. |
| Liquidación | Cálculos y ajustes distribuidos | `TransportSettlement` persistente | Cálculo, validación y cierre verificables. |
| Jornada real | Reglas parciales sobre el día actual | `TransportWorkLog`, licencia y descanso | Control sobre la fecha real del viaje. |

La reducción no es una eliminación ciega. V2 consolidó entidades duplicadas, estados derivados y tablas que en el original no tenían un consumidor operativo completo. Se conservaron las capacidades necesarias para ejecutar el ciclo de transporte de punta a punta.

## Hallazgo técnico resuelto

La revisión confirmó que dos archivos seguían siendo demasiado grandes aunque fueran funcionales: `TransportWorkspace.tsx` rondaba los 42 KB y `server/commands.ts` los 40 KB. Se aplicó una separación interna sin cambiar rutas, contratos HTTP, permisos, textos ni comportamiento visible:

| Capa | Antes | Ahora | División aplicada |
| --- | ---: | ---: | --- |
| Frontend | Un workspace de ~42 KB | Selector de 1,6 KB | 11 componentes de área y utilidades UI compartidas. |
| Backend | Un archivo de comandos de ~40 KB | Despachador de 1,2 KB | 8 handlers: maestros, operaciones/viajes, flota, conductores, finanzas, combustible, mantenimiento y neumáticos. |

Los seis límites principales solicitados —viajes, flota, conductores, finanzas, mantenimiento y neumáticos— quedaron explícitos. Maestros y combustible se mantuvieron como dominios auxiliares independientes; documentos, reportes, configuración y dashboard conservan componentes propios en la interfaz. El archivo más grande resultante es `operations.ts` del backend, de aproximadamente 10 KB, por lo que ya no existe un nuevo monolito equivalente.

La comprobación posterior aprobó TypeScript completo, ESLint, los builds de producción de ambos servicios, 5/5 pruebas unitarias y nuevamente 30/30 escenarios reales de Transporte sobre una base E2E aislada.

## Rendimiento y escala aplicados

Cada pantalla solicita ahora su sección mediante `/api/data/tenant?section=...`. En las nueve listas principales también envía página, tamaño, búsqueda y estado. El backend consulta únicamente los dominios de esa capacidad y ejecuta filtro, conteo y `skip/take` en Prisma; el navegador no vuelve a paginar en memoria la colección principal.

| Respuesta medida | Antes | Después | Reducción aproximada |
| --- | ---: | ---: | ---: |
| Workspace completo | 20.125 bytes | 20.125 bytes | Compatibilidad conservada. |
| Dashboard | 20.125 bytes | 10.714 bytes | 47% |
| Operaciones | 20.125 bytes | 11.482 bytes | 43% |
| Flota | 20.125 bytes | 3.059 bytes | 85% |
| Conductores | 20.125 bytes | 3.683 bytes | 82% |
| Mantenimiento | 20.125 bytes | 3.452 bytes | 83% |

En el artefacto de producción y con la base demostrativa, el trabajo medido dentro del endpoint quedó entre 3 y 41 ms según la sección. Cada respuesta incorpora `Server-Timing` y `X-Workspace-Scope`; una carga superior a `SLOW_WORKSPACE_MS` (500 ms por defecto) genera un evento estructurado `slow_workspace`. Estos valores son una línea base, no sustituyen una prueba futura con millones de eventos GPS.

También se corrigió el manifiesto del layout: los tenants de Transporte muestran ahora sus 11 enlaces reales, en lugar de caer en el manifiesto de Restaurante. La regresión verifica explícitamente todos esos enlaces.

## Áreas operativas

| Área | Capacidades implementadas |
| --- | --- |
| Centro operativo | Indicadores, viajes activos, disponibilidad, alertas, documentos y costos. |
| Maestros y rutas | Clientes/proveedores/transportistas, ubicaciones y rutas con distancia, tiempo, peajes y tarifa. |
| Operaciones y viajes | Operaciones logísticas que agrupan uno o varios viajes; el plan puede registrarse sin placas ni conductores y completar las asignaciones conforme se presentan los recursos. Cada ensamble admite un tracto, una carreta opcional, un piloto y un segundo piloto opcional, con historial de reconfiguraciones. Incluye programación, carga, prioridad, estados controlados y trazabilidad. |
| Flota | Vehículos y remolques, capacidad, estado, odómetro, SOAT, revisión técnica y GPS. |
| Conductores | Licencia, régimen de trabajo, ciclos de días laborados/descanso, permisos y asistencia real. |
| Documentos | Vigencias por conductor, vehículo o remolque y bloqueo de asignaciones inválidas. |
| Seguimiento | Eventos de salida/posición/llegada, coordenadas, odómetro e incidentes. |
| Finanzas | Gastos, aprobación, pagos de entrada/salida, rentabilidad y liquidación persistente. |
| Combustible | Carga, litros, precio, total, comprobante y control de retroceso de odómetro. |
| Mantenimiento | Órdenes preventivas, correctivas e inspecciones, estados, costos e inventario de repuestos; resumen histórico por unidad con tipos realizados, abiertos, completados y última atención. |
| Neumáticos | Serial, profundidad, costo, instalación, posición, inspecciones y movimientos. |
| Reportes | Ingresos, gastos, margen, operación y alertas a partir de datos persistidos. |

Los registros contables y operativos históricos no se eliminan físicamente: se cancelan, resuelven, completan o cierran según su transición válida. Esto conserva auditoría. La eliminación física se reserva para entidades maestras sin referencias cuando se incorpore una política explícita de retención.

### Reglas del ensamble operativo

- Un tracto puede participar en múltiples operaciones y viajes en momentos distintos, pero solo en un ensamble activo por intervalo horario.
- Cada ensamble admite como máximo una carreta; la misma carreta no puede estar enganchada a otro tracto durante un intervalo superpuesto.
- La tripulación admite un piloto obligatorio y un segundo piloto opcional. Ambos deben ser personas diferentes.
- Piloto y segundo piloto se validan con las mismas reglas de licencia, documentos, ciclo laboral, descansos, ausencias y disponibilidad.
- Un conductor ocupado como piloto tampoco puede asignarse simultáneamente como segundo piloto, ni a la inversa.
- Al reconfigurar o cerrar un viaje, los recursos anteriores se liberan y el registro queda conservado en el historial de ensambles y movimientos.

## Usuarios y permisos comprobados

Contraseña local para todos: `Nexo2026!`.

| Usuario | Rol | Acceso esperado |
| --- | --- | --- |
| `admin@andes.local` | Administrador | Todas las áreas del tenant. |
| `despacho@andes.local` | Despachador | Operación, flota, conductores, documentos y lectura de combustible; sin Finanzas ni Configuración. |
| `finanzas@andes.local` | Finanzas | Finanzas, reportes y lecturas operativas; sin modificar viajes. |
| `conductor@andes.local` | Conductor | Operación asignada, documentos y combustible según permisos. |
| `superadmin@multisaas.local` | Super Admin | Consola global, catálogo y administración de negocios. |

## Treinta escenarios reales ejecutados

| # | Escenario | Resultado |
| ---: | --- | --- |
| 1 | Usuario anónimo intenta consultar Transporte. | 401/403 controlado; aprobado. |
| 2 | Administrador ingresa a Andes Cargo. | Sesión y ruta correctas; aprobado. |
| 3 | Panel carga métricas y datos realistas. | Valores persistidos; aprobado. |
| 4 | Navegación por las 11 áreas. | Sin rutas rotas; aprobado. |
| 5 | Despachador intenta ver Finanzas/Configuración. | Áreas ocultas; aprobado. |
| 6 | Despachador intenta registrar un pago por API. | Prohibido por servidor; aprobado. |
| 7 | Finanzas intenta modificar operaciones. | Prohibido por servidor; aprobado. |
| 8 | Transporte intenta escribir en Restaurante. | Aislamiento vertical; aprobado. |
| 9 | Super Admin consulta catálogo y negocio Transporte. | Visible y administrable; aprobado. |
| 10 | Alta de cliente con RUC realista. | Creación y consulta correctas; aprobado. |
| 11 | Alta duplicada del cliente. | Conflicto validado; aprobado. |
| 12 | Alta de ubicación logística. | Persistencia correcta; aprobado. |
| 13 | Ruta con origen igual a destino. | Rechazada; aprobado. |
| 14 | Ruta Lurín–Huachipa válida. | Creada y consultada; aprobado. |
| 15 | Alta de vehículo con vigencias futuras. | Creado; aprobado. |
| 16 | Retroceso de odómetro de vehículo. | Rechazado; aprobado. |
| 17 | Conductor con ciclo que cae en descanso. | Calendario correcto; aprobado. |
| 18 | Programación de viaje en el pasado. | Rechazada; aprobado. |
| 19 | Programación de servicio futuro válido. | Creado; aprobado. |
| 20 | Asignación de conductor durante descanso. | Bloqueada; aprobado. |
| 21 | Asignación de conductor/vehículo hábiles. | Persistida; aprobado. |
| 22 | Segunda asignación con intervalo solapado. | Conflicto detectado; aprobado. |
| 23 | Salto inválido de DRAFT a DELIVERED. | Rechazado; aprobado. |
| 24 | Registro de posición GPS. | Coordenadas persistidas; aprobado. |
| 25 | Reporte y resolución de avería. | Estados y auditoría correctos; aprobado. |
| 26 | Creación y aprobación de gasto. | Trazabilidad conservada; aprobado. |
| 27 | Cierre de liquidación antes de entregar. | Bloqueado; aprobado. |
| 28 | Inicio, entrega, recálculo y cierre de liquidación. | Estado CLOSED leído nuevamente; aprobado. |
| 29 | Combustible con odómetro inválido/válido y OT iniciada/completada. | Reglas y persistencia correctas; aprobado. |
| 30 | Stock negativo/entrada, posición de neumático ocupada/instalación, aislamiento y móvil. | Reglas, tenant y responsive aprobados. |

## Alcance externo que no se simula

El núcleo operativo no falsifica conexiones de terceros. Quedan para una fase con credenciales y contratos reales: emisión SUNAT/GRE, ingestión automática de un proveedor GPS, portal/app móvil del conductor, almacenamiento documental externo, mensajería, telemetría en tiempo real y conciliación bancaria. La Fase 2 ya incorpora importación CSV validada, exportación Excel/PDF y una cola durable; la V2 conserva eventos, documentos y campos de referencia para conectar los demás proveedores sin duplicar lógica.

Railway y Google Cloud Run están preparados en el repositorio, pero la publicación efectiva necesita la cuenta, PostgreSQL, secretos, dominio y permisos del propietario.
