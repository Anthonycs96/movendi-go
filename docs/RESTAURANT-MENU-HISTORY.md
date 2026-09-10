# Historial de carta

En **Carta > Historial de carta** se consultan las importaciones PDF aplicadas y las altas/ediciones manuales de productos realizadas desde esta versión. Cada operación conserva el usuario, la sede, la fecha y una copia de los campos del producto antes y después. La lista tiene filtros por origen y páginas de 20 registros; las comparaciones se muestran al abrir cada registro.

## Permisos

- `restaurant:menu-history:read`: consultar el historial y descargar los originales de su empresa y sede. Para abrir Carta también se necesita acceso al módulo y `restaurant:menu:read`.
- `restaurant:menu-history:revert`: autorizar reversiones. Además requiere lectura del historial y `restaurant:menu:write`.
- Los administradores con `*` tienen acceso. Los roles personalizados reciben estos permisos explícitamente desde Configuración > Roles.

El backend valida estos permisos en cada solicitud, incluidas las descargas. Conocer el identificador de una importación o revisión no concede acceso a otra sede o empresa.

## Revertir

Abrir el detalle, seleccionar **Revertir este cambio**, indicar un motivo y confirmar. Los campos modificados se restauran; los productos creados se desactivan, manteniendo sus referencias en ventas, pedidos y recetas. Las categorías creadas durante una importación se conservan.

La operación verifica la versión y los datos actuales de cada producto. Si alguno fue editado después, falta una referencia necesaria o el nombre anterior entra en conflicto, rechaza el lote completo. No sobrescribe una edición posterior. Una reversión repetida responde sin aplicarla de nuevo y genera un único registro de auditoría. La reversión queda registrada con su autor y motivo; no se elimina el historial ni se ofrece una reversión automática de la propia reversión.

## PDF original

El navegador conserva el original antes de confirmar la importación. Lo transfiere en partes de hasta 4 MB al almacenamiento privado configurado mediante `OBJECT_STORAGE_PROVIDER` (S3/GCS en producción; local para desarrollo). El servidor verifica el SHA-256 del archivo y la cantidad de páginas; el límite sigue siendo 50 MB y 50 páginas. La carga puede continuar al volver a seleccionar el mismo archivo. Una importación nueva no puede aplicarse sin haber conservado y verificado su original.

Las descargas también se realizan por partes autenticadas y verifican la integridad antes de ofrecer el PDF completo. No se publican enlaces permanentes ni se incluye el archivo en las respuestas de historial. Los objetos no tienen vencimiento automático: su almacenamiento crece con las importaciones. Los respaldos de base de datos deben acompañarse de protección/respaldos del bucket, porque la base conserva referencias, no los bytes del PDF. El original se descarga como archivo; esta función no constituye un antivirus.

## Registros anteriores

Los eventos antiguos de importación o edición siguen visibles, identificados como registros sin comparación completa. No se inventan valores anteriores ni archivos ausentes y no se permite revertirlos. Los borradores pendientes siguen en **Importar carta PDF**, separados de las operaciones aplicadas.

El historial cubre los campos editables de productos y los cambios aplicados por importación. No versiona la configuración de promociones, las recetas, las categorías como entidades independientes ni los cambios de infraestructura. La lectura real con IA sigue requiriendo configurar `MISTRAL_API_KEY`; las pruebas locales no consumen Mistral.

## Validación de esta entrega

- 8 escenarios de navegador/API específicos: comparación manual, reversión concurrente e idempotente, PDF por partes, integridad, reversión de importaciones, conflicto sin cambios parciales, controles de permisos/sede, paginación, descarga y carga desde el frontend.
- 10 escenarios de regresión del restaurante y 58 pruebas unitarias aprobadas.
- Compilaciones de producción de frontend y backend, TypeScript y ESLint aprobados.
- Migraciones SQLite y PostgreSQL desde bases vacías: sin diferencias con sus esquemas.
- Vista móvil de 390 px revisada; evidencia en `outputs/menu-history/mobile.png` (fuera de Git).
- Respaldo previo de producción verificado en `backups/postgresql/pre-menu-history-20260910.dump`; copia SQLite previa a la migración en `backups/sqlite` (fuera de Git).

Las pruebas de archivos usaron almacenamiento local aislado; la configuración publicada dispone de S3. No se consumió Mistral ni se comprobó todavía la precisión de extracción del PDF real.
