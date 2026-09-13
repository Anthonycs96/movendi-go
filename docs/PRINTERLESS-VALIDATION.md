# Pruebas sin impresora física

Validación local del 13 de septiembre de 2026. Alcance: impresión de Restaurante y operaciones de Restaurante y Minimarket. No certifica todos los rubros del SaaS ni compatibilidad con equipos físicos.

Resultado final: 106 pruebas PostgreSQL, 38 E2E (34 Restaurante y 4 Minimarket) y una prueba del agente que agrupa ocho ejecuciones, todas aprobadas. Ambos servicios compilaron y ESLint pasó para los archivos de prueba modificados. La base `dev.db` conserva el mismo SHA-256 antes y después; los servicios y el clúster temporal terminaron al finalizar.

## Qué se verifica

- El agente real se ejecuta como proceso y envía bytes a una impresora TCP virtual en loopback. Se comprueban identificación de la comanda, producto, cantidad, nota y comandos ESC/POS de inicio y corte.
- Ocho ejecuciones del agente comprueban reintento tras reinicio, registro previo incierto, registro corrupto, pérdida de respuesta del servidor y puerto de impresora desconectado. El receptor registra dos envíos para dos trabajos distintos; los reintentos no agregan envíos.
- Una desconexión conserva el trabajo como incierto. Restaurar la conexión no autoriza automáticamente una reimpresión. El agente informa envío, nunca confirmación física.
- PostgreSQL temporal comprueba comportamiento, aislamiento por empresa/sucursal, reversión y concurrencia en inventario, ventas, caja, Minimarket, facturación e impresión: 106 pruebas aprobadas, ninguna omitida.
- La prueba de simulación en Cocina comprueba que el botón de formato invoca la impresión del navegador, renderiza el recibo con estilos de impresión y permite cerrar sin solicitudes de modificación ni cambios en la fila de la comanda. La llamada a `window.print` se intercepta: no prueba el diálogo nativo ni el guardado manual de PDF.
- Las jornadas automatizadas comprueban compras, existencias, pedidos/ventas, cobros, tickets, devoluciones, caja, permisos y facturación en cola. Los proveedores externos no reciben documentos.

## Reproducción

Desde la raíz, con Node compatible y PostgreSQL 17 disponible:

```powershell
npm run test:printing:agent
npm run test:backend:postgres
node scripts/run-e2e.mjs e2e/restaurant-production-audit.spec.ts e2e/minimarket.spec.ts
```

El ejecutor E2E compila ambos servicios y usa una copia local de la base. En esta ejecución se quitó `E2E_DATABASE_URL` del entorno del proceso para asegurar esa copia. PostgreSQL usa un clúster temporal independiente y se apaga al terminar.

## Evidencia y límites

Los registros de esta ejecución se guardan en `output/printerless-validation/`. La primera ejecución detectó una selección de impresora anterior a la inicialización de la estación. La prueba ahora espera esa inicialización y comprueba la selección; se conserva el registro y la traza del fallo inicial.

El registro final es `e2e-verified.log`; el inicial es `e2e.log`. Durante navegación persiste el mensaje de Next.js `The destination stream closed early`, observado en validaciones anteriores; no hizo fallar los escenarios finales y no se corrigió en este trabajo.

La imagen `receipt-preview.png` muestra el formato de impresión de la prueba de simulación. Los comandos ESC/POS recibidos se verifican como bytes; quedan pendientes papel, corte real, codificación y compatibilidad con cada modelo de impresora. La emisión fiscal con una cuenta real sigue siendo una validación aparte. No se desplegó ni se migró la base de trabajo.
