# Movendi Go — V2

Aplicación independiente inspirada en la identidad visual del proyecto de referencia, reconstruida como monorepo profesional multi-tenant. Incluye frontend, backend, contratos compartidos, Core SaaS, Barbería, Restaurante y Transporte/Logística; no depende del runtime del proyecto original.

## Inicio rápido

Requisitos: Node.js 22.13+ (o 24+), npm y Chromium de Playwright para las pruebas E2E.

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Abre `http://localhost:3000`. El frontend usa el puerto 3000 y el backend el 3001; `npm run dev` levanta ambos.

Para exponerlo también en la red local usa `npm run dev:network`. La preparación completa para Railway y Google Cloud Run está en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Accesos locales

Todos usan la contraseña local `Nexo2026!`.

| Tenant | Tipo | Usuario | Negocio |
| --- | --- | --- | --- |
| Nova Studio | Barbería | `admin@nova.local` | `nova-studio` |
| Nova Studio | Barbería | `barbero@nova.local` | `nova-studio` |
| Brasa Norte | Restaurante | `admin@brasa.local` | `brasa-norte` |
| Brasa Norte | Restaurante | `cocina@brasa.local` | `brasa-norte` |
| Andes Cargo | Transporte | `admin@andes.local` | `andes-cargo` |
| Andes Cargo | Despacho | `despacho@andes.local` | `andes-cargo` |
| Andes Cargo | Finanzas | `finanzas@andes.local` | `andes-cargo` |
| Andes Cargo | Conductor | `conductor@andes.local` | `andes-cargo` |
| Plataforma | Super Admin | `superadmin@multisaas.local` | cualquiera de los tres |

## Alcance implementado

- Login, logout, sesión opaca persistida, expiración, cambio validado de sucursal y protección de rutas.
- Centro de control Super Admin independiente con resumen global, negocios, planes, suscripciones, cobranza, facturas, pagos, webhooks, equipo de plataforma, auditoría, catálogo de rubros y estado del entorno.
- Venta automatizada desde `/planes`, checkout Stripe preparado, simulador local explícito, aprovisionamiento transaccional y correo durable con reintentos.
- Alta transaccional de empresas por superadministrador; perfil empresarial, primera sede, plan, suscripción, administrador, estado de acceso y auditoría.
- Barbería: dashboard, clientes, profesionales, horarios, servicios, citas, reprogramación, estados, caja, cobro y cierre con diferencia.
- Restaurante: dashboard, ambientes, mesas, reservas operativas, carta, clientes, pedidos, traslado de mesa, cocina/KDS, cancelación transaccional, caja, cobro y limpieza.
- Transporte: centro operativo, maestros, rutas, viajes y asignaciones, flota, jornadas y descansos, vigencias documentales, tracking e incidentes, gastos, pagos, liquidaciones, combustible, mantenimiento, inventario y neumáticos; paginación/filtros de servidor, importación CSV, exportación Excel/PDF y cola durable.
- Navegación por manifiestos, diseño responsive, tema oscuro, búsqueda de secciones y feedback de operaciones.
- Consultas y mutaciones filtradas en servidor por `tenantId` y, cuando corresponde, `branchId`.

## Estructura

```text
apps/frontend       interfaz Next.js y proxy seguro /api
apps/backend        API, sesiones, RBAC, dominio y Prisma
packages/contracts  DTOs compartidos serializables
```

El frontend no tiene Prisma ni credenciales de base de datos. La cookie `httpOnly` y las URLs visibles se conservan mediante un proxy delgado, mientras el backend centraliza todas las reglas y escrituras.

## Datos y despliegue

El entorno local usa Prisma 5 con SQLite para que migraciones, seed y pruebas sean reproducibles sin infraestructura externa. Railway y Cloud Run usan PostgreSQL administrado con el esquema generado del backend. Nunca se confía en un `tenantId` enviado por el cliente.

Variables disponibles en [`apps/frontend/.env.example`](apps/frontend/.env.example) y [`apps/backend/.env.example`](apps/backend/.env.example).

## Calidad

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run e2e
```

`npm run e2e` copia `dev.db` a una base desechable `e2e.db`, aísla cada suite con un seed nuevo y nunca reconstruye la base principal. Incluye escenarios generales, atenciones transaccionales, Super Admin, Transporte, escala, confiabilidad, almacenamiento y 22 recorridos comerciales de Fase 5. Para repetir módulos concretos usa `npm run e2e:transport:30`, `npm run e2e:transport:phase2` o `npm run e2e:phase5`.

El resultado completo de la última batería está en [docs/FINAL-VALIDATION.md](docs/FINAL-VALIDATION.md). La comercialización se documenta en [docs/PHASE-5-COMMERCIAL.md](docs/PHASE-5-COMMERCIAL.md), Transporte en [docs/TRANSPORT-V2.md](docs/TRANSPORT-V2.md) y rendimiento/archivos masivos en [docs/TRANSPORT-PHASE-2.md](docs/TRANSPORT-PHASE-2.md). Más contexto en [docs/COMPLETION.md](docs/COMPLETION.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/LEGACY-AUDIT.md](docs/LEGACY-AUDIT.md) y [docs/COMPARISON.md](docs/COMPARISON.md).
