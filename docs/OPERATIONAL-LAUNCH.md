# Puesta en marcha: integraciones, piloto, soporte y recuperación

## Pantallas

- **Panel de control → Configuración → Integraciones, copias y soporte → Revisar servicios**: el Super Admin configura Mistral; Super Admin y Support revisan copias e incidencias. Una empresa no puede acceder a las claves globales.
- **Restaurante → Configuración → Piloto y soporte**: responsables con permisos de configuración preparan el plan, registran evidencias y atienden incidencias. La consulta requiere `restaurant:configuration:read`; las modificaciones, `restaurant:configuration:write` y suscripción habilitada.
- El aislamiento por empresa y sede se aplica en el servidor. Soporte global puede atender incidencias de todas las empresas. Los cambios quedan auditados; una versión obsoleta de una incidencia se rechaza.

## Mistral

1. El titular crea su cuenta en Mistral Studio y una clave API. El consumo corresponde a esa cuenta.
2. El Super Admin ingresa la clave en el panel. El servidor comprueba autenticación con `GET https://api.mistral.ai/v1/models` antes de guardarla cifrada con AES-256-GCM. Una clave rechazada conserva la anterior. `INTEGRATION_ENCRYPTION_KEY` debe existir y conservarse para recuperar credenciales.
3. Importar una página real desde **Carta → Importar PDF**, revisar nombres/categorías/precios, archivar el original y confirmar los cambios. Revisar el historial. Autenticarse con la API no demuestra calidad de OCR ni acredita el piloto.
4. Registrar fecha, archivo, filas comprobadas y resultado en la prueba Mistral del piloto. Las pruebas unitarias usan respuestas simuladas y no generan consumo real.

## NubeFact y la impresora

- Ingresar las credenciales de **pruebas BETA** en la configuración SUNAT existente. Comprobar conexión, boleta, factura, consulta y nota de crédito. Registrar identificadores y respuestas; nunca tokens. No usar emisión de producción como prueba.
- Configurar una térmica compatible con el agente local/ESC-POS existente. Confirmar modelo, conexión y destino; probar texto, tildes, notas, papel, corte, desconexión y reintento. Revisar que el reintento no duplique el documento.
- Una impresora de inyección Epson L3250 no debe recibir comandos ESC/POS. Una prueba simulada o trabajo encolado no demuestra salida física.

### Sin impresora: guardar la comanda en PDF

Crear/seleccionar una impresora de conexión **Navegador**. En **Cocina → Estación de impresión**, activar **Modo simulación**, abrir una comanda con **Imprimir ahora** y elegir **Ver formato / guardar PDF**. En el diálogo del navegador seleccionar **Guardar como PDF**. Después, **Cerrar prueba** conserva la comanda pendiente; no confirma salida física. La vista de impresión oculta el resto de la aplicación para evitar páginas vacías de navegación.

El ensayo automatizado `e2e/restaurant-print-pdf.spec.ts` usa datos aislados, comprueba la apertura del diálogo, genera una comanda con el motor PDF de Chromium y verifica que la cola no se consuma. Este PDF de comanda no es una boleta/factura electrónica de NubeFact.

## Piloto y soporte

Registrar responsable, participantes/roles, dispositivos/red, canal y horario de soporte acordados y escalamiento. Ejecutar las pruebas mostradas: lectura Mistral, carta, permisos, salón, llevar, delivery, pagos, puntos, devolución/caja, reconexión, hora punta, impresión, facturación y capacitación.

Cada resultado exige evidencia y confirmación explícita del responsable. Hora punta requiere cantidad de operaciones y p95 medido. El cierre exige todas las pruebas aprobadas, ninguna incidencia crítica abierta y una copia restaurada de las últimas 36 horas. El registro representa la declaración auditada del responsable, no una certificación automática del hardware o del proveedor.

Las incidencias tienen prioridad, estado, responsable asignado y respuesta/solución. Para cerrarlas se requiere una solución. La bandeja no envía mensajes externos ni constituye por sí sola un servicio humano 24/7: se debe asignar a alguien para revisarla y acordar los canales urgentes.

## Copias externas

Workflow: `.github/workflows/external-backup.yml`. Programado a las **08:00 UTC / 03:00 Lima**, con ejecución manual disponible. GitHub puede retrasar el cron; el panel advierte si no hay copia reciente verificada. Configurar las notificaciones de fallos de Actions para quien opere el servicio.

- Bucket privado separado de los archivos operativos: `movendi-external-backups` en Railway. Protege frente a pérdida de la base/bucket de archivos; comparte proveedor y cuenta, por lo que no sustituye una copia en una segunda cuenta/proveedor para desastres de toda la cuenta.
- Copia PostgreSQL, manifiesto/checksum, archivos bajo `tenants/` y la clave de cifrado de integraciones dentro del respaldo cifrado. Ningún secreto se imprime.
- Cada objeto se cifra con AES-256-GCM y un IV aleatorio, se descarga y se verifica. Cada ejecución de Actions restaura la base en PostgreSQL 17 efímero y comprueba que todos los archivos activos referenciados están en la copia con el checksum esperado.
- El marcador `complete.json` se escribe solo después de las comprobaciones. El reporte al backend usa `BACKUP_REPORT_TOKEN`. Se conserva el detalle de ejecuciones en `ExternalBackupRun`.
- Retención 30 días, conservando al menos las últimas 7 copias completas. Las copias vencidas solo se eliminan después de una copia nueva comprobada.

Secrets del environment `production` de GitHub: `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` (32 bytes en base64), `BACKUP_APP_INTEGRATION_KEY`, `BACKUP_REPORT_TOKEN`, `BACKUP_S3_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` y `ARCHIVE_S3_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`. El servidor necesita el mismo `BACKUP_REPORT_TOKEN`. Si se rotan credenciales o cambia el servidor/base, actualizar estos secrets; una clave de cifrado nueva no abre las copias anteriores.

En este equipo se conserva un sobre de recuperación **cifrado con Windows DPAPI**, fuera de Git, en `backups/recovery-keys/external-backup.dpapi`. Solo la cuenta Windows que lo creó puede abrirlo. Exportar el contenido a un gestor de secretos seguro antes de perder ese perfil/equipo; GitHub no permite volver a leer el valor de sus secrets.

## Recuperación

1. Preparar un directorio nuevo y PostgreSQL vacío. No apuntar a la base operativa.
2. Cargar en el entorno las credenciales `BACKUP_S3_*` y `BACKUP_ENCRYPTION_KEY` de la copia. Establecer `BACKUP_RESTORE_PREFIX` con el prefijo completo mostrado por la ejecución, `BACKUP_RESTORE_DIR` con el directorio nuevo y opcionalmente `RESTORE_DATABASE_URL` con la base vacía. Usar PostgreSQL 17 compatible mediante `PG_BIN_DIR`.
3. Ejecutar `node scripts/external-backup.mjs restore`. Descarga, descifra, verifica los archivos y, si se proporcionó la URL, restaura en una transacción. Se niega a reemplazar una base con objetos existentes.
4. `manifest.json` relaciona los archivos locales `objects/<hash>` con su `sourceKey` original. Reponerlos en un bucket privado de recuperación usando esas claves, verificar checksums y actualizar la referencia de bucket en `StoredObject` si cambió. `integration-key.json` contiene la clave de integraciones que debe cargar el backend restaurado: tratar el directorio recuperado como secreto.
5. Probar inicio de sesión, carta/historial y descarga de originales, ventas y configuración en el entorno aislado. Cambiar conexiones operativas solo tras validar la recuperación y definir el punto de corte para no perder operaciones posteriores.

La copia diaria ofrece un punto de recuperación de aproximadamente 24 horas si las ejecuciones terminan; el tiempo real depende de la última copia exitosa. La restauración técnica diaria no reemplaza un ensayo periódico de operación con la aplicación y su equipo.
