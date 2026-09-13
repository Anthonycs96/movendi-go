# Operación del ejecutor fiscal · etapa 6

El motor fiscal y la impresión compartida están implementados y validados localmente. La etapa 6 sigue **en validación externa**: la base local no tiene credenciales fiscales ni trabajos pendientes, no se dispone de un entorno de aceptación confirmado y no se enviaron documentos a un proveedor real.

## Alternativas de ejecución implementadas

1. `npm run jobs:fiscal:worker`: trabajador dentro del backend, con acceso directo a su base y clave de cifrado.
2. `npm run jobs:fiscal:runner`: proceso Node independiente que invoca `POST /api/internal/jobs/fiscal`. Requiere `JOB_RUNNER_API_URL` y `JOB_RUNNER_SECRET`. El backend necesita el mismo secreto. El proceso no recibe credenciales fiscales ni acceso directo a la base.

Usar un mecanismo de ejecución supervisado en el entorno elegido. No es necesario activar ambos. Las reservas durables coordinan instancias concurrentes y los reintentos conservan la identidad fiscal.

El endpoint acepta como máximo un trabajo por solicitud y autentica antes de consultar la cola. Utiliza la autorización común de ejecutores; una sesión normal de usuario no lo autoriza. El proceso acepta HTTPS o HTTP en loopback, rechaza URLs con credenciales y no sigue redirecciones. Tolera fallos de conexión y respuestas inválidas, informa el fallo y vuelve a consultar; `--once` devuelve un código de error para diagnósticos. SIGINT/SIGTERM detienen la espera y cancelan la solicitud cliente en curso; un trabajo tomado por el backend conserva su reserva durable.

Las cifras `scanned` y `completed` describen el procesamiento del lote; la aceptación fiscal se consulta en el estado del documento, no se deduce de que el ejecutor haya respondido correctamente.

Se incluye `Dockerfile.fiscal-runner`, que ejecuta el proceso como usuario sin privilegios. Variables mínimas:

```text
JOB_RUNNER_API_URL=https://<backend-del-entorno>
JOB_RUNNER_SECRET=<secreto-del-ejecutor-configurado-en-backend>
```

No registrar tokens ni poner secretos en la imagen. En el servicio elegido configurar reinicio ante fallo y revisar los eventos `fiscal_runner_batch`; no usar el healthcheck HTTP del frontend para este proceso sin servidor HTTP. El contenedor y el servicio externo no se han puesto en marcha en esta entrega; el proceso sí se probó localmente.

## Cierre pendiente de etapa 6

- Configurar una cuenta BETA del proveedor en la interfaz, con su URL, ambiente y token correspondientes. No enviar credenciales por el chat.
- En el entorno de pruebas, emitir una boleta/factura, consultar su resultado y probar una nota de crédito; contrastar importes y archivos devueltos con el proveedor.
- Poner en servicio el ejecutor supervisado y comprobar su recuperación después de detenerlo. El código no se publicó por aprobar esta fase de arquitectura.
- Completar la prueba física de impresión cuando haya equipo y la operación supervisada del negocio. Las pruebas virtuales ya verifican contenido, fallos y protección contra envíos duplicados; no verifican papel ni corte real.

Una pausa del ejecutor conserva la cola. Para revertir su despliegue, detener solo ese proceso; no borrar trabajos, reservas, números ni tramas. Al reanudar se consulta primero cuando corresponde. Los cambios de cuenta o ambiente requieren conciliar trabajos de la identidad original, sin redirigirlos a credenciales distintas.

## Evidencia local

`scripts/fiscal-job-runner.test.mjs` ejecuta el proceso contra un servidor local: autenticación, éxito, HTTP 503, reinicio, respuesta inválida, redirección rechazada y destino inseguro bloqueado. Las pruebas del backend comprueban autorización y lote acotado; E2E verifica el rechazo real del endpoint sin secreto y con uno incorrecto. La concurrencia, aislamiento y reversión del motor fiscal siguen cubiertas por PostgreSQL.
