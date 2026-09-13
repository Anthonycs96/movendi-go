> Actualización 2026-09-13: el usuario amplió Minimarket de piloto a módulo operativo. El alcance implementado, sus pruebas y límites se mantienen en [MINIMARKET-OPERATIONS.md](MINIMARKET-OPERATIONS.md). Este documento conserva el planteamiento inicial.

# Propuesta de arquitectura para Minimarket

Estado: propuesta basada en revisión estática del repositorio. No es una implementación ni una certificación de funcionamiento en producción.

## Decisión principal

Mantener frontend y backend separados. Organizar el backend como un **monolito modular**, con **arquitectura hexagonal ligera** dentro de los módulos que concentran reglas de negocio. Añadir Minimarket como rubro propio.

La arquitectura define la organización general. Los patrones de diseño concretos serán Strategy, Adapter y un registro explícito de módulos. Los patrones de aplicación serán casos de uso, Unit of Work y Transactional Outbox. Aplicarlos donde resuelvan un problema observado, sin crear abstracciones para cada función.

Una base de datos compartida permite confirmar venta, pagos registrados, caja y stock en una sola transacción. Cada módulo será propietario de sus reglas y escrituras. Conservar Next.js y Prisma; esta propuesta no requiere cambiar de framework.

## Hallazgos del código actual

| Evidencia | Consecuencia | Mejora propuesta |
| --- | --- | --- |
| `apps/backend/src/app/api/operations/[...segments]/route.ts` concentra permisos, selección de rubro y despacho | Cada rubro obliga a editar un punto central con reglas específicas | Registro explícito de operaciones por módulo; acción desconocida se rechaza |
| `apps/backend/src/app/api/data/tenant/route.ts` y páginas del frontend repiten selección de tres rubros; algunos casos restantes se tratan como Transporte | Añadir un tipo incompleto puede dirigirlo al módulo equivocado | Identificadores compartidos y registros exhaustivos en servidor y frontend |
| `modules/inventory/server/commands.ts` importa configuración de restaurante; `service.ts` contiene consumo y devolución de recetas | El módulo compartido conoce un rubro que debería consumirlo | Mover orquestación de recetas a Restaurante; Inventario expone operaciones generales |
| `Product` contiene campos de cocina; `InventoryItem` mantiene SKU, barcode, unidad y stock; se conectan por recetas | No existe una representación directa de producto minorista vendible y sus existencias | Catálogo minorista con presentaciones y vínculo explícito al artículo de inventario |
| `OrderItem.quantity` es entero y el validador limita cantidades a 50 | El flujo de restaurante no sirve directamente para peso o determinadas compras de volumen | Líneas propias de venta minorista y precisión definida por unidad |
| Checkout de restaurante busca la última caja abierta de la sucursal | Selección insuficiente para varias cajas operando simultáneamente | Caja física, sesión de caja y asignación de operador explícitas |
| `SaleRefund` tiene una venta única y el caso de uso devuelve el total | No cubre devoluciones sucesivas por línea | Cabecera y líneas de devolución con saldo retornable por producto |
| `getInventoryData` limita artículos a 1.000 y movimientos a 300; calcula métricas a partir de esos resultados | Métricas y búsqueda pueden representar sólo una parte del inventario | Consultas paginadas y agregados independientes calculados en base de datos |
| Existen transacciones serializables, comprobación de stock e idempotencia en Inventario | Hay protección reutilizable para operaciones concurrentes | Conservarla y ampliarla al checkout completo |
| La compra repetida puede devolver el registro encontrado por clave antes de comparar el contenido completo | Reintentos con otra carga necesitan una política más estricta | Clave vinculada a empresa, sucursal, operación y hash de entrada normalizada |
| Hay outbox de correo y trabajos de impresión con mecanismos de reintento | Existe experiencia local útil para trabajo durable | Definir un contrato común de entrega y recuperación, conservando adaptadores por destino |

Los controles de módulos de Inventario llaman actualmente a una función específica de Restaurante. Esa función sólo restringe restaurantes; no significa que Inventario sea exclusivo de ese rubro. La mejora es aplicar una política general explícita para todos los tipos.

## Límites funcionales

- **Plataforma:** empresas, planes, suscripciones, alta de negocios y administración global.
- **Identidad y acceso:** sesiones, membresías, permisos y sucursales autorizadas.
- **Catálogo:** productos minoristas, variantes cuando correspondan, presentaciones, códigos y precios.
- **Inventario:** artículos, almacenes, existencias, movimientos, lotes, conteos y transferencias.
- **Compras:** proveedores, documentos de compra, recepción y, en una etapa posterior, cuentas pendientes.
- **Ventas:** venta y líneas, pagos registrados, descuentos y devoluciones.
- **Caja:** cajas físicas, sesiones, operadores, entradas, retiros y cierres.
- **Comprobantes:** emisión, consulta, reintentos y estados del proveedor fiscal.
- **Rubros:** Minimarket organiza la venta rápida; Restaurante conserva pedidos, recetas, mesas y cocina; Barbería conserva agenda; Transporte conserva su operación.

Catálogo, Ventas y Caja se extraerán gradualmente cuando sus contratos estén definidos. Compartir un módulo no obliga a todos los rubros a adoptar simultáneamente un modelo nuevo. La facturación de la suscripción SaaS continúa separada de los comprobantes de ventas de un negocio.

## Estructura objetivo

```text
apps/backend/src/
  app/api/                       adaptadores HTTP delgados
  composition/                   registro y conexión de implementaciones
  core/                          plataforma, identidad y tenancy existentes
  shared/                        Scope, dinero, cantidad, errores y transacciones
  modules/
    catalog/
    inventory/
    purchasing/
    sales/
    cash/
    fiscal/
    minimarket/
      domain/                    reglas puras y políticas
      application/
        commands/                checkout, devolución y otras escrituras
        queries/                 búsqueda de productos y resumen del POS
        ports/                   contratos necesarios de persistencia/integración
      infrastructure/            adaptadores concretos cuando sean necesarios
      presentation/              validación HTTP y mapeo de respuestas
      public.ts                  API interna pública del módulo
    restaurant/
    barbershop/
    transport/

apps/frontend/src/
  core/modules/                  registro de rubros y navegación
  modules/minimarket/
    pos/                         carrito, búsqueda y cobro
    catalog/
    purchases/
    returns/
    reports/
  shared/components/             componentes visuales reutilizables

packages/contracts/src/
  core/
  inventory/
  sales/
  minimarket/
```

Los módulos complejos siguen la separación domain/application/infrastructure/presentation. Los módulos sencillos conservan menos archivos. Los contratos compartidos contienen DTO serializables e identificadores, sin Prisma, credenciales ni reglas exclusivas del servidor.

Reglas de dependencias:

1. HTTP valida la forma de entrada y obtiene el contexto autenticado; el caso de uso valida permisos, relaciones y reglas de negocio.
2. El dominio no importa Next.js ni Prisma. Aplicación utiliza puertos o APIs públicas de otros módulos.
3. Infraestructura implementa los contratos de persistencia e integración; composición conecta las implementaciones.
4. Ningún rubro importa archivos internos de otro rubro. Inventario no importa Restaurante.
5. Las lecturas pueden usar Prisma en adaptadores de consulta y devolver DTOs directamente. No crear repositorios CRUD genéricos que sólo repliquen Prisma.
6. Verificar límites mediante reglas de imports en ESLint y comprobaciones de tipos cuando comience la implementación.

## Patrones y uso concreto

| Patrón o enfoque | Aplicación | Beneficio y límite |
| --- | --- | --- |
| Strategy | Política de consumo directo en Minimarket frente a consumo de ingredientes en Restaurante | Intercambia el cálculo de movimientos; cada rubro conserva cuándo reserva, consume o libera stock |
| Adapter | NubeFact, impresión, persistencia y futuras integraciones de pago | Reglas de venta independientes del proveedor; definir interfaces sólo en límites reales |
| Module Registry | Tipo de negocio, capacidades, operaciones y permisos declarados | Registro exhaustivo y rechazo de tipos desconocidos; la navegación nunca sustituye autorización del servidor |
| Casos de uso + Unit of Work | `CompleteRetailSale`, `ReceivePurchase`, `RefundSaleLines` | Una operación coordina todas las escrituras con la misma transacción |
| Separación de comandos y consultas, CQRS ligero | Escrituras transaccionales; búsquedas y reportes con consultas específicas | Misma base de datos, sin introducir event sourcing ni bases duplicadas |
| Transactional Outbox | Solicitar comprobante o impresión tras confirmar venta | La intención se guarda junto con la venta; un worker entrega con reintentos y consumidores idempotentes |

Strategy no debe convertirse en un método gigantesco con condicionales por rubro. La política calcula necesidades; el módulo de Inventario aplica movimientos y protege existencias. Las reservas de restaurante no se trasladan automáticamente al carrito de minimarket.

## Modelo mínimo de datos propuesto

- `CatalogProduct`: identidad comercial a nivel empresa; categoría, nombre y estado.
- `ProductPresentation`: unidad, paquete o caja; factor hacia la unidad base y vínculo al artículo inventariable. Barcode único dentro de la empresa, almacenado como texto para conservar ceros iniciales; permitir varios códigos por presentación si se necesitan.
- `BranchPrice`: precio por sucursal/presentación y vigencia cuando corresponda.
- `StockLocation` y `StockBalance`: almacén de una sucursal y saldo por artículo. Desacoplar el catálogo del lugar donde se guarda la mercadería.
- `StockLot`: lote, vencimiento y saldo por ubicación para productos que lo requieren. Salida priorizando próximos vencimientos; el método de valoración se define por separado.
- `RetailSale` y `RetailSaleLine` como incorporación inicial: instantánea de nombre, presentación, cantidad, conversión, precio, costo, descuento e impuesto aplicados. Vincular con `Sale` si se conserva como cabecera financiera compartida; decidir ese enlace antes de la migración para evitar dos totales independientes.
- `Refund` y `RefundLine`: cantidad devuelta, importe y disposición de stock. Varias devoluciones no pueden superar la cantidad ni el dinero de la venta original.
- `CashRegister` y sesión asociada: caja física identificada, operador autorizado y una sesión activa por caja.
- `OperationRequest`: clave de idempotencia, hash, scope y resultado de la operación.
- `OutboxMessage`: evento, versión del payload, scope, estado, intentos, próxima ejecución y vencimiento del bloqueo del worker.

Conservar importes finales en unidades monetarias menores. Para cantidades y costos fraccionarios, definir precisión y redondeo explícitos; usar enteros escalados o Decimal según el diseño validado. No migrar Float mecánicamente sin revisar cantidades existentes y compatibilidad SQLite/PostgreSQL.

Ejemplo: recibir dos cajas de 24 botellas suma 48 unidades. Vender tres botellas descuenta tres; vender una caja descuenta 24. Guardar la conversión aplicada en cada línea para que un cambio posterior de presentación no altere el historial.

## Flujo crítico de venta

```text
POS -> CompleteRetailSale
    -> validar sesión, empresa, sucursal, permiso y capacidad habilitada
    -> transacción compartida
       -> reclamar clave de idempotencia y verificar hash
       -> validar caja/operador y productos dentro del scope
       -> calcular precios, cantidades, impuestos y descuentos en servidor
       -> comprobar y descontar stock con protección concurrente
       -> guardar venta, líneas y pagos registrados
       -> actualizar caja, auditoría, resultado idempotente y outbox
    -> commit
    -> devolver ticket y estado de comprobante
Worker -> emitir/consultar comprobante e imprimir según configuración
```

Un fallo anterior al commit revierte todas las escrituras. Un reintento después del commit devuelve el mismo resultado. La misma clave con otro contenido produce conflicto.

La transacción cubre la base de datos, no una captura externa de tarjeta. Si se añade una pasarela real, usar intentos de pago, estados pendientes, idempotencia del proveedor y conciliación. Registrar un método de pago no demuestra una integración bancaria.

Un comprobante pendiente o una impresora caída no deben ocultar una venta ya confirmada. Mostrar sus estados y permitir recuperación. No repetir automáticamente una impresión física cuyo resultado sea incierto: distinguir fallo seguro de entrega desconocida. Outbox puede entregar más de una vez; no garantiza efectos externos exactamente una vez.

## Aislamiento y autorización

- Obtener empresa y sucursal de una sesión validada; no aceptar el scope del body.
- Exigir scope en todas las operaciones públicas, consultas, idempotencia y workers.
- Comprobar por separado que caja, cliente, producto, lote y almacén pertenecen al ámbito autorizado.
- Transferencias requieren acceso al origen y al destino, saldo suficiente y movimientos coordinados.
- Validar permiso y capacidad habilitada en servidor para cada acción; una operación desconocida falla de forma cerrada.
- Incluir tenant/sucursal en claves de caché, claves únicas y consultas según la propiedad real de cada entidad.

## Migración por etapas

1. **Caracterizar lo existente.** Identificar flujos críticos y ejecutar pruebas relevantes de cobro, permisos, inventario, reintentos y devoluciones. Los tests presentes no se han ejecutado en esta revisión.
2. **Establecer límites.** Introducir registro exhaustivo, separar comandos de restaurante por capacidad y mover sus recetas fuera del motor general de inventario. Conservar endpoints mediante adaptadores de compatibilidad.
3. **Añadir Minimarket.** Crear rubro, contratos, catálogo y checkout propios; usar el motor de inventario existente mediante una API pública y una transacción compartida.
4. **Ampliar datos.** Introducir cajas físicas, presentaciones, ubicaciones, devoluciones por línea y lotes según el surtido real. Migraciones aditivas, backfill verificable y conciliación de cantidades/importes antes de cambiar lecturas.
5. **Consolidar capacidades comunes.** Extraer ventas/caja/comprobantes sólo con contratos probados; adaptar Restaurante progresivamente. Evitar dos fuentes de escritura para un mismo saldo.
6. **Validar operación.** Probar con catálogo representativo, dos cajas concurrentes, periféricos reales y fallos de conexión. El modo offline requiere un diseño propio de sincronización y resolución de conflictos antes de prometer su disponibilidad.

No estimar duración por número de carpetas. Las decisiones que más cambian el alcance son venta por peso, lotes, varias cajas/locales, periféricos e internet intermitente.

## Criterios de aceptación

- Dos cajas intentan vender la última unidad: sólo una venta se confirma.
- Repetir checkout no duplica venta, dinero, movimientos ni solicitudes externas.
- Reutilizar una clave con contenido o sucursal diferentes se rechaza.
- Fallar tras guardar la venta y antes de descontar stock no deja datos parciales.
- Un cajero no cobra en una caja cerrada o ajena, ni cierra una caja con operaciones inconsistentes.
- Una devolución parcial mantiene la cantidad retornable y los importes correctos con descuentos y redondeos.
- Un producto con código que empieza en cero se encuentra sin alterar el código.
- Una recepción en cajas y venta por unidad mantiene exactamente el saldo esperado.
- Búsqueda y reportes contemplan artículos fuera de la primera página; métricas agregadas coinciden con la base.
- Ninguna operación permite cruzar empresas ni sucursales sin autorización.
- Un worker caído se recupera de su bloqueo vencido y procesa pendientes sin repetir efectos confirmados.
- Los recorridos críticos existentes de Restaurante, Barbería y Transporte siguen pasando.
- Ejecutar pruebas transaccionales también en PostgreSQL antes de publicar: SQLite por sí solo no valida el comportamiento de concurrencia de producción.

## Referencias de los enfoques

- La separación entre reglas de aplicación e infraestructura sigue el principio de dependencias de [Clean Architecture, Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures). Se adapta al repositorio TypeScript; no implica migrar a .NET.
- La entrega durable propuesta usa [Transactional Outbox, Chris Richardson](https://microservices.io/patterns/data/transactional-outbox), que describe persistencia atómica de intención y procesamiento posterior, incluidos posibles duplicados.

La elección de estos patrones y el orden de migración son conclusiones de esta revisión del repositorio.
