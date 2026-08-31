# Reporte de 40 atenciones transaccionales reales

Fecha: 15 de agosto de 2026  
Resultado final: **40/40 aprobadas**  
Duración de la ejecución final: **1 minuto 30 segundos**  
Reintentos automáticos: **0**  
Mocks: **ninguno**

## Qué significa “real” en esta batería

Cada escenario inició sesión con un usuario real del sistema y creó o modificó registros en la base SQLite mediante las rutas reales de la aplicación. Las verificaciones incluyeron API, persistencia y, cuando correspondía, la representación posterior en la interfaz.

No se contaron como atenciones las simples cargas de pantalla. La base fue restaurada antes de la batería y nuevamente al finalizar.

## Barbería — 20 atenciones

| N.º | Atención ejecutada | Resultado |
| ---: | --- | --- |
| 01 | Crear cliente y cita pendiente; comprobarla en agenda | Aprobada |
| 02 | Crear y confirmar una cita | Aprobada |
| 03 | Confirmar, reprogramar y volver a pendiente | Aprobada |
| 04 | Crear y cancelar una cita pendiente | Aprobada |
| 05 | Confirmar y marcar como no asistió | Aprobada |
| 06 | Cobrar una atención con efectivo | Aprobada |
| 07 | Cobrar una atención con tarjeta | Aprobada |
| 08 | Cobrar una atención con transferencia | Aprobada |
| 09 | Cobrar una atención con Yape | Aprobada |
| 10 | Cobrar una atención con Plin | Aprobada |
| 11 | Cobrar una atención con otro medio | Aprobada |
| 12 | Bloquear finalización sin pasar por caja | Aprobada |
| 13 | Bloquear el doble cobro de la misma atención | Aprobada |
| 14 | Bloquear cambios después de cancelar | Aprobada |
| 15 | Bloquear reprogramación después de cancelar | Aprobada |
| 16 | Bloquear citas superpuestas del mismo profesional | Aprobada |
| 17 | Permitir citas simultáneas con profesionales distintos | Aprobada |
| 18 | Permitir que el rol Barbero confirme una atención autorizada | Aprobada |
| 19 | Reprogramar cambiando profesional y servicio | Aprobada |
| 20 | Bloquear cobro sin caja; reabrir caja y completar el cobro | Aprobada |

## Restaurante — 20 atenciones

| N.º | Atención ejecutada | Resultado |
| ---: | --- | --- |
| 21 | Crear mesa, reservarla y liberar la reserva | Aprobada |
| 22 | Bloquear un pedido sobre una mesa reservada | Aprobada |
| 23 | Abrir pedido de un producto y comprobarlo en Pedidos | Aprobada |
| 24 | Abrir pedido con productos de cocina y barra | Aprobada |
| 25 | Calcular el total usando tres unidades reales | Aprobada |
| 26 | Vincular el pedido con un cliente | Aprobada |
| 27 | Registrar atención sin cliente identificado | Aprobada |
| 28 | Pasar una comanda de cola a preparación | Aprobada |
| 29 | Pasar una comanda de preparación a lista | Aprobada |
| 30 | Entregar la comanda y sincronizar el pedido como servido | Aprobada |
| 31 | Trasladar el pedido entre dos mesas | Aprobada |
| 32 | Bloquear traslado hacia una mesa ocupada | Aprobada |
| 33 | Cancelar el pedido y liberar realmente la mesa | Aprobada |
| 34 | Cobrar con efectivo y limpiar la mesa | Aprobada |
| 35 | Cobrar con tarjeta y limpiar la mesa | Aprobada |
| 36 | Cobrar con transferencia y limpiar la mesa | Aprobada |
| 37 | Cobrar con Yape y limpiar la mesa | Aprobada |
| 38 | Cobrar con Plin y limpiar la mesa | Aprobada |
| 39 | Cobrar con otro medio y limpiar la mesa | Aprobada |
| 40 | Bloquear cobro sin caja; reabrir caja y completar el pedido | Aprobada |

## Hallazgo durante la prueba

La primera ejecución terminó 39/40 porque el test 30 cambió de pantalla antes de que concluyera la petición de “Entregado”. El servidor todavía mostraba correctamente el estado previo “Listo”. Se ajustó la sincronización del test para esperar la confirmación del servidor, el caso pasó aisladamente y después la batería completa terminó 40/40. No fue necesario modificar la lógica funcional de la aplicación.

## Cómo repetirla

```powershell
npm.cmd run e2e:attentions:40
```

Este comando restaura la base demo y ejecuta exclusivamente las 40 atenciones reales.
