# Validación de Barbería y Salón

Fecha: 21 de septiembre de 2026 (UTC). Informe funcional: [revisión comparativa](BARBERSHOP-SALON-REVIEW.md).

## Verificación del proyecto

`npm run release:check` terminó con código 0 con Node 24.19.0:

- Migraciones SQLite desde base vacía: sin diferencias con el esquema.
- Actualización SQLite con datos anteriores: conserva columnas históricas de ventas y profesionales, corrige únicamente Caja predeterminada del salón, respeta permisos personalizados y Restaurante; verificación de claves foráneas sin errores.
- Frontend: 26 pruebas aprobadas.
- Backend SQLite: 197 aprobadas; 30 casos específicos de PostgreSQL omitidos en esta ejecución.
- PostgreSQL real, efímero y local: 158 aprobadas, cero fallos y cero omitidas. Incluye migraciones, aislamiento, rollback, agenda y cobros concurrentes.
- Agente de impresión: 1 prueba aprobada.
- Runners operativos y preservación de caja histórica: 2 pruebas aprobadas.
- TypeScript de contratos, backend y frontend: correcto.
- ESLint y compilación de producción de ambas aplicaciones: correctos.

El ajuste del ejecutor compartido se verificó con cinco altas concurrentes de Minimarket, además de los conflictos de agenda y cobros idempotentes del salón. No se modificaron los errores públicos de negocio ni el aislamiento serializable.

## Validación en navegador

28 casos aprobados en Chromium sobre compilaciones de producción:

| Suite | Casos aprobados |
|---|---:|
| Barbería: operación mixta, devolución, agenda, historial, móvil y permisos | 2 |
| Compatibilidad de ventas y caja de Barbería | 1 |
| Compatibilidad de Inventario con Transporte | 1 |
| Datos por pantalla y separación de datos de cocina | 3 |
| Jornada completa de Restaurante desde la interfaz | 6 |
| Operación completa de Minimarket, importación, multicaja y escáneres | 15 |

Las siete pantallas principales del salón se comprobaron a 390 y 768 píxeles sin desbordamiento horizontal de página; las tablas mantienen su desplazamiento interno. También se revisaron visualmente los reportes de escritorio y el comprobante. Capturas locales en `output/barbershop/`.

Se actualizaron selectores antiguos de pruebas de Restaurante para las etiquetas vigentes y su proyección reducida de clientes en Cocina, manteniendo la comparación de importes, inventario, pedidos, devoluciones y permisos. La última modificación del asistente se verificó otra vez con ESLint y compilación de producción en el runner E2E.

Las pruebas usan una base E2E independiente. La base de producción no recibe clientes, ventas ni semillas de prueba.

La base local `dev.db` recibió únicamente la migración versionada después de un respaldo consistente y verificado (`backups/sqlite/movendi-go-2026-09-21T00-50-31-215Z.db`).

## Límites de la entrega

La entrega corresponde a la primera etapa operativa descrita en el informe: no incluye membresías, paquetes, recordatorios externos automáticos ni facturación electrónica del salón. El documento imprimible es una constancia interna. Las comisiones liquidadas registran una referencia de pago; un pago desde caja requiere el egreso correspondiente. Las devoluciones digitales requieren ejecutar el reintegro en el proveedor del pago.

## Publicación

Publicación confirmada el 21 de septiembre de 2026 a las 00:54 UTC (20 de septiembre, 19:54 en Lima).

- Commit funcional: `c27cefd3873da6a2dfce4d14a5f7db864424b772`, enviado a `main`.
- [Frontend en Cloud Run: GitHub Actions](https://github.com/Anthonycs96/movendi-go/actions/runs/35549048053): `completed / success`.
- Backend Railway: despliegue `a0335317-ce3a-4ce6-b33e-d56b535fa6ea`, estado `SUCCESS`, mismo commit.
- Los logs de producción confirman `20260921010000_salon_operations` aplicada correctamente a PostgreSQL antes de activar el backend.
- [Movendi Go](https://web.movendi-go.com): frontend `ok`, versión completa coincidente con el commit funcional; backend `ready`, versión `c27cefd3873d`, base de datos `reachable`.
- Acceso público `/login`: HTTP 200. Consulta anónima `/api/barbershop/reports`: HTTP 401, como corresponde.
- Escaneo de los 62 archivos de la entrega: sin secretos de alta confianza. No se ejecutó ningún seed en producción.

Las verificaciones funcionales con escrituras se realizaron en bases aisladas; la comprobación posterior a publicación fue de despliegue, migración, salud y protección de acceso, sin generar ventas ficticias en producción.
