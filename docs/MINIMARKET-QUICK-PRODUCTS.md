# Registro rápido de productos

En **Catálogo → Nuevo producto**, basta con escribir **Nombre** y **Precio de venta**. El registro se realiza en una pantalla, sin pasos intermedios.

- **Sin SKU:** el servidor asigna un código interno al guardar. Los reintentos de una misma operación conservan el producto y su código; no crean otro.
- **Sin código de barras:** puede dejarse vacío. El producto se encuentra por nombre en el catálogo y en el punto de venta. El SKU interno no sustituye al código de barras del envase.
- **Con código de barras:** se puede escribir o leer con la cámara antes de guardar.
- **Guardar y crear otro:** confirma el producto y prepara el formulario siguiente. Conserva categoría y unidad; limpia nombre, precio, SKU propio y código de barras. Reinicia los ajustes particulares de presentación, stock mínimo y lotes para evitar copiarlos por accidente.
- **Más detalles:** permite elegir o crear categoría, indicar un SKU propio, cambiar unidad, presentación, factor, venta fraccionada, stock mínimo, control de vencimientos y clasificación tributaria. Al elegir kilogramos o litros se prepara una presentación de esa unidad con venta fraccionada.

Los valores iniciales son categoría **General**, unidad **Unidad**, factor **1**, sin control de lotes y clasificación tributaria pendiente. El producto se crea con **stock cero**; las existencias se registran desde **Compras**.

## Compatibilidad

El SKU propio se conserva y sigue sujeto a unicidad por negocio y sucursal. La importación por Excel/CSV mantiene su SKU obligatorio, ya que lo utiliza para agrupar presentaciones. Este cambio no modifica productos existentes ni requiere una migración de base de datos.
