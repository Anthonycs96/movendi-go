# Caja: capacidades compartidas y concurrencia

## Implementación

`modules/cash` contiene las reglas de importes y diferencias de cierre, los casos de apertura/cierre/movimiento/efecto sobre saldo, el puerto `CashRepository` y su adaptador Prisma. Dominio y aplicación no dependen de Prisma, HTTP, Next.js ni de otros rubros. La fachada recibe la transacción y el ámbito de empresa, sucursal y actor; no confirma operaciones por separado.

El repositorio concentra las escrituras operativas de `CashSession` y `CashMovement`. Filtra por empresa y sucursal, valida la sucursal al abrir y actualiza el saldo sólo si la caja sigue abierta. Los retiros no pueden exceder el disponible; los incrementos no pueden desbordar la columna de centavos. Los cierres comparan el saldo esperado antes de escribir.

Restaurante conserva permisos de retiro, configuración de tolerancia y mensajes/contratos de sus rutas. La política de aprobación del cierre entra como datos al caso de uso. Sus esquemas y adaptación HTTP se ubican en `restaurant/server/cash-commands.ts`. Las consultas de pantalla permanecen en sus adaptadores actuales.

Barbería usa las mismas operaciones para abrir y cerrar. Sus aperturas nuevas ocupan el `activeSlot = OPEN` ya existente y sus cierres lo liberan; no hizo falta una migración. Las cajas anteriores con slot nulo siguen siendo reconocidas por su estado y ámbito. No se reparan ni se eliminan automáticamente registros históricos.

## Compatibilidad de saldos y transacciones

El módulo común recibe un efecto en centavos; no decide qué medios de pago afectan la caja. Restaurante sigue enviando sólo el efectivo. Barbería conserva su saldo legacy que incluye todos los métodos. Conciliar los históricos de Barbería y cambiar esa presentación corresponde a su adaptación pendiente, no se resuelve alterando saldos silenciosamente.

Los cobros de ambos rubros y las devoluciones de Restaurante consumen la misma capacidad de Caja dentro de sus transacciones de negocio. Un efecto sobre saldo depende de la reclamación/idempotencia de la venta o devolución que lo origina; no se expuso como endpoint independiente. Las devoluciones continúan creando su movimiento de salida una sola vez y conservan su error específico de efectivo insuficiente.

Se mantienen los hashes históricos de claves de apertura y movimiento. Repetir una solicitud después de cerrar una caja recupera su resultado y no la reabre ni modifica dinero. Reutilizar una clave con otro contenido se rechaza.

En Barbería se corrigieron dos problemas de concurrencia: apertura y cierre ahora ejecutan lecturas/escrituras bajo Serializable, y su auditoría participa en la misma transacción. Si falla la auditoría de apertura o cierre, tampoco se confirma la caja. La auditoría del checkout de citas conserva su posición anterior; pertenece a la adaptación restante de Barbería.

## Código eliminado o sustituido

- Bloques completos de apertura, cierre y movimiento del controlador grande de Restaurante.
- Implementaciones directas de apertura y cierre en Barbería.
- Actualizaciones repetidas de saldo en cobros y devolución, y creación directa del movimiento de devolución.
- Doble comprobación de repetición de movimiento en el controlador de Restaurante: ahora hay un único caso de uso transaccional.
- Importación de permisos que quedó sin uso en el controlador de Restaurante.

El parser Zod compartido conserva su comportamiento y corrige su tipo de retorno para representar los valores por defecto ya aplicados. ESLint protege la dirección de dependencias de Caja; se verificó con importaciones prohibidas en memoria.

## Validación

- Cuatro caracterizaciones aprobadas antes y después de extraer: operación completa/idempotencia, permisos/tolerancia/aislamiento, compatibilidad de Barbería y rollback de movimiento/auditoría.
- Backend: 97 pruebas aprobadas, con 11 pruebas exclusivas de PostgreSQL omitidas en SQLite.
- PostgreSQL: 54 pruebas aprobadas sin omisiones (31 de Inventario, 11 de Ventas y 12 de Caja). Sus 18 migraciones se aplicaron desde cero y el esquema resultante coincide con el esperado.
- Cinco casos concurrentes nuevos con barreras reales: apertura doble de Barbería, apertura con misma clave, dos retiros sobre el mismo saldo, repetición del mismo movimiento y cierre frente a un movimiento.
- Se verificaron también relaciones ajenas, reutilización de claves en otra sede y rollback de apertura/cierre de Barbería cuando falla la auditoría.
- TypeScript, lint del código afectado y builds de producción de backend/frontend aprobados.
- E2E: 38 escenarios aprobados (1 de cobro de Barbería, 6 de configuración de Restaurante y 31 de auditoría de Restaurante). El runner terminó con código 0 y restauró los datos iniciales de su base separada.
- Persisten mensajes de transacción cerrada durante la importación de carta y `The destination stream closed early` durante navegación, sin fallos en esos escenarios; no se declara resuelto su origen.

La primera preparación E2E encontró el motor de Prisma ocupado por las pruebas del backend. El reintento se realizó después de que terminaran y pudo generar el cliente y compilar. No se cambió el esquema, no se migró producción ni se publicó una versión en esta entrega.

Con esta evidencia se cierra la etapa 3, Caja. Quedan cinco etapas, empezando por el piloto de Minimarket. Seguimiento: [estado de migración](HEXAGONAL-MIGRATION-STATUS.md).
