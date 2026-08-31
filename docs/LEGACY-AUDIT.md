# Auditoría del proyecto de referencia

## Stack y organización observados

El proyecto original combina Next.js 16/React 19 con App Router y un backend Express 4. Usa TypeScript estricto, Tailwind, NextAuth, Zod, Prisma/PostgreSQL, JWT, Socket.IO, Redis opcional, almacenamiento S3/R2 y middleware de auditoría, concurrencia e idempotencia.

La persistencia se divide por dominio y el runtime registra módulos `core`, `shared` y `vertical` mediante manifiestos. Esa base conceptual se conserva, pero V2 no reutiliza ni modifica archivos del original.

## Aciertos conservados

- Aislamiento por empresa y RBAC por membresía.
- Catálogo, clientes, reservas/órdenes, caja y pagos como capacidades compartidas.
- Manifiestos para habilitar módulos y construir navegación.
- Identidad HSL, tema oscuro, shell translúcido y sidebar colapsable.
- TypeScript estricto y validación Zod en límites de entrada.

## Problemas encontrados

- No había entidad `Branch`; el aislamiento llegaba a empresa, no a sucursal.
- Existían implementaciones duplicadas de DataTable, Badge, Select y EmptyState.
- La página principal de Restaurante tenía 2,235 líneas, más de 90 estados locales y mutaciones HTTP dentro del componente; su servicio superaba 1,450 líneas.
- La página de equipo de Barbería concentraba consultas, filtros, formularios, imágenes, detalle y eliminación en más de 800 líneas.
- Había dos circuitos de autenticación, configuración de verticales en el composition root y permisos declarados con nomenclaturas divergentes.
- Los E2E del frontend simulaban gran parte del backend y no demostraban aislamiento de datos real.
- Transporte acumulaba 111 modelos repartidos en siete esquemas, con pares funcionales solapados como `TransportTripAssignment`/`TransportMovementAssignment` y circuitos financieros paralelos.
- La asignación comprobaba coincidencias puntuales pero no todos los intervalos solapados; el descanso podía evaluarse contra el día actual en lugar de la fecha programada del viaje.
- Varias capacidades avanzadas de Transporte estaban expuestas como páginas, snapshots o escritores de outbox sin un ciclo consumidor completo.

## Decisión V2

V2 introduce sucursales, contratos de módulo, manifiestos autocontenidos, un solo kit de UI, sesiones opacas y persistencia Prisma real. Transporte consolida 111 modelos en 22 tablas operativas con una asignación y un circuito financiero autoritativos. Los datos demo en memoria fueron retirados: lecturas, mutaciones, permisos, auditoría y aislamiento se validan contra SQLite local mediante Route Handlers y Playwright sin mocks.

## Deuda que no se trasladó

- Páginas monolíticas: reemplazadas por workspaces pequeños por capacidad.
- Componentes duplicados: consolidados en `shared`.
- Tenant confiado al cliente: sustituido por scope derivado de la sesión.
- Falta de sucursal: formalizada con `Branch` y aplicada a agenda, caja, salón, cocina y catálogo.
- Divergencia RBAC: manifiestos y endpoints comparten la nomenclatura de permisos.

## Deuda consciente de V2

- El provider local es SQLite; PostgreSQL y su migración operativa son requisito para producción multi-instancia.
- El Super Admin se siembra y puede entrar a ambos tenants, pero aún no hay consola global de facturación o planes.
- No se migran archivos históricos, almacenamiento de imágenes, Redis, Socket.IO ni proveedores externos.
- La sesión expira y se revoca al cerrar sesión; la recuperación de contraseña por correo requiere integrar un proveedor de email.
