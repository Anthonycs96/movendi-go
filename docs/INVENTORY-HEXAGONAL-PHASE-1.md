# Primera extracción hexagonal de Inventario

Seguimiento posterior: [compras y validación real en PostgreSQL](INVENTORY-HEXAGONAL-PHASE-2.md). Los resultados siguientes corresponden a la primera extracción.

Alcance aprobado: separar el movimiento de inventario conservando comportamiento, APIs, transacciones y esquema existentes.

## Implementación

```text
Consumidores actuales de Restaurante / Transporte / Inventario
  -> server/service.ts: applyInventoryMovement(tx, scope, input)
     -> application/use-cases/apply-inventory-movement.ts
        -> domain/stock-movement.ts
        -> application/ports/inventory-repository.ts
           <- infrastructure/prisma/prisma-inventory-repository.ts
```

- **Dominio:** cálculo de stock, precisión de cantidades, costo promedio y errores de negocio independientes de Prisma, Next.js y HTTP.
- **Aplicación:** valida repetición, obtiene el artículo, calcula el movimiento, actualiza el saldo condicionalmente y registra el movimiento.
- **Repositorio:** cuatro operaciones específicas de inventario; contrato con tipos propios, sin exponer Prisma al caso de uso.
- **Adaptador Prisma:** utiliza exclusivamente el cliente de transacción recibido y el scope del llamador.
- **Fachada existente:** mantiene firma, campos de respuesta, mensajes/códigos HTTP y reintentos. Es el punto de composición durante esta primera etapa.
- **API interna:** `modules/inventory/public.ts` exporta el caso de uso, su entrada, contrato y errores. No exporta infraestructura.
- **ESLint:** impide imports externos en las nuevas capas internas, dependencias hacia infraestructura/legacy y uso directo de fetch/Request/Response/Headers. Las pruebas pueden importar sus herramientas.

La transacción sigue perteneciendo al caso de uso llamador. No se crean transacciones independientes por repositorio. Se preserva la búsqueda de claves dentro de toda la empresa para rechazar su reutilización desde otra sucursal, y el comportamiento de artículos legacy sin branchId.

## Validación

- Línea base: 41 pruebas existentes del backend aprobadas antes de la extracción.
- Caracterización: siete pruebas nuevas del servicio aprobadas contra la implementación original.
- Después de extraer: 57 pruebas del backend aprobadas (41 existentes + 16 nuevas).
- Dominio y aplicación: siete pruebas ejecutadas también sin la condición `react-server`, demostrando independencia del runtime de Next.js.
- Integración: base SQLite temporal creada con las migraciones reales; se verifica rollback tras un fallo de clave foránea al registrar el movimiento y tras un fallo posterior del llamador.
- Concurrencia: actualización optimista con snapshot obsoleto verificada con Prisma, conflicto entre dos consumidores probado en memoria y conservación de los reintentos de la fachada.
- Lint de los archivos afectados aprobado; restricciones de imports comprobadas con entradas inválidas en memoria.

- Compilación de producción y comprobación TypeScript de backend y frontend aprobadas.
- Historial de migraciones: las 37 migraciones generan una base vacía coincidente con el esquema actual; no se añadieron migraciones.
- Restaurante: los 31 escenarios de `e2e/restaurant-production-audit.spec.ts` pasaron, incluidos reserva, devolución, merma, doble cobro concurrente y conciliación directa de stock/caja/pagos.
- Transporte: el escenario nuevo `e2e/inventory-compatibility.spec.ts` pasó usando las APIs existentes, con entrada, consumo, rechazo por saldo insuficiente y comprobación de movimientos. Se añadió a la lista de regresión del runner E2E.
- Limitación de la suite general de Transporte: `transport-real-30.spec.ts` falló en su primer escenario porque el 429 del login no lleva `Retry-After`; los otros 29 no se ejecutaron. En el código de autenticación sin modificar, `assertLoginAllowed` crea el error sin `retryAfterSeconds`, mientras el adaptador HTTP sólo genera la cabecera cuando recibe ese dato. No se cambió autenticación dentro de esta extracción. La prueba específica anterior permitió validar Inventario sin depender de ese escenario serial.

La concurrencia en PostgreSQL sigue requiriendo validación antes de una publicación; esta entrega no despliega cambios. Durante la navegación rápida de la suite de Restaurante se registraron mensajes de Next.js sobre cierre anticipado de streams; sus 31 pruebas finalizaron correctamente.

Las pruebas de integración crean una base vacía en un directorio temporal propio y eliminan sólo ese directorio al terminar. No utilizan ni modifican los datos de dev.db. Se usó el runtime Node 24.19 disponible en el equipo para los checks finales; el Node predeterminado 22.12 queda por debajo del mínimo 22.13 declarado por el repositorio.

## Límites de esta entrega

No se modificaron endpoints, esquema Prisma, caja, ventas, recetas, notificaciones ni integración fiscal. La configuración de Restaurante y sus adaptaciones todavía existen en los handlers legacy; la extracción completa del módulo Inventario continúa pendiente.

La siguiente parte de Inventario podrá separar compras/conteos y adaptar reservas de Restaurante, además de ubicar el runner transaccional técnico fuera del módulo. Son cambios posteriores, no parte de esta primera extracción.

Esta fase agrega contratos, adaptadores y pruebas. Reduce las responsabilidades del servicio existente, pero no reduce todavía el total de líneas del repositorio. La reducción futura depende de sustituir implementaciones repetidas por capacidades compartidas sin forzar reglas distintas a un mismo modelo.
