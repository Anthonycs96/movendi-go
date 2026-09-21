# Reventa, compras y carta — 21 de septiembre de 2026

## Auditoría y decisión de modelo

El restaurante ya tenía `InventoryItem`, proveedores, compras, movimientos, conteos, recetas, reservas transaccionales y costo promedio ponderado. Sin embargo, `Product` representaba la carta y solo descontaba inventario mediante una receta. Comprar una gaseosa no la vinculaba a su venta; por eso tampoco aparecía en el selector de movimientos si solo existía en Carta.

Se conserva `InventoryItem` como única fuente de cantidades, SKU, código de barras, unidad y costo de compra. `Product.inventoryItemId` es un vínculo uno a uno a ese artículo, limitado a la misma empresa y sucursal. `Product` conserva la presentación comercial, precio y ruta de despacho. No se crean catálogos separados para Compras y Kardex ni una receta ficticia para gaseosas.

`stockMode` distingue:

- `RECIPE`: preparado; consume los ingredientes de su receta según la configuración existente.
- `RESALE`: terminado para reventa; reserva directamente unidades del artículo vinculado, sin buscar receta. Si el artículo no controla existencias, no se descuenta.
- `NONE`: venta sin consumo de inventario.

Los productos anteriores mantienen su comportamiento con `RECIPE`: si no tenían receta, no se inventa consumo ni stock. La clasificación nueva es explícita, nunca inferida del nombre o de la categoría.

## Cómo lo opera el usuario

**Producto nuevo desde Carta:** Nuevo producto → Control de inventario → Producto de reventa. Selecciona un artículo de Inventario o deja «Crear artículo vinculado». Completa nombre, categoría de carta, precio y área. Al guardar se crea un único vínculo; el artículo queda disponible en Compras. Puede indicar SKU, código de barras, categoría administrativa y unidad base. El stock se ingresa mediante compra o movimiento, no mediante el estado de Cocina.

**Producto que ya existe en Inventario:** usa «Publicar en carta» en la fila del artículo. Indica nombre comercial, categoría, precio y área de despacho. Se reutiliza su identidad de inventario. Los productos vinculados muestran su estado de publicación y se administran en Carta.

**Compra:** Inventario → Registrar compra → Proveedor → Artículo → Presentación → Cantidad → Costo por presentación. La pantalla muestra cuántas unidades base entrarán antes de confirmar. Si falta el artículo, «Nuevo artículo» permite crearlo manteniendo el documento y las líneas de la compra abiertos.

**Presentaciones:** en la fila del artículo, «Presentaciones» permite registrar Unidad/Pack/Caja y su factor. La unidad base está siempre disponible. Se agrega `InventoryPresentation` porque las presentaciones existentes de Minimarket pertenecen a `RetailProduct` y a sus lotes/precios; reutilizarlas directamente obligaría a crear un segundo producto de otra industria. Las compras de restaurante conservan el nombre, factor, cantidad comprada y costo por presentación como snapshot. Una presentación ajena a la empresa/sucursal/artículo es rechazada.

Ejemplo: 2 packs × 12, a S/ 26.40 por pack → entrada de 24 UND, total S/ 52.80 y costo unitario S/ 2.20. Tres cajas × 24 → 72 UND. Se conserva la valoración existente en céntimos; el costo unitario convertido se redondea a céntimos y el total del documento mantiene el importe de las presentaciones.

**Categorías:** `InventoryItem.inventoryCategory` es una clasificación administrativa opcional (por ejemplo, «Bebidas / Gaseosas»). `Product.categoryId` sigue siendo la categoría comercial («Bebidas»). No se duplica el producto ni se añade una jerarquía de categorías innecesaria.

**Publicación:** comprar no publica. `active` controla la disponibilidad para venta; `showInMenu` controla la aparición en la carta operativa y pública. La edición permite descripción, imagen HTTPS opcional y orden de visualización. La categoría y el área siguen utilizando las rutas existentes; la gaseosa se asigna a Bar y el pollo a Cocina.

## Stock, despacho y devoluciones

Al confirmar/agregar productos al pedido, se congela el modo de inventario, el costo y el consumo por línea; se reserva stock en la misma transacción que crea el pedido. El saldo almacenado es el **disponible**. Inventario muestra además las cantidades reservadas en pedidos. No se crea un segundo saldo físico editable que pueda desincronizarse.

Con 24 botellas y un pedido de 2, quedan 22 disponibles. Dos pedidos simultáneos por la última unidad no pueden confirmar ambos cuando está prohibido vender sin stock. En Carta se indica «Agotado» y se deshabilita agregar; el backend vuelve a validar aunque un dispositivo tenga datos anteriores. Se reutiliza la actualización periódica de las pantallas y su recarga después de operaciones; no se promete sincronización instantánea mediante un sistema nuevo.

Al cobrar, la reserva se vincula a la venta como `SALE_CONSUMPTION`, sin una segunda salida. Marcar Listo/Servido nunca toca el inventario. Bar puede pasar una línea de reventa de Pendiente directamente a Listo; el mozo la sirve con su permiso independiente. Cocina conserva el flujo de preparación por producto.

Cancelar un pedido pendiente libera la reserva mediante movimiento inverso. Si ya estaba preparado/listo/servido, la política conservadora existente lo registra como merma, evitando reponer automáticamente alimentos o bebidas ya entregados. Para unidades físicamente recuperadas se registra una devolución explícita o ajuste autorizado.

Inventario → Devolver venta permite recuperar todo el consumo pendiente o una cantidad de una línea. Valida el máximo restante y reintentos para impedir devoluciones duplicadas. **Esta acción repone mercadería; no devuelve dinero ni anula comprobantes.** La devolución monetaria total y la nota de crédito siguen en Caja. Si ya hubo una devolución física parcial, una devolución total posterior solo repone el saldo restante.

Cada movimiento mantiene empresa, sucursal, artículo, cantidad, saldo anterior/posterior, origen, pedido/venta/compra, usuario, costo y fecha. Los márgenes históricos utilizan el costo congelado al tomar el pedido; compras posteriores no lo reescriben. La unidad base no puede cambiar después de registrar movimientos y no se permite desactivar existencias con reservas abiertas.

## Permisos

Se añaden permisos para crear/editar artículos, registrar compras, modificar costos, ajustar/devolver inventario, crear/editar productos de carta, modificar precios y publicar. Se validan en backend y se ofrecen en la administración de roles. Los permisos amplios anteriores conservan sus capacidades por compatibilidad; para restringir un operador se deben retirar esos permisos amplios y asignar los específicos. Ninguna autorización depende de que el rol se llame Mozo, Cocina o Caja.

## Migración y validación

Migración SQLite/PostgreSQL: `20260921010000_restaurant_resale_inventory`. Añade el vínculo único y modo de stock de Product, publicación/imagen/orden, clasificación administrativa de InventoryItem, presentaciones de compra, snapshots de compra y modo congelado en OrderItem. No altera las cantidades ni crea existencias históricas. También se despliega `20260921000000_restaurant_item_service_cash_registers`, documentada por separado.

La migración se aplicó a la base local después de respaldo y se ensayó sobre una restauración local del respaldo de producción en el esquema `movendi_v2`. La comparación de 16 tablas conservó idénticos los datos históricos (excluyendo nuevas columnas y el identificador interno migrado de caja). Prisma confirmó que el esquema resultante coincide con las migraciones.

Pruebas: typecheck, lint, builds de producción, suite unitaria, integración PostgreSQL de inventario y concurrencia, y Playwright de reventa, operación completa desde frontend, auditoría de Restaurante y Cocina/Caja. Los escenarios cubren packs/cajas, receta más reventa, Kardex, devolución parcial/idempotente, stock agotado, publicación oculta, aislamiento, permisos y compra/alta desde móvil. Evidencias locales: `outputs/restaurant-resale/`.

## Archivos principales

- `apps/backend/prisma/schema.prisma`, `seed.ts` y ambas carpetas de migración.
- `apps/backend/src/modules/restaurant/server/product-stock.ts`, `preparation.ts`, `sale-inventory.ts`, `commands.ts`, `data.ts`, `inventory-commands.ts`, `inventory-data.ts`, `inventory-schemas.ts`, `menu-history.ts`.
- `apps/backend/src/modules/restaurant/domain/preparation-transition.ts` y `infrastructure/prisma/refund.ts`.
- `apps/backend/src/modules/inventory/application/{ports/inventory-purchase-repository.ts,use-cases/register-inventory-purchase.ts}` y `server/{commands,schemas,data,service.test}.ts`.
- `apps/backend/src/app/api/operations/[...segments]/route.ts`, `api/public/sites/[slug]/route.ts` y catálogos de permisos de backend/frontend.
- `apps/frontend/src/modules/inventory/{InventoryWorkspace,ResaleTools}.tsx`.
- `apps/frontend/src/modules/restaurant/components/{ProductEditor,FloorWorkspace,KitchenWorkspace,RestaurantDirectory}.tsx`, `RestaurantWorkspace.tsx` y `apps/frontend/src/app/globals.css`.
- DTO de restaurante en backend/frontend, `packages/contracts/src/index.ts`, `e2e/restaurant-resale.spec.ts` y actualización de la regresión de frontend.

Las pruebas usan bases aisladas: no se registraron compras, pedidos ni cobros ficticios en producción. La impresora física y proveedores externos continúan fuera de esta validación local.

## Resultado de ejecución

- Suite general: 26 pruebas frontend y 202 backend aprobadas; 31 pruebas específicas de otros entornos se omiten en la ejecución general.
- Integración PostgreSQL de inventario: 33 aprobadas, incluyendo concurrencia y reventa. Integración PostgreSQL de Caja: 13 aprobadas durante esta entrega.
- Playwright final: 50 aprobadas (reventa 5, recorrido frontend 6, auditoría de restaurante 35 y Cocina/servicio/Caja 4).
- Typecheck de contratos/backend/frontend, lint y builds de producción: aprobados.
- Migraciones locales aplicadas con respaldo; migraciones PostgreSQL ensayadas sobre copia de producción, esquema sin diferencias y datos históricos de 16 tablas conservados.
