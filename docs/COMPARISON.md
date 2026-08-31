# Comparación ejecutable: proyecto original frente a V2

> Actualización del 16 de agosto de 2026: V2 incorpora Transporte/Logística. El conteo vigente es 189 modelos totales/111 de Transporte en el original frente a 45/22 en V2; el modelo adicional es el throttle persistente de acceso. La nueva batería suma 30/30 escenarios de Transporte y eleva la evidencia funcional propia a 137 E2E. El detalle actualizado está en [TRANSPORT-V2.md](TRANSPORT-V2.md). Las cifras históricas de las secciones siguientes corresponden a la comparación viva de Barbería y Restaurante del 15 de agosto.

Fecha de validación: 15 de agosto de 2026. La revisión se hizo con los dos proyectos ejecutándose a la vez, navegadores y contextos de sesión separados, bases reales y sin interceptar ni simular el backend.

## Entorno comparado

| Aplicación | URL | Backend / base | Acceso usado |
| --- | --- | --- | --- |
| Original | `http://127.0.0.1:3000` | Express `:3001` + PostgreSQL `:5432` | `qa-barbershop@multi-business.local` / `qa-restaurant@multi-business.local`, clave `Admin123!` |
| V2 | `http://localhost:3100` | Route Handlers + Prisma/SQLite | `admin@nova.local` / `admin@brasa.local`, clave `Nexo2026!` |

La prueba permanente está en `e2e/original-comparison.spec.ts`. Recorre 32 estados visuales: login, siete pantallas por vertical y dashboards móviles. Si el original no está disponible, la prueba se omite y los E2E propios de V2 continúan siendo independientes.

## Original → problema → cambio en V2 → resultado

| Área | Original observado | Problema o riesgo | Cambio aplicado en V2 | Resultado verificado |
| --- | --- | --- | --- | --- |
| Inicio local | El seed dejó suscripciones QA con fechas vencidas y el worker suspendió negocios al arrancar. | Un seed existente no era repetible en la fecha actual; el login podía quedar bloqueado inmediatamente. | Seed de V2 borra y reconstruye tenants con estado determinista y sin fechas demo caducables. | `db:seed` deja ambos verticales utilizables en cada corrida. |
| Arquitectura | Frontend Next.js y backend Express separados; registro modular potente, pero páginas y servicios verticales muy grandes. | Más superficie de coordinación, lógica y estado local; el salón y algunos servicios concentran cientos o miles de líneas. | Composition root pequeño, manifiestos por vertical, Core/Shared separados y workspaces por capacidad. | Las rutas, UI común y scope no dependen de condicionales específicos en Sidebar/Navbar. |
| Tenancy | Aislamiento principal por empresa. | No había una entidad de sucursal transversal. | `Tenant` + `Branch` + `Membership`; la sesión fija tenant y sucursal, y cada comando vuelve a validar el scope. | Cambio de sede real y operaciones por sucursal; lectura/escritura cruzada devuelve 404/403. |
| Autenticación | NextAuth/JWT más backend JWT; flujo amplio pero con dos circuitos. | Mayor complejidad para razonar sobre sesión y autorización. | Token de sesión opaco en cookie `httpOnly`; sólo su hash SHA-256 vive en BD; bcrypt para contraseñas. | Login/logout, expiración, revocación y rutas protegidas pasan E2E. |
| Usuarios y roles | UI avanzada de usuarios/permisos. | Los E2E del frontend original usan backend simulado y no prueban todo el ciclo real. | Alta y edición de usuario/rol/sucursal contra Prisma, guardas para el último administrador y autorización del servidor en cada escritura. | E2E crea `Operador E2E`, asigna rol Barbero, comprueba el bloqueo de Configuración, lo desactiva, revoca su sesión y rechaza un nuevo login. |
| Configuración | Pestañas ricas de Empresa, Usuarios, Permisos y Seguridad. | Buen alcance, pero separado por pantallas y sin sucursales en el modelo común. | Workspace Core compartido por Barbería/Restaurante: perfil, moneda, sucursales, usuarios, roles, cambio de contraseña y auditoría. | Un solo componente gobierna ambos verticales; actualización de empresa y seguridad son persistentes y auditables. |
| Seguridad de cuenta | Seguridad visible en Configuración. | V2 inicialmente no tenía cambio de clave. | Endpoint con validación de clave actual, nuevo hash bcrypt y cierre de todas las otras sesiones. | La sesión actual continúa y las secundarias quedan revocadas; el cambio se audita. |
| Agenda | Filtros por fecha, estado y profesional; calendario/tabla, bloqueos y espera. | V2 inicialmente sólo buscaba texto. | Filtros combinables, reprogramación con detección de cruces, no-asistencia y acciones persistentes. | El ciclo crear → confirmar → reprogramar → reconfirmar → cobrar pasa contra la base real. |
| Clientes | Más filtros y selector de columnas; seed pequeño. | Mayor amplitud, pero la demo no enseña bien el producto. | Tabla común, búsqueda limpiable y varios clientes realistas por tenant. | CRM consistente y demostrable; filtros avanzados/columnas configurables siguen como oportunidad futura. |
| Equipo/servicios | Formularios y filtros más extensos; QA con pocos datos operativos. | Pantallas completas pero vacías en la primera experiencia. | Seed con profesionales, horarios, especialidades, comisiones y catálogo vinculados a citas. | Equipo y servicios muestran relaciones reales y permiten crear/editar. |
| Restaurante | Salón con modos Expandido/Compacto/Min/Focus y más acciones de mesa. | Es más amplio, pero el QA inicial contiene una mesa y operación vacía. | Salón compacto con reserva/liberación, traslado de pedido y composer táctil conectado a cocina/caja. | Reserva → pedido → traslado → KDS → cobro → limpieza → cierre de caja pasa con persistencia real. |
| Dashboard | KPIs completos pero el seed QA produce muchos ceros. | Dificulta validar rápidamente el valor y los estados del vertical. | Datos de seed coherentes con tarjetas, próximas citas, equipo, mesas, pedidos y caja. | Los dashboards comunican estado y permiten saltar a flujos reales. |
| UI/UX | Sidebar sólida y pantallas profundas, con densidad y patrones variables entre módulos. | La jerarquía cambia entre verticales y algunos layouts son muy densos. | Sistema visual único, header con búsqueda/sede/tema, feedback consistente, barra de acciones Core y responsive sin overflow. | Las 16 capturas de V2 no presentan overflow horizontal ni errores 4xx/5xx/console en el comparador final. |
| Pruebas | Typecheck limpio; 15/15 unit tests frontend. El script backend oficial no carga `.env`. | Dos tests backend abortan con el script oficial por variables requeridas; al cargar el entorno explícitamente pasan 90/90. Los E2E frontend apuntan a un mock server. | Unit tests propios + E2E con BD real + comparador opcional contra el original real. | V2: 12 escenarios propios y 1 comparador pasan; acceso multiempresa, aislamiento, RBAC, persistencia, casos negativos, consola y responsive quedan cubiertos. |

## Cobertura funcional de V2

### Core SaaS

- Login, logout, sesión opaca, expiración y cambio de sucursal.
- Tenants, perfil empresarial, moneda, sucursales, usuarios, membresías, roles y permisos con edición y activación.
- Alta administrativa completa y navegación generada desde manifiestos según RBAC.
- Cambio seguro de contraseña, revocación de sesiones y auditoría.
- Todas las relaciones externas se revalidan dentro de `tenantId`/`branchId`; el cliente no decide el scope.

### Barbería

- Dashboard, agenda filtrable, clientes, equipo, horarios, servicios, caja y ventas.
- Alta y edición de clientes/equipo/servicios, validación de disponibilidad, reprogramación, confirmación, no-asistencia, cancelación y cobro.
- Citas y caja separadas por sucursal; clientes/catálogo pertenecen al tenant.

### Restaurante

- Dashboard, mapa de mesas, ambientes, carta, clientes, pedidos, cocina/KDS, caja y ventas.
- CRUD de clientes/categorías/productos/ambientes/mesas; reserva simple, composer táctil, traslado, pedido transaccional, avance/cancelación de cocina, cobro y limpieza.
- Configuración específica de ambientes/mesas integrada con el Core compartido.

## Verificaciones ejecutadas

### Original

- 56 migraciones PostgreSQL desplegadas; 6 estaban pendientes al iniciar la revisión.
- Seed completado; se detectó y compensó sólo en la base local la caducidad de las suscripciones QA para poder comparar. No se modificó código del original.
- Frontend y backend `typecheck`: pasan.
- Frontend unit tests: 15/15 pasan.
- Backend unit tests: 86/88 con el script oficial porque no carga las variables requeridas; 90/90 al ejecutar el mismo conjunto con `node --env-file=.env ...`. El defecto está en el script, no en esas pruebas.
- API `/api/ready`: 200.

### V2

- Prisma validate, deploy y seed reproducible.
- Unit tests, ESLint, TypeScript y build de producción.
- 5/5 unit tests, ESLint, TypeScript y build de producción aprobados; `npm audit`: 0 vulnerabilidades.
- 12 E2E propios con base real: acceso empresarial, Barbería, administración/RBAC, Restaurante, aislamiento multi-tenant, casos HTTP negativos, reglas de agenda, CRUD lógico, búsqueda/orden/paginación y calidad visual en cuatro resoluciones.
- 1 E2E comparativo: 32 capturas, respuestas sin 500, V2 sin errores de consola/4xx/5xx, errores de hidratación ni overflow de página.

## Límites y siguientes pasos

V2 completa el alcance local definido para Core SaaS + Barbería + Restaurante, pero no pretende igualar todos los módulos del monolito original. Quedan fuera de este alcance: calendario visual y lista de espera, columnas configurables de CRM, reservas con cliente/fecha, modos avanzados de salón, inventario/compras, delivery, archivos/imágenes, realtime/Redis/Socket.IO, facturación/planes globales y recuperación de contraseña por email.

El provider local es SQLite. V2 ya incluye rate limiting persistente, backup local y métricas internas; antes de producción multi-instancia todavía se requiere PostgreSQL administrado, migración probada, secretos externos, HTTPS, backups administrados, observabilidad externa y política de retención para sesiones/auditoría.
