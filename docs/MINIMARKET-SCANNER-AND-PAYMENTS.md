# Celular como escáner, cajas y QR de cobro

## Operación diaria

1. Cada cajero entra con su propio usuario y abre un turno en **Caja**, con un nombre diferente para cada caja física: Caja 1, Caja 2, etc. No hay un límite de cuatro cajas en este flujo.
2. En **Punto de venta**, verifica el nombre de la caja, el cajero y la hora de apertura. Pulsa **Vincular celular**.
3. Abre con el celular el QR o el enlace mostrado en la PC. El QR de vinculación dura cinco minutos y admite un solo celular. La pantalla del celular muestra negocio, sucursal, caja y cajero.
4. Activa la cámara del celular o ingresa un código. Espera la confirmación de que el producto llegó a la PC. La cámara necesita HTTPS y permiso del navegador; ambos equipos necesitan conexión a la aplicación.
5. Revisa cantidades y cobra en la PC. Mientras está abierta la ventana de cobro, el escáner queda en pausa.
6. Al terminar, cierra el turno. Se invalida el vínculo y el siguiente turno requiere una nueva vinculación.

### Vista del escáner

El visor tiene guía de encuadre, estado de lectura, pausa, selector de cámara, linterna cuando el equipo la admite y opciones de sonido y vibración. Estos avisos ocurren después de confirmar la lectura. Mantener un código frente a la cámara no lo agrega de nuevo: hay que retirarlo antes de repetirlo. El ingreso manual permite escribir el código de barras del producto.

En el celular se mantienen visibles negocio, sucursal, caja y cajero. El pie muestra cantidad y total del carrito enviado por esa PC, actualizado aproximadamente cada dos segundos. El importe aparece como estimado mientras se verifican precios y promociones. Al cobrar se refleja el nuevo carrito vacío; si falta la comunicación con la PC se oculta el importe en lugar de mantener un total desactualizado. El celular sigue dedicado a escanear; el cobro se realiza desde la PC.

El resumen viaja por el vínculo autenticado de la caja y se guarda junto a la identidad de la venta. Solo sirve para mostrar información: precios, existencias y cobros siguen siendo validados por el servidor al registrar la venta. No se transfieren carritos entre cajas.

## Separación entre cajas

- Los carritos se guardan por negocio, sucursal, usuario y turno. Cambiar de turno no traslada el carrito al otro turno.
- Cada conexión pertenece a una sola PC y un solo turno; sus secretos se guardan como hashes en el servidor. El celular puede enviar lecturas, consultar su resultado y ver el resumen de la venta de su caja.
- Los eventos incluyen la identidad de la venta. Una lectura pendiente de otra venta se rechaza, salvo que el cursor persistido de la PC confirme que ya fue agregada. Los reintentos conservan la misma identidad y no vuelven a agregarla.
- Una segunda PC no toma un vínculo existente automáticamente. El cajero autorizado puede desconectarlo expresamente para crear otro.
- Cambiar de sucursal, revocar la sesión o cerrar la caja impide seguir enviando lecturas. Si la PC deja de responder, el celular muestra pausa o falta de conexión. No se confirma una lectura sin respuesta de la PC.
- **Caja → Turnos abiertos** muestra las cajas disponibles, sus cajeros, hora de apertura y conexión del celular. Un administrador supervisa todas las cajas de la sucursal; un cajero ve su propio turno.
- Las ventas y los tickets muestran caja, cajero, medio de pago y referencia. El sistema mantiene la validación transaccional de caja abierta, permisos, existencias e idempotencia al cobrar.

## Yape, Plin y otros QR

En **Configuración → QR para recibir pagos**, un administrador puede subir, reemplazar o retirar una imagen PNG, JPG o WebP de hasta 2 MB e indicar el titular. La imagen se valida, normaliza a PNG y guarda en la base de datos, separada por sucursal y método de pago. No depende del disco local del servidor.

Los medios disponibles son Yape, Plin, transferencia y otro QR. El medio también debe estar habilitado en la configuración del negocio. Todas las cajas de la misma sucursal pueden mostrar ese QR, pero el cobro se registra en el turno que realizó la venta.

Al seleccionar el medio de pago se muestra el QR, titular e importe. En un pago dividido, se muestra el importe correspondiente a cada parte. El cajero verifica el abono en su cuenta y marca **Confirmé en mi cuenta que recibí el pago digital**. Puede guardar el número de operación como referencia.

**Una imagen QR no confirma el pago automáticamente.** No se ha integrado una pasarela ni una consulta bancaria. El botón registra un pago confirmado manualmente por el cajero.

Yape, Plin, tarjeta y transferencias no incrementan el efectivo esperado del cajón. El panel de caja muestra por separado los cobros originales por método; esa sección indica expresamente que los importes son anteriores a devoluciones. El arqueo conserva sus ingresos, retiros y devoluciones de efectivo.

## Datos y despliegue

Aplicar la migración `20260920150000_retail_scanner_qr` correspondiente a SQLite o PostgreSQL antes de ejecutar esta versión. Agrega conexiones, lecturas y QR; no elimina productos ni ventas. Los vínculos y lecturas se eliminan al cerrar el turno o desconectar el escáner.

La mejora visual y el resumen compartido requieren también `20260920180000_scanner_cart_summary`, disponible para ambos motores; agrega una columna opcional a la conexión del escáner.

Las pruebas cubren cinco cajas con cajeros distintos, permisos y sucursales, reintentos, pausa, cambio de venta, cierre de turno, revocación de sesión, imágenes inválidas y cobros digitales sin modificar el efectivo. Las pruebas en navegador incluyen dos PC con dos celulares, pérdida de respuesta, recuperación del carrito y carga de QR.

Verificación del 20 de septiembre de 2026: 48 pruebas aprobadas en PostgreSQL; 38 aprobadas en SQLite (10 casos exclusivos de PostgreSQL omitidos); 14 pruebas de navegador aprobadas, incluidos controles de cámara, totales entre celulares, recuperación de lecturas rechazadas, Yape y pago dividido con efectivo; dos pruebas de prevención de lecturas repetidas aprobadas. Compilación de producción, TypeScript, ESLint y correspondencia de migraciones con el esquema aprobados. Migración aplicada a la base local de desarrollo.
