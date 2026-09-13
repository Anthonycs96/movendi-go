> Actualización 2026-09-13: el usuario amplió Minimarket de piloto a módulo operativo. El alcance implementado, sus pruebas y límites se mantienen en [MINIMARKET-OPERATIONS.md](MINIMARKET-OPERATIONS.md). Este documento conserva el planteamiento inicial.

# Auditoría y plan de evolución hexagonal del backend

Estado: plan aprobado e implementación incremental en curso. La auditoría siguiente conserva sus hallazgos iniciales; el avance actual se registra en [estado de migración](HEXAGONAL-MIGRATION-STATUS.md).

Alcance: revisión estática del árbol completo de `apps/backend/src`, sus imports entre áreas, rutas, modelos Prisma, contratos y pruebas existentes; lectura detallada de inventario, cobros, caja, pagos, preparación, devoluciones, comprobantes y servicios transversales relacionados. No es una auditoría funcional ejecutada ni una revisión exhaustiva de cada línea. No se accedió a datos de clientes, no se ejecutaron migraciones ni se probaron proveedores externos.

Este documento amplía y precisa `MINIMARKET-ARCHITECTURE-PROPOSAL.md`. Tras revisar las variaciones reales, **no se recomienda introducir una jerarquía SaleStrategy en la primera etapa**.

## 1. Diagnóstico actual

El repositorio ya es un monorepo con frontend y backend desplegables por separado. El backend es un monolito organizado por módulos, con Prisma y una base compartida; localmente utiliza SQLite y dispone de esquema y migraciones para PostgreSQL en producción.

Predomina el estilo de servicios procedimentales: un handler recibe método HTTP, segmentos, body y scope; valida, consulta Prisma, aplica reglas, escribe y devuelve un DTO. Hay funciones puras y adaptadores útiles, pero no existe una separación consistente entre dominio, aplicación e infraestructura.

Inventario del árbol TypeScript revisado: 152 archivos, incluidos tipos y pruebas. Hay 46 archivos bajo `app/api`, 27 en Restaurante, 27 en Transporte, 4 en Inventario y 3 en Barbería. El resto corresponde al núcleo y arranque. Estos recuentos describen organización, no calidad.

| Área existente | Responsabilidad actual |
| --- | --- |
| `app/api` | Adaptación HTTP, autenticación, despacho; algunas rutas también implementan operaciones |
| `core/auth`, `core/tenancy` | Sesiones, permisos, empresas, sucursales y configuración común |
| `core/platform` | Administración, alta guiada, cuotas, plantillas/importaciones y configuración de rubros |
| `core/billing` | Contratación y cobro de suscripciones SaaS, Stripe/mock, webhooks y correo |
| `core/database`, `audit`, `observability` | Cliente Prisma, auditoría y logs |
| `core/storage` | Metadatos y proveedores local/GCS/S3; también respuestas de descarga HTTP |
| `core/notifications`, `maintenance` | Alertas calculadas por rubro, limpieza y ejecución/recuperación de trabajos |
| `modules/inventory` | Artículos, movimientos, compras, conteos, recetas y devoluciones de stock |
| `modules/restaurant` | Pedidos, preparación, mesas, carta, promociones, caja, ventas, devoluciones, impresión y comprobantes |
| `modules/barbershop` | Clientes, profesionales, horarios, servicios, citas y caja/cobro |
| `modules/transport` | Planificación, viajes, flota, personal, gastos, pagos, liquidaciones, combustible, mantenimiento, neumáticos, importaciones y exportaciones |

Fortalezas que deben conservarse:

- Frontend sin acceso directo a Prisma y contratos serializables compartidos.
- Contexto de empresa/sucursal derivado de la sesión y comprobaciones de pertenencia.
- Transacciones, restricciones únicas y controles optimistas en flujos críticos.
- Reservas y snapshots de recetas que conservan costos y reglas históricas.
- Separación de comandos por área ya realizada en Transporte.
- Proveedores de almacenamiento con una interfaz real (`ObjectStorageProvider`).
- Funciones de asignación de centavos, días de negocio, preparación y planificación con pruebas existentes.
- Casos E2E para cobro concurrente, stock insuficiente, permisos, conteos y recuperación de impresión.

## 2. Problemas encontrados y evidencia

Las referencias son relativas a la raíz del repositorio. Las líneas corresponden a esta revisión.

| Prioridad | Hallazgo | Evidencia | Consecuencia |
| --- | --- | --- | --- |
| Alta | Inventario depende de configuración y entidades de Restaurante | `apps/backend/src/modules/inventory/server/commands.ts:10`, conteos desde `:96`; `service.ts:90` | No puede reutilizarse como motor independiente sin conocer recetas, pedidos y preparación |
| Alta | Infraestructura transaccional general alojada en Inventario | `modules/inventory/server/service.ts:30`; `core/auth/login-throttle.ts:4`; `modules/restaurant/server/sunat.ts:11` | Incluso autenticación y comprobantes importan Inventario para abrir una transacción |
| Alta | Diferente significado práctico de caja entre rubros | Barbería `commands.ts:152`; Restaurante `commands.ts:713` | Barbería incrementa `expectedCents` con todo el cobro; Restaurante sólo con CASH. Debe conciliarse antes de compartir el comportamiento |
| Alta | Protecciones de caja distintas | Barbería `commands.ts:157` y `:170`; Restaurante `commands.ts:745`, `:813`, `:847` | Restaurante vuelve a comprobar caja abierta y protege cierre/apertura; Barbería tiene lecturas previas y escrituras menos condicionadas. Requiere pruebas de carrera específicas |
| Alta | Persistencia del cobro y solicitud fiscal en operaciones separadas | Restaurante `commands.ts:738` y `:757`; `sunat.ts:127` | Una interrupción tras confirmar venta puede ocurrir antes de persistir la solicitud fiscal |
| Alta | Idempotencia de compra compara menos datos que otros flujos | Inventario `commands.ts:64` | Una clave repetida devuelve la compra sin comparar toda la entrada ni exigir sucursal en esa búsqueda; necesita contrato uniforme |
| Media | Dominio y protocolo mezclados mediante AppError | `core/auth/errors.ts:1` | El mismo archivo importa Prisma y `next/headers`, contiene status HTTP y construye Response; las reglas que lo importan heredan ese acoplamiento |
| Media | Auditoría fuera de algunas transacciones | `core/audit/audit.ts:5`; handlers de Inventario y Barbería | El negocio puede confirmarse y fallar después al guardar auditoría, devolviendo error a una operación ya realizada |
| Media | Inventario devuelve resultados acotados y calcula métricas sobre ellos | `modules/inventory/server/data.ts:8` | Más de 1.000 artículos o 300 movimientos pueden producir búsqueda/indicadores parciales |
| Media | Venta genérica incompleta como modelo de dominio | `prisma/schema.prisma:1086` | Sale comparte cabecera, pero líneas pertenecen a RestaurantOrder; Barbería no crea SalePayment en su checkout |
| Media | Comprobantes conocen explícitamente pedido, configuración y cliente de Restaurante | `modules/restaurant/server/sunat.ts:128` y `:134` | Minimarket no puede usar el emisor actual sin un adaptador de origen y separación de responsabilidades |
| Media | Formato fiscal mezcla cálculo y representación del proveedor | `modules/restaurant/server/fiscal-payload.ts:4` | Retorna nombres de campos de NubeFact y unidad NIU fija; cantidades por peso necesitan traducción explícita |
| Media | Reglas dentro de ruta de importación | `app/api/restaurant/menu-import/route.ts:88` | La importación depende del entorno HTTP para orquestar cambios de negocio |
| Media | Condiciones por rubro dispersas | `app/api/data/tenant/route.ts`, `core/platform/entitlements.ts`, `core/notifications/data.ts`, onboarding y tipos | Añadir Minimarket requiere actualizar varias selecciones, algunas con Transporte como caso por defecto |
| Baja | Servicio de almacenamiento mezcla operación y respuesta HTTP | `core/storage/service.ts`, `storedObjectDownloadResponse` | La parte de descarga debe permanecer en un adaptador HTTP, conservando el proveedor existente |

La diferencia de caja y las posibles carreras se detectaron por lectura; no se afirma que se hayan reproducido en ejecución. Cambiar la semántica histórica de Barbería será una corrección funcional separada de la extracción estructural.

Archivos con varias responsabilidades:

- Restaurante `commands.ts`: **884 líneas físicas**. Catálogo, clientes, configuración, impresión, pedidos, cocina, caja, cobro y comprobantes.
- Plataforma `onboarding.ts`: **410 líneas**. Pasos comunes, configuración de rubros, catálogo, roles y persistencia.
- Plataforma `catalog-workbook.ts`: **562 líneas**. Construcción de Excel, estilo, validaciones y lectura segura. Su tamaño no exige convertirlo en dominio: buena parte es un adaptador de documento legítimo.
- Transporte `data.ts`: **241 líneas**, con líneas extensas y consultas de múltiples áreas. Conviene dividir cuando cambien esas consultas; ya existe selección por sección.
- Barbería `commands.ts`: **197 líneas**, pero concentra agenda, maestros, ventas y caja. El volumen por sí solo no describe su complejidad.

## 3. Dependencias problemáticas

```text
Inventario -> configuración de Restaurante
Inventario -> tablas de pedidos, recetas y estados de preparación
Restaurante -> funciones internas de Inventario
Autenticación -> helper transaccional de Inventario
Comprobantes -> helper transaccional de Inventario
Plataforma -> detalles internos de configuración y alta de rubros
Notificaciones -> configuración y consultas específicas de rubros
Servicios de negocio -> AppError -> Prisma + Next.js + HTTP
Servicios de negocio -> Prisma directamente
```

Existe dependencia bidireccional conceptual entre Inventario y Restaurante; no se está afirmando que todos esos imports formen un ciclo de ejecución JavaScript.

No todos los imports cruzados son incorrectos: la composición debe conocer implementaciones; una ruta debe invocar su caso de uso; un caso de uso de Restaurante puede consumir la API pública de Inventario. Lo que debe eliminarse es la dependencia desde las reglas compartidas hacia detalles internos de un rubro.

## 4. Duplicación real y conceptos que deben permanecer separados

| Concepto | Coincidencia actual | Decisión |
| --- | --- | --- |
| Clientes | CRUD y comprobación de documento repetidos en Restaurante/Barbería | Reutilizar registro y pertenencia; mantener exigencia de documento/segmentación como reglas del consumidor |
| Dinero | Conversión a centavos y sumas repetidas | Funciones puras compartidas, reutilizando asignación de centavos existente tras comprobar su contrato |
| Caja | Apertura, cierre y saldo repetidos | Compartir después de fijar efectivo físico frente a total cobrado y condiciones concurrentes |
| Venta | Cabecera Sale compartida | Extraer contrato financiero y snapshot de líneas; cada rubro conserva cierre de pedido o cita |
| Inventario de repuestos | Transporte ya usa applyInventoryMovement | Mantener la reutilización y su origen de mantenimiento; no convertir un repuesto consumido en una venta |
| parse/owned | Helpers parecidos en varios handlers | Consolidación opcional y pequeña; no justifica repositorio genérico ni framework de casos de uso |
| Códigos y correlativos | Generación en varios sitios | Reutilizar sólo política compatible: un código operativo aleatorio no equivale a un correlativo fiscal |
| Notificaciones | Entrega/formato común, reglas distintas | Reutilizar canal y DTO; cada rubro calcula cuándo hay alerta |
| Payment | SalePayment, TransportPayment, BillingPayment | Mantener tres contextos: cobro de venta, flujo financiero de viaje y suscripción SaaS |

Mantener separados:

- Restaurante: mesa, cocina, reserva y consumo de ingredientes, cancelación según preparación, delivery y promociones propias.
- Barbería: disponibilidad de profesional, duración, conflictos de agenda, finalización de cita y comisiones.
- Transporte: flete, gastos, liquidaciones, pagos por dirección/tercero, flota, mantenimiento y neumáticos serializados.
- Plataforma: contratación y cobro del servicio SaaS, independiente del dinero de las tiendas.
- Minimarket: búsqueda por barcode, presentaciones, peso, venta rápida, selección de mercadería y reglas de devolución minorista.

## 5. Arquitectura objetivo

**Monolito modular + Hexagonal ligera + casos de uso + puertos/adaptadores + repositorios por necesidad.** Mantener Next.js, Prisma y despliegues actuales.

- Dominio: datos y funciones puras con vocabulario de negocio; sin Prisma, Next.js, HTTP, NubeFact, red ni impresoras.
- Aplicación: coordina casos de uso, autorización de operación, puertos y transacciones; no consulta Prisma directamente en las partes migradas.
- Infraestructura: implementa repositorios, transacciones y conectores; traduce errores de proveedores a errores de aplicación.
- Entrada HTTP: valida y convierte la entrada, resuelve sesión/scope, invoca el caso de uso y conserva contrato de respuesta.
- Composición: conecta implementaciones concretas mediante funciones y parámetros. No incorporar contenedor de inyección de dependencias.
- Lecturas: conservar adaptadores Prisma que devuelvan DTOs. No cargar agregados de dominio para pintar una lista ni introducir una segunda base de datos.
- Los módulos exponen un `public.ts`; los consumidores nuevos no importan sus detalles internos.

Los repositorios deberán tener operaciones con intención, como leer existencias dentro del scope, actualizar un saldo si sigue en la versión esperada o guardar una venta completa. No exponer `Prisma.WhereInput`, `Prisma.TransactionClient` ni un `BaseRepository<T>` a las capas internas.

### Fichas de módulos: responsabilidad, reglas y límites

**Inventario — primer módulo a extraer.**

- Responsabilidad/entidades: existencias y trazabilidad; InventoryItem, InventoryMovement, InventoryCount y líneas. Compras simples permanece como subárea por ahora.
- Reglas/casos: cantidad positiva con precisión definida, costo promedio, stock permitido, pertenencia, movimiento repetido; ApplyMovement, ReceivePurchase, CountInventory y ReverseMovement.
- Puertos/repositorios: InventoryRepository, repositorio de documentos de compra/conteo al extraer esos casos, contrato transaccional acotado. Una primera implementación puede agrupar saldo y movimiento en un único repositorio transaccional.
- Adaptadores: PrismaInventoryRepository, repositorio de prueba en memoria, fachada legacy para las funciones actuales.
- Permitidas: tipos básicos y auditoría/transacción mediante puertos. Eliminar: lecturas de OrderItem, configuración de Restaurante y dependencias HTTP. La corrección del conteo físico por reservas debe llegar desde un adaptador de Restaurante dentro de la misma transacción.

**Ventas — capacidad financiera compartida, extraída por etapas.**

- Responsabilidad/entidades: Sale, detalle histórico, descuentos aplicados y devoluciones; no administra pedidos, citas o viajes.
- Reglas/casos: total coherente, moneda, líneas inmutables una vez confirmadas, importes retornables, no duplicación; RecordSale y RefundSaleLines.
- Puertos/repositorios: SaleRepository y operación transaccional; cuando haga falta, IdempotencyRepository. Datos ya calculados por reglas autorizadas en servidor, nunca confiar en totales del navegador.
- Adaptadores: PrismaSaleRepository sobre Sale actual; adaptadores de origen para pedido/cita durante transición; líneas minoristas mediante extensión aditiva justificada.
- Permitidas: API pública de Pagos y Caja dentro de una composición transaccional, snapshots de origen y comprobante. Eliminar: navegación de mesas, cocina, agenda y dependencia del proveedor fiscal. El caso de uso del rubro coordina su ciclo y el registro financiero para evitar dependencias circulares.

**Caja — compartida tras acordar su semántica.**

- Responsabilidad/entidades: CashSession, CashMovement y posteriormente CashRegister si se requiere más de una caja física.
- Reglas/casos: apertura única por alcance actual, cierre consistente, efectivo disponible, autorización de retiros, registro de efectivo recibido/devuelto; OpenCashSession, CloseCashSession, RegisterCashEffect.
- Puertos/repositorios: CashSessionRepository; política de autorización/umbrales recibida de la aplicación.
- Adaptadores: PrismaCashSessionRepository y handlers legacy.
- Permitidas: dinero, scope, referencias de pago/venta; eliminar configuración de Restaurante y búsqueda implícita de cualquier caja para ventas nuevas. Mantener una caja por sucursal hasta que se apruebe multicaja.

**Pagos — comenzar como subárea de Ventas.**

- Responsabilidad/entidades: distribución del cobro de una venta; SalePayment y métodos/referencias.
- Reglas/casos: suma exacta, montos válidos, método habilitado, cálculo de efectivo y vuelto; ValidatePaymentAllocation y RecordSalePayments.
- Puertos/repositorios: inicialmente SaleRepository puede guardar venta y pagos juntos. PaymentRepository sólo si adquiere ciclo independiente. PaymentGateway sólo cuando exista captura externa real.
- Adaptadores: persistencia Prisma actual; en el futuro, proveedor de pago con estados e idempotencia.
- Permitidas: dinero y venta; eliminar cualquier intento de tratar Stripe Billing o TransportPayment como cobros POS. Que exista CARD/YAPE como método registrado no implica confirmación bancaria automática.

**Comprobantes / invoicing — separación entre documento y proveedor.**

- Responsabilidad/entidades: intención fiscal, documento, correlativo, snapshot y estado; aprovechar modelos actuales sin renombrarlos al principio.
- Reglas/casos: identidad de documento inmutable, total y líneas coherentes, no duplicar emisión; PrepareInvoice, IssueInvoice, ReconcileInvoice y IssueCreditNote.
- Puertos/repositorios: InvoiceRepository, secuencias en su límite transaccional, FiscalProvider, configuración/credenciales; el puerto del proveedor está en aplicación.
- Adaptadores: Prisma, NubeFact y traductor de snapshot de Restaurante. Cifrado y HTTP pertenecen a infraestructura.
- Permitidas: snapshot comercial estable; eliminar dependencia directa de RestaurantOrder y configuración de restaurante. Separar cálculo monetario neutral del payload NubeFact y su unidad de medida. Billing SaaS sigue aparte.

**Minimarket — piloto nuevo.**

- Responsabilidad/entidades: catálogo minorista, presentación y conversión a unidad base, flujo POS. Carrito puede seguir en cliente, pero los datos decisivos se validan en servidor.
- Reglas/casos: producto activo, cantidad/peso válidos, presentación, precio autorizado, devolución parcial; CompleteRetailSale, LookupBarcode y ReturnRetailItems.
- Puertos/repositorios: RetailCatalogRepository y RetailCheckoutUnitOfWork acotado con APIs públicas de inventario, venta, pagos/caja y snapshot fiscal.
- Adaptadores: Prisma para catálogo, rutas de API y entrada de lector; impresión a través del canal compartido cuando se habilite.
- Permitidas: capacidades comerciales públicas y acceso validado. Eliminar: dependencia de recetas, estados de cocina o agenda. No crear sus propias tablas paralelas de dinero/stock si ya hay un propietario común.

**Restaurante — conservar su dominio.**

- Responsabilidad/entidades: RestaurantOrder, OrderItem, ProductRecipe, mesas, cocina y promociones.
- Reglas/casos: reservar al pedir, liberar o registrar merma según preparación, cerrar pedido sin cancelar preparación pendiente; PlaceOrder, AddOrderItems, CompleteRestaurantOrder y CancelOrder.
- Puertos/repositorios: RestaurantOrderRepository/RecipeRepository sólo al extraer casos; API pública transaccional de Inventario/Ventas/Caja.
- Adaptadores: handlers legacy, Prisma de pedidos, cálculo de reservas aún físicas para conteos y enrutamiento de comandas.
- Permitidas: capacidades comunes mediante puertos. Eliminar progresivamente: importaciones internas del motor compartido y facturación HTTP en el caso de uso. No cambiar el momento actual de reserva para asemejarlo al POS.

**Barbería — extraer cobro antes que CRUD.**

- Responsabilidad/entidades: Appointment, StaffMember, StaffSchedule y Service.
- Reglas/casos: disponibilidad, duración, no cobrar cita cancelada, cierre único; ScheduleAppointment y CompleteAppointment.
- Puertos/repositorios: AppointmentRepository y consulta de disponibilidad sólo cuando se migren esos casos; APIs públicas de Ventas/Caja.
- Adaptadores: Prisma y rutas existentes.
- Permitidas: clientes, acceso y capacidades financieras acordadas; eliminar duplicación de cobro/caja una vez caracterizada la semántica histórica. Mantener servicios/profesionales sencillos como CRUD.

**Transporte — evaluar separadamente.**

- Responsabilidad/entidades: viajes, asignaciones, vehículos, documentos, gastos, liquidaciones, TransportPayment, mantenimiento y neumáticos.
- Reglas/casos: asignación válida, jornadas, vencimientos, transiciones, cierre de liquidación; AssignTrip, CloseSettlement y ConsumeMaintenancePart.
- Puertos/repositorios: mantener handlers actuales; extraer repositorios por caso complejo si cambia, nunca uno por cada tabla por obligación.
- Adaptadores: Prisma, exportación/importación y almacenamiento existentes.
- Permitidas: Inventario público para repuestos, acceso y almacenamiento. Eliminar dependencia de archivos internos al tocar esos puntos. No migrar liquidaciones y pagos de viaje a Sale/SalePayment.

**Identidad, permisos y clientes — conservar núcleo simple.**

- Responsabilidad/entidades: User, Role, Membership, Session, TenantScope y Customer.
- Reglas/casos: membresía válida, pertenencia y permiso; Authenticate, ResolveScope y gestión de clientes.
- Puertos/repositorios: contexto de ejecución validado, AccessPolicy donde el caso de uso lo necesite; no crear todos los repositorios de autenticación durante el piloto.
- Adaptadores: cookies/Next.js y Prisma actuales; errores HTTP quedan en el borde.
- Permitidas: infraestructura propia y tipos básicos; eliminar dependencia del login en el módulo Inventario trasladando el runner transaccional técnico cuando se extraiga, con compatibilidad de errores.

**Notificaciones e impresión — canales compartidos, reglas específicas.**

- Responsabilidad/entidades: OperationalNotification como DTO, solicitudes durables de entrega/impresión y estados. Reutilizar jobs actuales donde encajen.
- Reglas/casos: destino autorizado, reintento, deduplicación y entrega desconocida; EnqueueNotification, RequestPrint y ProcessDelivery.
- Puertos/repositorios: NotificationSource por rubro cuando haya varias fuentes, DeliveryPort/PrintPort y JobRepository sólo para entrega durable.
- Adaptadores: consultas de alertas de cada rubro, correo existente y agente de impresión actual.
- Permitidas: scope y DTOs de salida. Eliminar conocimiento de cocina y viajes en un supuesto dominio común de notificaciones; mantener esas reglas en sus fuentes. El worker de correo no es por sí solo una outbox general lista para reutilizar.

**Plataforma/Billing y almacenamiento — conservar límites existentes.**

- Responsabilidad/entidades: Tenant, Plan, BillingSubscription, BillingInvoice, BillingPayment; por separado StoredObject.
- Reglas/casos: acceso contratado, cuotas, aprovisionamiento, permisos de descarga; contratar, procesar webhook, almacenar/descargar objeto.
- Puertos/repositorios: conservar boundary de proveedor de billing y ObjectStorageProvider. Repositorios adicionales sólo si se extrae un caso con beneficio real.
- Adaptadores: Stripe/mock y Prisma; local/GCS/S3. Las plantillas Excel y Mistral son adaptadores especializados de importación.
- Permitidas: composición de altas mediante API pública de rubros, persistencia propia. Eliminar llamadas a detalles internos sólo al intervenir onboarding; separar Response de almacenamiento. No mezclar suscripciones con comprobantes minoristas ni renombrar todo core.

## 6. Estructura de carpetas propuesta

La siguiente estructura es el destino progresivo. No se crearán todas las carpetas vacías ni se moverán todos los archivos.

```text
apps/backend/src/
  app/api/                       rutas actuales; adaptadores de entrada
  composition/                   construcción de casos de uso y registros
  shared/
    domain/                      errores/cantidades/dinero realmente compartidos
    application/                 contratos mínimos de ejecución/transacción
    infrastructure/prisma/       implementación técnica del runner, cuando se extraiga
  core/                          núcleo actual, conservado
  modules/
    inventory/
      domain/                    cálculo de movimientos y reglas puras
      application/
        use-cases/
        ports/                   InventoryRepository y contratos necesarios
      infrastructure/prisma/     implementación del repositorio
      server/                    fachadas actuales durante la transición
      public.ts
    sales/
      domain/
      application/
      infrastructure/
      payments/                  subárea inicial; sin módulo autónomo obligatorio
      public.ts
    cash-register/               dominio, aplicación e infraestructura al extraer
    minimarket/                  POS y catálogo minorista
    invoicing/                   extracción posterior; puerto fiscal mínimo antes del POS
    restaurant/                  archivos actuales + casos extraídos gradualmente
    barbershop/                  estructura actual hasta su fase
    transport/                   estructura actual, evaluación propia
```

Los DTO compartidos continuarán en `packages/contracts`, divididos por capacidad sólo cuando el cambio aporte claridad. Los puertos del backend no deben ir a ese paquete ni exponerse al navegador.

## 7. Diagrama de dependencias objetivo

```text
IMPORTACIONES

Ruta HTTP / worker / fachada legacy
                  |
                  v
          Caso de uso (Application) -------> Dominio puro
                  |
                  v
         Puertos definidos dentro
                  ^
                  |
 Prisma repositories / NubeFact / impresora
             (implementaciones)

Composición conoce los puertos y las implementaciones y los conecta.

CAPACIDADES

CompleteRetailSale      -> Inventario + Ventas/Pagos + Caja + intención fiscal
CompleteRestaurantOrder-> Pedidos/Recetas + las mismas capacidades compatibles
CompleteAppointment    -> Citas + Ventas/Pagos + Caja
Mantenimiento          -> Inventario
Finanzas Transporte    -> modelos financieros propios
Billing SaaS           -> suscripción y cobro de plataforma
```

Las flechas de importación apuntan hacia las capas internas. Que una implementación Prisma sea invocada en ejecución no significa que el caso de uso deba importarla. Un repositorio en memoria prueba las reglas; la atomicidad real se prueba además con Prisma/base de datos.

## 8. Transacciones: estado actual y propuesta

### Lo que ya hace el sistema

Restaurante confirma venta dentro de `withInventoryTransaction`: reclama la versión del pedido, aplica canje de puntos, actualiza efectivo con condición de caja abierta, crea Sale/SalePayment, finaliza el consumo/reserva de inventario, cambia pedido/mesa cuando corresponde y escribe auditoría.

Esto ya aporta atomicidad de las escrituras incluidas. No hay que sustituirlo por llamadas independientes a repositorios que confirmen por su cuenta.

Dos matices fundamentales:

1. Los ingredientes se reservan al registrar el pedido. En el checkout moderno se vinculan/reclasifican movimientos; no se descuentan por segunda vez. Los pedidos antiguos tienen otra ruta de consumo.
2. Actualmente el checkout incrementa `expectedCents` y guarda pagos, pero no crea una fila CashMovement por cada venta; CashMovement se utiliza para movimientos explícitos y devoluciones. Añadir esa fila sin adaptar reportes podría duplicar entradas.

El comprobante se inicia después del commit. El emisor reserva número y payload en otra transacción y llama al proveedor después. Conservar las llamadas externas fuera de la transacción, pero persistir la intención de emisión junto con el cobro en el flujo nuevo.

### Diseño transaccional

Definir un puerto acotado al caso de uso, por ejemplo `RetailCheckoutUnitOfWork`, que ejecute una operación con repositorios/APIs transaccionales. Su implementación `PrismaRetailCheckoutUnitOfWork` abre **una** transacción interactiva y construye todos los repositorios usando **el mismo tx**.

El tx sólo existe en infraestructura/composición. La aplicación recibe InventoryRepository, SaleRepository, CashSessionRepository y los demás colaboradores necesarios ligados a esa transacción. No usar cliente global dentro de esos adaptadores durante el caso ni abrir transacciones anidadas por repositorio.

Para no convertir esto en un contenedor global de dependencias, cada UoW expone sólo las capacidades de su operación. El caso del rubro coordina su estado particular y las capacidades comunes; Inventario no conoce el UoW completo de ventas.

```text
Validar entrada y scope autenticado
  -> una transacción
     -> comprobar/reclamar idempotencia (scope + operación + hash)
     -> releer estados críticos: caja, productos, precios/versión y existencias
     -> aplicar reglas, validar pagos y calcular importes en servidor
     -> guardar cabecera/líneas de venta y pagos
     -> descontar/vincular movimientos según el caso de negocio
     -> registrar efecto de caja
     -> guardar snapshot fiscal + solicitud durable si corresponde
     -> auditoría + resultado idempotente
  -> commit
  -> respuesta de venta confirmada
  -> worker emite, consulta o imprime fuera de la transacción
```

Mantener inicialmente aislamiento Serializable y control optimista ya presentes; los errores técnicos reintentables se manejan en infraestructura con límite y, cuando se incorpore, espera breve aleatoria. El caso completo debe volver a leer lo mutable en cada intento o rechazar versiones obsoletas. Una comprobación fuera de transacción no basta por sí sola.

Dinero e inventario no se comunican mediante eventos asíncronos para confirmar la venta: requieren el mismo commit. Outbox se reserva para efectos externos y trabajo posterior. El worker debe usar identificadores estables, reintentos y recuperación de locks vencidos; la entrega puede duplicarse. La impresión física con resultado incierto requiere consulta/confirmación, no prometer exactamente una impresión.

Si se requiere ledger explícito de Caja, introducir origen tipado y referencia única a venta/pago; elegir una fuente de sumatoria y adaptar reportes para no contar SalePayment y CashMovement dos veces. Hasta esa fase se conserva la representación actual.

Los pagos registrados manualmente son escrituras locales. Una captura real de tarjeta no se revierte con PostgreSQL: requiere intento de pago pendiente, clave idempotente del proveedor, conciliación y, cuando proceda, compensación. No simular atomicidad distribuida con una transacción Prisma.

### Cambios de esquema

**Primera intervención: ninguno.** Las interfaces pueden mapear los modelos actuales.

Antes del piloto se justificarán migraciones aditivas para detalle de venta minorista, catálogo/presentaciones y solicitud fiscal/idempotencia durables si las estructuras existentes no pueden representarlos. No crear una segunda cabecera financiera que compita con Sale. La decisión concreta del detalle debe documentar lectura histórica y origen de pedido/cita.

Multicaja, lotes, almacenes y devoluciones parciales son ampliaciones funcionales con modelos propios, no requisitos para que el código sea hexagonal. Se incorporan cuando formen parte del piloto. Cantidades Float y precios/costos fraccionarios requieren política explícita de precisión antes de migrarlos.

## 9. Strategy: decisión ajustada tras la auditoría

No implementar inicialmente `SaleStrategy`, `RestaurantSaleStrategy`, `MinimarketSaleStrategy` ni `BarbershopSaleStrategy`.

Las variaciones afectan momentos y estados diferentes: reserva y cocina, carrito minorista o cita. Una estrategia general obligaría a exponer demasiados hooks y dependencias. Usar casos de uso independientes que compongan capacidades comunes.

Sí podría justificarse una política intercambiable más pequeña cuando existan dos implementaciones necesarias bajo el mismo contrato: cálculo de necesidades de stock, selección de lotes o una regla de descuento. Para el primer piloto, una función explícita que convierta presentaciones a unidades basta si sólo existe ese comportamiento. No crear implementación para un rubro futuro únicamente para completar una jerarquía.

Un registro de módulos es adecuado para despacho/navegación/capacidades. Las condiciones en composición son normales; las condiciones de tipo de negocio dentro de Inventario son las que deben salir.

## 10. Qué no migrar y riesgos

No migrar ahora:

- CRUD sencillo de profesionales, servicios, proveedores/maestros y configuración que no componga reglas críticas.
- UI, proxy del frontend y contratos HTTP estables.
- Proveedores de almacenamiento ya separados; sólo mover la respuesta HTTP si se interviene ese flujo.
- Framework, ORM, arquitectura de despliegue, esquema entero ni nombres físicos de tablas.
- Billing de suscripciones, exportaciones/Excel y todo Transporte por obligación estética.
- Funciones puras que ya tienen buen contrato y pruebas; reutilizarlas o moverlas sólo por una dependencia real.

| Riesgo | Medida |
| --- | --- |
| Pérdida de atomicidad al extraer repositorios | Repositorios ligados al mismo tx; prueba de fallo entre cada escritura crítica |
| Doble descuento de recetas | Conservar reserva, snapshots y ruta legacy; probar pedido nuevo y antiguo |
| Cambiar caja histórica de Barbería | Caracterizar y conciliar datos; corrección funcional separada, sin reescribir saldos a ciegas |
| Doble conteo de efectivo | Una fuente de ledger/reportes y referencia única por efecto |
| Fuga de scope | Repositorios acotados, pertenencia de relaciones y pruebas entre empresas/sucursales |
| Duplicados por reintentos | Clave + hash + scope y transacción; replay del mismo resultado en el flujo nuevo |
| Regresión de códigos/mensajes HTTP | Fachadas y traducción de errores compatibles; no cambiar ALREADY_PAID del endpoint antiguo silenciosamente |
| Cambio de identidad fiscal o payload | Snapshot inmutable, mismo correlativo en consulta/reintento y conciliación |
| Diferencias SQLite/PostgreSQL | Integración y concurrencia también en PostgreSQL antes de publicación |
| Sobreingeniería | Puertos por necesidades del caso; sin BaseRepository, contenedor DI ni carpeta por cada tabla |
| Migración de datos con pérdida de precisión | Cambios aditivos, respaldo, backfill verificable y comparación de cantidades/importes |
| Dos motores activos para un mismo saldo | Un único escritor; rollback de código compatible, sin doble escritura durante transición |

## 11. Plan incremental con puertas de validación

| Etapa | Alcance | Salida verificable |
| --- | --- | --- |
| 0. Línea base | Caracterizar contratos y comportamiento actual; separar defectos conocidos de refactor | Pruebas relevantes ejecutadas sobre estado inicial y resultados documentados |
| 1. Inventario | Extraer cálculo, caso de movimiento, repositorio y fachada; después compras/conteos y adaptación de recetas | Mismos endpoints/saldos/errores, dominio sin Prisma/Next, transacciones conservadas |
| 2. Ventas | Definir registro financiero compartido y snapshot; un caso por rubro | SaleRepository específico, propiedad clara de líneas y cierre atómico de origen |
| 3. Caja | Unificar semántica y protecciones; mantener alcance actual de una caja por sede | Pruebas de efectivo/no efectivo, cobro contra cierre y devolución |
| 4. Pagos | Extraer distribución y persistencia como subárea de ventas | Montos consistentes; contratos legacy preservados; sin mezclar billing/transporte |
| 5. Minimarket piloto | Catálogo y checkout sobre capacidades comunes; puerto fiscal mínimo y persistencia de intención donde corresponda | Venta minorista completa, sin duplicación de stock/caja; contrato y esquema justificados |
| 6. Comprobantes/integraciones | Generalizar emisor con snapshot, adaptar NubeFact y entrega durable | Comprobante recuperable, mismo número en reintentos y proveedor fuera de tx |
| 7. Restaurante progresivo | Delegar sus capacidades comunes y extraer casos complejos | Recetas, cocina, cancelación, cobro y devoluciones conservan comportamiento |
| 8. Barbería | Adaptar cobro/caja tras resolver diferencia semántica | Agenda sin regresión y saldos conciliados |
| 9. Transporte | Evaluación de cambios concretos | Conservar liquidaciones propias y reutilizar inventario sin dependencia interna |

El piloto de fase 5 no puede emitir comprobantes reutilizables de forma completa si la separación fiscal mínima se pospone totalmente a fase 6. Se adelanta sólo ese contrato/snapshot necesario; la extracción completa y la migración del restaurante ocurren después. Si el piloto exige emisión desde el primer día, esa parte mínima del adaptador también debe adelantarse, sin duplicar el emisor.

Aplicar reglas de imports al código nuevo/migrado mediante ESLint, dejando explícitamente delimitado el legado. Las restricciones crecen conforme se migra; no bloquear todo el repositorio de golpe.

En cada etapa: verificar sólo las pruebas relacionadas y los checks del repositorio pertinentes. Comparar resultados con la línea base. Mantener el diseño revisable mediante cambios pequeños y revertibles. No efectuar un despliegue o migración por el solo hecho de aprobar un documento de arquitectura.

## 12. Primera intervención concreta propuesta para aprobación

**Nombre: extraer el movimiento de inventario conservando el servicio público actual.**

Alcance de implementación:

1. Caracterizar `applyInventoryMovement`: redondeo, stock insuficiente, costo promedio, claves repetidas y rollback. Incluir sus consumidores actuales de Restaurante y mantenimiento de Transporte.
2. Extraer cálculo de movimiento a dominio puro: estado anterior + operación -> estado posterior y datos del movimiento; sin Prisma ni AppError HTTP.
3. Definir `InventoryRepository` con operaciones mínimas de lectura acotada, búsqueda de repetición, actualización condicional y registro del movimiento. Toda la secuencia comparte transacción.
4. Implementar `PrismaInventoryRepository`, ligado al tx recibido en infraestructura, y el caso `ApplyInventoryMovement` que coordina repositorio y cálculo.
5. Conservar la firma actual de `applyInventoryMovement(tx, scope, input)` como fachada legacy que construye el adaptador y traduce errores al contrato anterior. Los consumidores actuales conservan su tx y sus endpoints.
6. Mantener por ahora `withInventoryTransaction` y las funciones de recetas en su ubicación: extraer el runner técnico y adaptar recetas/conteos será la siguiente parte de Inventario, tras validar la primera. No mezclar el cambio de autenticación con esta primera entrega.
7. Añadir límites de imports para el dominio/aplicación nuevos y pruebas relevantes; cero cambios de Prisma/schema, endpoints, UI o reglas funcionales de caja.

Criterios de aceptación:

- Dominio/aplicación nuevos no importan Prisma, Next.js, `server-only`, HTTP ni configuración de Restaurante.
- Entradas/salidas y códigos de error del servicio legacy mantienen compatibilidad.
- Repetir movimiento no duplica stock; una clave incompatible conserva el rechazo actual.
- Un fallo al insertar el movimiento revierte la actualización del saldo en la integración real.
- Consumir la última unidad concurrentemente no genera saldo negativo bajo la política vigente.
- Reservas, consumo y reversión de Restaurante siguen usando la misma transacción de su operación.
- Consumo de mantenimiento de Transporte sigue funcionando.
- No migraciones de datos, no cambios de API, no duplicación del motor de stock.

Pruebas sugeridas: unitarias de cálculo; contrato del repositorio; integración transaccional de inventario; escenarios de stock y cobro concurrente de `e2e/restaurant-production-audit.spec.ts`; escenarios relevantes de mantenimiento; typecheck/lint y build cuando corresponda a los archivos tocados. Usar base desechable y PostgreSQL para validar concurrencia real antes de publicar. No afirmar que estos checks han pasado hasta ejecutarlos en la implementación.

Las mejoras funcionales detectadas —semántica de caja de Barbería, idempotencia de compras, métricas parciales— quedan identificadas para cambios propios. No introducirlas silenciosamente dentro de la primera extracción.

## Referencias del enfoque

- [Artículo original de Ports & Adapters, Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture): aislamiento de la aplicación frente a dispositivos, interfaz y persistencia.
- [Transacciones, documentación oficial de Prisma](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions): transacciones interactivas, aislamiento y reintentos. La página actual documenta v7; este repositorio usa Prisma 5.22 y ya implementa `$transaction`/Serializable. No se propone adoptar APIs exclusivas de v7 ni actualizar el ORM.
- [Transactional Outbox, Chris Richardson](https://microservices.io/patterns/data/transactional-outbox): intención persistida junto con la operación y entrega posterior con posibles duplicados.

Las decisiones sobre módulos, alcance y orden de migración se derivan del código revisado, no de copiar una plantilla externa.

La primera intervención y las entregas posteriores de Inventario fueron autorizadas por el usuario. Consultar el estado de migración para distinguir entregas verificadas de etapas aún pendientes.
