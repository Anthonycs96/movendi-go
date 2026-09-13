# Etapas 7 y 8: Restaurante y Barbería

Entrega local del 13 de septiembre de 2026. Se conserva el monolito modular con arquitectura hexagonal ligera: casos de uso, puertos específicos y adaptadores Prisma. No se añadieron microservicios, repositorios genéricos ni una jerarquía de estrategias por rubro.

## Restaurante

El manejador HTTP delega creación de pedidos, adiciones, cobro, cambios de estado, cocina y devoluciones. Los nuevos casos de uso viven en `application`, las reglas de disponibilidad para cobrar y las transiciones de líneas en `domain`, y la coordinación con Prisma en `infrastructure/prisma`.

- `writeOrder` conserva cuota, ocupación de mesa, líneas, recetas, comanda e impresión. Crear o ampliar un pedido incluye ahora la auditoría en la misma transacción.
- `checkoutOrderUseCase` coordina versión del pedido, canje de puntos, caja, Venta/Pagos, consumo de ingredientes, finalización, auditoría y solicitud fiscal durable.
- `changePreparation` valida selección de líneas, áreas y transiciones; `changeOrderState` coordina cancelación o avance. La auditoría ya no queda después del commit.
- `refundSaleUseCase` coordina devolución de efectivo, reposición o merma, cocina/mesa, puntos, registro, auditoría y nota fiscal. Repetir una devolución compatible conserva su identidad.
- `claimOrder` mantiene la protección de versión compartida; `aggregatePreparationStatus` está en dominio y conserva el export previo para consumidores existentes.

Se mantienen las recetas históricas, preparación por área, pedidos pagados todavía pendientes de entrega y la diferencia entre cancelar antes de preparar o registrar merma. El CRUD y acciones auxiliares de configuración, delivery y mesas permanecen en la fachada existente; esta etapa no declara una migración de cada operación del rubro ni cambia esas políticas.

## Barbería

El cobro de citas utiliza `checkoutAppointmentUseCase` y el puerto `AppointmentCheckoutPort`. Su adaptador participa en una transacción serializable y delega a Ventas y Caja compartidas. La cita, venta, detalle de pago, saldo y auditoría se confirman o revierten juntos.

Los nuevos turnos usan `CashSession.balanceBasis = CASH_ONLY`. Solo CASH aumenta el efectivo esperado; tarjeta, Yape, Plin, transferencia y otros métodos siguen registrados como ingresos de ventas. Se guarda `SalePayment` y el subtotal de los nuevos cobros. Las ventas anteriores no se rellenan ni recalculan.

La agenda permite elegir el medio de pago al cobrar; ya no impone Yape. Caja identifica el efectivo esperado. Los DTO duplicados en backend y frontend se sustituyeron por reexports del contrato compartido.

## Transición de cajas antiguas

La migración aditiva `20260913040000_cash_balance_basis` añade un campo sin reconstruir tablas. Marca las sesiones preexistentes de Barbería como `ALL_PAYMENTS`; sus importes y estado permanecen intactos. Restaurante mantiene `CASH_ONLY`.

Una caja antigua abierta debe cerrarse conciliando todos sus medios de pago. La pantalla lo explica y el servidor rechaza nuevos cobros en ese turno con `CASH_RECONCILIATION_REQUIRED`. Al abrir el siguiente, empieza el control de efectivo. Los cierres anteriores conservan su interpretación histórica.

La base local se actualizó con respaldo verificado: `backups/sqlite/movendi-go-2026-09-13T16-08-17-338Z.db`. Se compararon todos los campos preexistentes de 118 tablas y 643 filas: permanecen iguales. Integridad y referencias aprobadas. Evidencia: `output/stages678/local-migration-verification.json`. No se desplegó ni se migró producción.

Para revertir, detener los servicios y restaurar el respaldo verificado siguiendo el procedimiento del proyecto. Esa restauración descarta operaciones posteriores al respaldo. No ejecutar el código anterior sobre turnos nuevos `CASH_ONLY`: el código anterior sumaba todos los medios y cambiaría su significado. Si ya hubo operaciones nuevas, primero conciliar y preparar una reversión específica que las conserve.

## Verificación

- Backend: 149 pruebas aprobadas; 23 escenarios exclusivos de PostgreSQL omitidos únicamente en SQLite.
- PostgreSQL 17 real: 113 pruebas aprobadas, sin omisiones, después de aplicar 21 migraciones y comparar esquema.
- Incluye cobros simultáneos, cierre durante el cobro, cocina frente a cancelación, protección por empresa/sucursal, conservación de turnos antiguos y auditoría fallida en cobro, creación, adición y estado de pedidos.
- E2E: 41 escenarios distintos aprobados: 35 Restaurante, 4 Minimarket y 2 Barbería, incluyendo agenda, edición, reprogramación, pago digital, efectivo, solapamientos y cierre. La primera ampliación de la prueba creó una cita solapada; se conservó el rechazo esperado y se eligió un horario libre para el segundo cobro.
- TypeScript y ESLint aprobados; ambos servicios compilan. El diálogo de pago y Caja se revisaron visualmente.
- Dos pruebas adicionales del ejecutor fiscal y la migración histórica aprobadas. Detalle operativo: [ejecutor fiscal](FISCAL-RUNNER-OPERATIONS.md).

Los registros están en `output/stages678-*.log`. Persiste el diagnóstico de Next.js `The destination stream closed early` durante algunas navegaciones de Restaurante; no fallaron esos escenarios y esta entrega no declara corregido ese diagnóstico. La configuración fiscal real, equipos físicos y publicación siguen fuera de esta validación local.
