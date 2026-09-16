# Minimarket: operación móvil y ampliaciones

Solicitud: prompt maestro de 32 apartados, 16 fases, confirmado el 15/09/2026. Reutilizar todo lo existente; no reconstruir módulos. Este documento distingue implementación y evidencia, sin declarar pruebas físicas realizadas.

## Auditoría inicial (antes de cambios)

- ✅ Catálogo/presentaciones: `RetailProduct`, `RetailPresentation`, barcode único por empresa/sucursal, factores y precios; SKU actualmente pertenece al artículo.
- ✅ Stock/lotes: `InventoryItem`, `InventoryMovement`, `RetailLot`; FEFO, rechazo de vencidos, seis decimales y prohibición de stock negativo.
- ✅ Venta: `checkoutRetail` → `CheckoutPort` → Inventario/Ventas/Caja, una transacción serializable con reintentos y recibo idempotente `RetailOperation`. Costos ocultos al cajero.
- ✅ Compras/devoluciones: servicios existentes atómicos, costo promedio, lotes y devolución proporcional.
- ✅ Fiscal: outbox, estados, reintentos y trabajador existentes; pendiente aceptación externa/equipos reales.
- ✅ Seguridad: sesión y sucursal desde servidor, `minimarketPermission`, módulos habilitados, `scoped`, cuotas y permisos. Ruta `/api/operations/[...segments]`; datos `/api/data/tenant`; sin Server Actions propias de Minimarket.
- 🟡 Conteo: por artículo/lote con stock esperado y confirmación; faltan borrador de varias líneas y revisión de diferencias.
- 🟡 Compras: API recibe hasta 100 productos, formulario solo uno; proveedor como texto.
- 🟡 Móvil: rejilla responsive, formularios largos y tablas; sin cámara. ZXing ya está instalado y usado para QR en Restaurante.
- 🟡 PWA: manifest e iconos existentes; falta estrategia de actualización/conectividad.
- ❌ Multicaja, transferencias, maestro de proveedores/cuentas por pagar, importación y promociones minoristas.
- ⚠️ `MinimarketWorkspace.tsx` concentra vistas; extraer capacidades reutilizables al ampliar.
- 🔴 Carrito y clave de reintento solo en memoria: recarga después de respuesta perdida puede causar una nueva intención de cobro. Resolver con persistencia contextual y recuperación explícita.
- 🔴 Búsqueda paginada de 30 productos: el escáner debe resolver exactamente la presentación en servidor, no buscar únicamente en la página visible.

## Implementación por fases

| Fase | Resultado actual | Verificación |
|---|---|---|
| 1 | Auditoría previa, conservada arriba | Arquitectura, permisos, modelos y transacciones inspeccionados |
| 2 | Un BarcodeScanner para todos los flujos; BarcodeDetector y ZXing ya instalado | Cooldown, código continuo, salida/reentrada y EAN real generado para fallback |
| 3 | Escaneo de presentación exacta, carrito, cobro móvil y acceso al comprobante | Viewport 390 px; flujos automatizados de venta y recuperación |
| 4 | Captura de barcode, SKU por presentación y consulta exacta fuera de la página de catálogo | Aislamiento y costos ocultos al cajero |
| 5 | Conteo múltiple con revisión y finalización; varios lotes del mismo artículo | Una transacción, diferencia, autor, fecha, movimiento y resumen compartido |
| 6 | Recepción con múltiples líneas escaneadas y factores a unidades base | Compra y Kardex atómicos; vencimiento/lote cuando corresponde |
| 7 | Se mantienen FEFO y transacciones serializables | Regresión sobre stock, caja, ventas, fiscal, último producto y reintentos |
| 8 | Cajas nombradas independientes por sucursal; turno por cajero | Aperturas simultáneas, caja ajena y saldos independientes |
| 9 | Borrador → despacho/en tránsito → recepción; cancelación de borrador | Stock destino solo al recibir; recepción concurrente e incompatibilidades |
| 10 | Proveedores compartidos con compras y cuentas por pagar parciales | Aislamiento, sobrepago, retiro de efectivo y concurrencia |
| 11 | Plantilla XLSX/CSV, preview, errores por fila, confirmación completa | ExcelJS/controles ZIP existentes; códigos de texto, fórmulas y rollback |
| 12 | Promociones reutilizando Promotion; precio especial, %, fijo, 2×1, 3×2 | Prioridad, cantidad, presentación, fechas, precio servidor y devolución/fiscal históricos |
| 13 | Manifest/iconos existentes + service worker, página offline y actualización explícita | Construcción de producción; recursos públicos exclusivamente en caché |
| 14 | IndexedDB por empresa/sucursal/actor; carrito e intención de cobro; recuperación explícita | Respuesta perdida, recarga, dos pestañas, misma clave y siguiente venta |
| 15 | Se reutilizan outbox, adaptador fiscal y runner; contratos para pagos e impresión futuros | Pruebas locales de estados/reintentos/runner; aceptación externa pendiente |
| 16 | Reportes ampliados, permisos específicos, Kardex completo y revisión responsive | Tipos, lint, SQLite, PostgreSQL, builds y E2E; aceptación física pendiente |

## Reutilización y decisiones

- No se duplicó Inventario, Ventas, Caja ni Facturación. Las escrituras usan los mismos servicios y la misma transacción. El catálogo individual y el importador comparten un único creador de productos.
- El número equivalente y la unidad base UND/KG/L siguen definiendo cantidades; SKU/barcode pueden distinguir presentaciones. No se integró hardware de balanza.
- CashSession mantiene apertura, saldo, movimientos y cierre. activeSlot identifica la caja nombrada normalizada. La excepción multicaja aplica a los turnos de Minimarket; conserva la restricción anterior de los otros rubros. No existe un maestro separado de terminales físicos.
- Los conteos se revisan en pantalla y solo se escriben al finalizar. El resumen compartido es por artículo; la operación/auditoría guarda cada lote y su diferencia. Los borradores de conteos/recepciones no se sincronizan como movimientos.
- El destino de una transferencia debe tener preparado el mismo SKU con unidad y control de lotes compatibles. Se recibe completa, con revisión de cantidades/lotes; no hay recepción parcial ni cancelación de un despacho en tránsito. Una devolución se organiza como nueva transferencia.
- Una recepción acepta hasta 100 productos; lotes distintos del mismo producto se reciben por separado. El maestro admite 200 proveedores visibles y la pantalla muestra las últimas 100 deudas y 50 transferencias.
- La importación crea productos nuevos: hasta 200 filas/2 MB y 20 presentaciones por producto. Repite SKU para agrupar; el stock inicial se informa una vez en unidades base. Con errores no se confirma ninguna fila. No actualiza masivamente productos existentes.
- Las promociones no se acumulan. Mayor prioridad; empate por mayor descuento; desempate estable. El descuento fijo es por línea y el porcentaje es entero. 2×1/3×2 se aplican a presentaciones indivisibles. El precio del cliente nunca es autoridad.
- Sale conserva subtotal, descuento y snapshot; RetailSaleLine guarda el importe neto pagado y el descuento. El emisor fiscal recibe pesos netos por línea; una devolución usa el importe histórico proporcional.
- Los permisos anteriores siguen funcionando por implicaciones explícitas. Se pueden separar abrir/cerrar/mover caja, recibir compras, contar, modificar precios, promociones, proveedores, deudas y transferencias. El backend valida cada operación; cambiar disponibilidad requiere administrar catálogo.

## Conectividad y PWA

No se permiten nuevas escrituras estando offline. Se conserva el carrito y se bloquea el cobro hasta verificar stock, caja y precios con servidor. Cada envío durable guarda su cuerpo e identificador antes de enviarse; una respuesta desconocida mantiene la intención y bloquea su reemplazo. Recuperar vuelve a enviar exactamente la misma solicitud idempotente. Un rechazo confirmado permite corregir datos.

El carrito tiene identidad propia; dos pestañas no generan un nuevo cobro de la misma intención. Al confirmar una venta se elimina el carrito persistido y se notifica a las otras pestañas. Las solicitudes incluyen el contexto esperado; si otra pestaña cambia de sucursal/usuario, el servidor exige volver al contexto original. No se descarta una operación incierta automáticamente.

IndexedDB debe estar disponible y no debe borrarse mientras exista un envío pendiente. Si se revocaron permisos o cerró la sesión, es necesario volver con el usuario/sucursal originales para recuperar. El dispositivo guarda localmente el mínimo carrito y el cuerpo de una operación pendiente; las credenciales fiscales nunca se persisten ahí. El service worker no guarda páginas autenticadas ni respuestas API: solo iconos y la página pública de desconexión. Abrir sesión o volver a abrir el POS desde cero requiere conexión.

La actualización es explícita y se bloquea mientras hay un envío pendiente. La instalación usa el manifest y los iconos existentes. Android/iPhone físicos, enfoque, linterna, permisos y calidad óptica no se consideran probados por una cámara simulada.

## Reportes

- Ventas, devoluciones, neto, cajero, caja/turno, medios de pago y sucursal actual. Para otra sede se usa el selector de sucursal autorizado; no se amplía el ámbito de consultas.
- Hasta 10 000 ventas en desgloses, con aviso si se supera; totales principales sobre todo el filtro. Top 20 presentaciones por importe neto. Alertas visibles hasta 100, con conteo total.
- Margen comercial estimado con costos históricos y devoluciones realmente repuestas. No se calcula cuando hay costos cero sin confirmar o desglose truncado. No equivale a utilidad contable ni descuenta gastos/impuestos pendientes.
- Moneda de ventas desde snapshot; deudas separadas por moneda. Compras históricas sin moneda: suma nominal expresamente identificada, no total comparable. Vencimientos configurables por producto.

## Validaciones y límites de aceptación

Resultados automatizados finales: frontend 25 aprobadas; backend 169 aprobadas y 26 reservadas para PostgreSQL. Regresión PostgreSQL compartida de 126 pruebas aprobadas sin omisiones; ejecución final de Minimarket, 38 aprobadas incluyendo varios lotes y concurrencia. Nueve E2E aprobados, incluyendo cobro Yape desde viewport móvil con escaneo, conteo posterior, fallback, recuperación entre pestañas y nueva venta. TypeScript, lint global y builds de ambos servicios aprobados. Migraciones SQLite verificadas contra base vacía; PostgreSQL compara esquema y migraciones en servidor local descartable. El runner fiscal y agente de impresión existentes tienen tres pruebas adicionales aprobadas.

El criterio físico del prompt continúa pendiente: operar con códigos reales desde Android/iPhone en HTTPS, comprobar enfoque/permisos/linterna y realizar la jornada supervisada. La aceptación fiscal requiere una cuenta BETA y respuestas reales del proveedor. El proceso fiscal supervisado existente debe configurarse en el entorno donde se opere; no se instaló ni desplegó un servicio externo desde esta tarea.

Se conserva Ver / imprimir comprobante. Los contratos PaymentConfirmationPort y ReceiptPrintPort preparan futuras integraciones; no representan confirmación automática de Yape/Plin/tarjetas ni una impresora térmica/Bluetooth/red conectada. Consultar también MINIMARKET-FISCAL-OPERATIONS.md, FISCAL-RUNNER-OPERATIONS.md y PRINTING-HEXAGONAL-PHASE-1.md.

## Migraciones

Cuatro migraciones equivalentes SQLite/PostgreSQL: multicaja, transferencias, proveedores/deudas y promociones/presentaciones/alertas. Columnas nuevas con valor por defecto o nullable; no se eliminan registros históricos. La migración multicaja sustituye un índice restrictivo por su equivalente para los rubros anteriores y agrega protección por cajero. El seed se adaptó al orden de dependencias nuevo, exclusivamente para bases de desarrollo/pruebas.

Antes de aplicar a una base operativa: respaldo verificable y migraciones del proveedor correcto. Las verificaciones automatizadas no autorizan por sí mismas una publicación a producción.

Aplicación local realizada: cuatro migraciones sobre apps/backend/prisma/dev.db, después de respaldo SQLite consistente movendi-go-2026-09-16T02-39-55-651Z.db en backups/sqlite. Integridad, referencias y conteos de las 118 tablas previas se conservaron; migrate diff no encontró diferencias. No se modificó una base PostgreSQL externa ni se publicó a producción.
