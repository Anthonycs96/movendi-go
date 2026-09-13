# Operación y puesta en marcha de restaurante

## Importar una carta PDF

En Carta > Importar carta PDF, seleccionar el archivo, esperar la lectura por páginas y revisar cada producto junto al original. Nada se publica automáticamente. Marcar únicamente las filas correctas, decidir si actualizan un producto existente, asignar área e impuesto a los nuevos y confirmar. Los nuevos productos se proponen inactivos; los combos necesitan su composición manual. Los costes no se inventan.

El administrador de infraestructura configura `MISTRAL_API_KEY` únicamente en el backend. `MENU_IMPORT_MONTHLY_PAGES` limita las páginas reservadas por empresa y mes (50 por defecto). Máximo 50 páginas por archivo, 50 MB en el navegador y 8 MB por página enviada; hasta tres intentos por página. El original se conserva en almacenamiento privado antes de aplicar la importación, con carga por partes y verificación de integridad. Cada página de lectura se envía a Mistral. Consulta [Historial de carta](RESTAURANT-MENU-HISTORY.md) para permisos, descargas y reversiones. Evaluar las condiciones del proveedor antes de activar el servicio comercial.

La lectura requiere mantener la pestaña abierta. Pausar conserva las páginas terminadas. Para continuar, seleccionar el borrador y volver a adjuntar el mismo archivo. Una página problemática puede omitirse explícitamente y quedar registrada en auditoría. Guardar revisión conserva las correcciones antes de cerrar. No es un proceso autónomo en segundo plano ni una garantía de extracción perfecta.

## Impresión desde navegador

Crear una impresora de tipo Navegador en Configuración > Comandas e impresión. Asignar la principal o una ruta por área. En Cocina, seleccionar la estación y enviar una prueba. Tras cerrar el diálogo de impresión, indicar si salió correctamente o si se canceló/falló. La simulación no consume la cola real.

Si la reserva vence o se pierde la confirmación, la comanda aparece en **Enviadas o sin confirmar → Verificar papel**. No se imprime de nuevo automáticamente. Confirmar **Recibida en papel** o **No salió**; solo después de esta última opción se habilita **Reimprimir**.

## Agente local para térmica de red

Requiere Node 22.23.2 o posterior compatible, una térmica ESC/POS en red TCP y acceso a la aplicación. No incluye un controlador USB ni un instalador como servicio de Windows. Ejecutar una instancia por impresora. El equipo anfitrión debe permanecer encendido; configurar su inicio automático con el administrador del local.

1. Crear una impresora Agente local, activa y automática; asignarla a la ruta.
2. Generar el token en Configuración. Es secreto: conservarlo localmente y no enviarlo a soporte ni guardarlo en Git. Regenerarlo revoca el anterior.
3. Configurar en el entorno del proceso `PRINT_API_URL` (URL HTTPS de la aplicación), `PRINT_AGENT_TOKEN`, `PRINT_HOST` (IP de la térmica) y opcionalmente `PRINT_PORT` (9100 por defecto).
4. Ejecutar `node scripts/restaurant-print-agent.mjs` desde el repositorio. `PRINT_STATE_DIR` permite fijar la carpeta persistente del registro local.
5. Enviar una prueba desde Configuración y verificar físicamente la salida. Confirmarla en Cocina.

Desde la extracción del canal compartido, servidor y agente requieren el protocolo 2. Actualizar el script junto con el servidor y recargar las estaciones web; un agente anterior recibe HTTP 426 sin reservar trabajos. Conservar el diario local al actualizar. Detalle de estados, pruebas y reversión: [Impresión compartida](PRINTING-HEXAGONAL-PHASE-1.md).

Para una red doméstica controlada sin HTTPS, `PRINT_ALLOW_HTTP=true` permite HTTP; preferir que el agente acceda por localhost. El token no debe circular por redes compartidas sin cifrado.

El estado SENT significa envío TCP completado, no papel comprobado. El diario local evita reenviar automáticamente un trabajo cuyo envío ya terminó. Un envío incierto requiere verificar el papel antes de habilitar reimpresión desde la aplicación; esta crea un nuevo intento. No borrar el diario para resolver incidencias. El formato básico usa texto ASCII transliterado, notas y corte; verificar compatibilidad, ancho de papel y caracteres con el modelo real.

## Copias y recuperación

SQLite local: `npm run db:backup:local` utiliza la API de respaldo consistente, incluye datos del WAL y verifica integridad y claves foráneas. `node scripts/restore-sqlite.mjs ruta-respaldo ruta-destino` restaura únicamente a un archivo nuevo y exige el manifiesto SHA-256. No sustituir la base abierta de la aplicación.

PostgreSQL: instalar herramientas de la misma versión mayor del servidor (o pg_dump compatible). Configurar `DATABASE_URL` y ejecutar `node scripts/postgres-recovery.mjs backup backups/fecha.dump`. `PG_BIN_DIR` permite indicar el directorio de los ejecutables. Para restaurar, crear una base nueva vacía, configurar `RESTORE_DATABASE_URL` y ejecutar `node scripts/postgres-recovery.mjs restore backups/fecha.dump`. Se valida el checksum y la restauración se ejecuta en una transacción; el script rechaza destinos con tablas, vistas o secuencias.

Conservar el archivo y su manifiesto juntos, fuera de Git, con acceso restringido y una copia fuera del servidor. El script no configura por sí mismo horarios, retención, cifrado ni almacenamiento externo. Antes de cambiar la conexión operativa, comparar conteos, revisar ventas recientes y probar acceso, caja y pedidos sobre la restauración. Definir responsables y objetivos de pérdida máxima de datos y tiempo de recuperación según el contrato.

## Validación fiscal y primer turno

En Configuración seleccionar ambiente BETA y sus credenciales NubeFact. La prueba de conexión no acredita una emisión real. Validar boleta y factura, consulta de estado, respuesta incierta/reintento sin duplicados, XML/CDR y devolución/nota de crédito con el proveedor. Conservar evidencia y revisar con el responsable contable antes de configurar credenciales y series de producción. No reutilizar documentos de prueba como comprobantes reales.

Antes de abrir al público: carta y rutas, usuarios por rol, pedido salón/para llevar/delivery, notas a cocina, impresión, cobro simple/dividido, canje, devolución y cierre. Repetir con dos dispositivos y una interrupción de conexión. Registrar la capacitación y el primer turno acompañado en Configuración, indicando participantes, fecha e incidencias. El registro es una declaración del responsable; no equivale a capacitación automática.

Acordar un canal de soporte, horario, responsable de escalamiento y procedimiento de contingencia. No prometer atención 24/7, funcionamiento sin conexión ni capacidad de hora punta sin personal y pruebas que lo respalden.

## Seguimiento y copias programadas

El módulo **Configuración → Piloto y soporte** permite registrar el plan, las pruebas y las incidencias. La consola global permite configurar Mistral, revisar respaldos y atender soporte. El workflow de copias externas añade programación, retención, cifrado y restauración técnica diaria al script PostgreSQL anterior. Consultar [Puesta en marcha y recuperación](OPERATIONAL-LAUNCH.md) para configuración, custodia de claves y procedimiento de recuperación.
