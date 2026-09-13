# Inventario: compras y criterios de aceptación

Seguimiento posterior: [entrega de conteos](INVENTORY-HEXAGONAL-PHASE-3.md). Este documento conserva los resultados de la entrega de compras.

## Alcance

Se extrajo el registro de compras hacia `application/use-cases/register-inventory-purchase.ts`, independiente de Next.js y Prisma. La ruta conserva validación Zod, permisos, respuesta HTTP y auditoría. La fachada compone los dos repositorios con el mismo cliente de transacción y scope.

La compra, sus líneas, los movimientos y la valoración se confirman juntos. Un fallo de una línea posterior o del llamador revierte esos cambios. La auditoría conserva su ubicación original después del commit; esta etapa no cambia su política de persistencia.

## Código anterior retirado

- El bloque de persistencia y movimientos de compras de `server/commands.ts` fue sustituido por una llamada al caso de uso. Hay una sola implementación activa.
- Compras y movimientos comparten la traducción de errores de dominio a HTTP.
- Compras y conteos usan una sola función para generar sus códigos, conservando el formato.
- El helper de login de la suite Transporte ya no busca el selector anterior al ingreso, eliminado de la interfaz actual.

No se eliminaron funciones utilizadas por conteos, recetas, devoluciones ni otros rubros. La limpieza es específica; no se declara una auditoría global de código muerto. La extracción añade contratos, adaptadores y pruebas y no supone menos líneas totales.

## Correcciones intencionales

Antes, una clave de compra se buscaba dentro de toda la empresa sin comparar sucursal ni contenido. Ahora se rechaza con `IDEMPOTENCY_CONFLICT` (409) su reutilización en otra sucursal o con proveedor, documento, notas, fecha explícita, artículos, cantidades o costos distintos. Una repetición equivalente devuelve la misma compra sin incrementar stock.

También se rechaza una clave de línea perteneciente a un movimiento ajeno a la compra, evitando confirmar documentos sin su entrada de stock. Una empresa diferente puede utilizar la misma clave para su propia compra.

La corrección de autenticación agrega `retryAfterSeconds` al error de límite de ingreso. El adaptador HTTP existente lo convierte en `Retry-After`, calculado según el tiempo restante de la ventana real.

## Evidencia

- Backend: 64 pruebas aprobadas; los dos casos exclusivos de PostgreSQL se omiten en SQLite.
- Frontend: 18 pruebas aprobadas.
- PostgreSQL 17.5: las 18 pruebas del servicio aprobadas, sin omisiones, incluyendo documentos, líneas, costos, aislamiento, repetición, colisiones y rollback.
- Concurrencia real: ambas transacciones establecen su snapshot antes de continuar. Dos consumos de la última unidad generan una salida y un rechazo por stock insuficiente. Dos compras con la misma clave generan una sola compra y entrada. Se ejercitan los reintentos del servicio.
- Lint de archivos afectados aprobado.
- Builds de producción y TypeScript de backend y frontend aprobados.
- Regresión final E2E: 31 escenarios de Restaurante, 30 de Transporte y 1 de compatibilidad de inventario aprobados (62 en total). El runner terminó con código 0 y restauró los datos iniciales de su base E2E.
- Restaurante incluye compra repetida, conflicto por contenido cambiado, reserva, devolución, rollback, cobro concurrente y conciliación de inventario/caja/pagos. Transporte incluye el encabezado `Retry-After`, permisos, aislamiento e inventario.
- Durante navegación se observaron mensajes de Next.js `The destination stream closed early`, sin fallos en las comprobaciones E2E. No se atribuyen a esta extracción ni se declara resuelto su origen.

Esta etapa de compras queda completada con esa evidencia. La migración completa del módulo continúa por las etapas indicadas más abajo.

## PostgreSQL reproducible

```sh
npm run test:inventory:postgres
```

Requiere Node >=22.13 y PostgreSQL mediante `PG_BIN_DIR`. En Windows se usa por defecto `C:/Program Files/PostgreSQL/17/bin`; en otros sistemas se busca en PATH si no se define esa variable. `initdb` requiere un usuario no root.

El script crea un cluster nuevo con contraseña aleatoria, puerto libre y escucha exclusiva en loopback. Genera un cliente Prisma separado y lo selecciona solo para el proceso de pruebas, incluidas sus clases de error. No cambia el cliente de desarrollo ni utiliza `DATABASE_URL` del usuario. Al terminar detiene y elimina el cluster de esa ejecución.

El esquema se deriva del actual cambiando su proveedor a PostgreSQL y se aplica con `db push` sobre la base nueva. Esto verifica el comportamiento; no reemplaza una prueba del historial de migraciones PostgreSQL ni la revisión del entorno real antes de publicar.

`npm run release:check` exige ahora las pruebas unitarias y esta comprobación PostgreSQL además de los controles existentes. Falla si PostgreSQL no está disponible. No se modificaron los despliegues externos.

## Criterios de las etapas siguientes

1. Verificar comportamiento observable y compatibilidad de las APIs afectadas.
2. Probar empresa ajena, sucursal ajena y repetición de solicitudes.
3. Provocar fallos y comprobar que no quedan documentos, movimientos, saldos ni costos parciales.
4. Validar las operaciones concurrentes en PostgreSQL antes de publicar.
5. Ejecutar las regresiones E2E correspondientes y resolver fallos del alcance antes de declarar la etapa completa.
6. Retirar únicamente implementaciones sustituidas o código sin referencias verificadas.

Siguen pendientes los conteos, la separación de recetas y reservas de Restaurante y la extracción del ejecutor transaccional técnico. No se declara completada la migración de todo Inventario ni del SaaS.

## Incidencia del entorno de pruebas

El primer intento dejó `%TEMP%/movendi-inventory-pg-q5UKVQ`. Su servidor fue detenido. La revisión automática bloqueó el comando PowerShell de limpieza por política de ejecución y esa carpeta se conservó. Los intentos posteriores usan directorios temporales propios en `node_modules` y finalizaron deteniendo y eliminando sus clusters.
