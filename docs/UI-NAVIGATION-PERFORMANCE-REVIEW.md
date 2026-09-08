# Corrección de navegación, tema y carga de pantallas

7 de septiembre de 2026. El usuario reportó el menú de tema recortado, problemas al seleccionar una empresa y lentitud tanto local como en la web publicada.

## Cambios

- Tema y alertas se muestran en un portal anclado al botón, limitado al tamaño de la pantalla. El menú sigue la posición del botón al redimensionar, admite teclado y devuelve el foco al cerrar. Se corrigió la restitución del foco en WebKit y se habilitó el botón de alertas en móvil.
- Cada menú de alertas mantiene su estado y referencia propios; las variantes de escritorio y móvil no generan paneles duplicados.
- La barra lateral inicia expandida y dispone de un botón para contraer/expandir. Se eliminó la expansión automática al pasar el mouse: movía los enlaces entre apuntar y hacer clic, llegando a abrir otra sección. El contenido respeta el ancho elegido y no cambia por mover el puntero.
- El salón adapta mesas y pedido a una columna en laptops, evitando el desbordamiento con la barra lateral expandida; conserva el flujo táctil en móvil.
- El selector de plataforma ofrece una opción inicial explícita y permite entrar también a la empresa actual. Muestra el estado de apertura y vuelve a habilitarse tras un error.
- Inicio de sesión, cambio de empresa, cambio obligatorio de contraseña y salida hacen una sola transición con contexto limpio. Se eliminó la combinación de navegación y `router.refresh()` en esos límites de sesión. La navegación ordinaria entre pantallas conserva Next.js.
- Las consultas de Restaurante cargan las colecciones de la sección solicitada, conservando permisos y la consulta completa sin `section` para compatibilidad. Las lecturas iniciales independientes se ejecutan en paralelo.
- La lectura de sesión compartida por página/layout se deduplica durante el render actual; no se guarda una sesión entre solicitudes. Se agregó estado de carga y se desactivó la precarga masiva de enlaces de la barra.

## Medición local

Comparación del JSON de `/api/data/tenant?section=…` con la misma base de pruebas, Node 22.23.2 y builds de producción:

| Pantalla | Antes, bytes | Después, bytes | Reducción |
| --- | ---: | ---: | ---: |
| Resumen | 14.420 | 12.497 | 13 % |
| Cocina | 14.420 | 10.448 | 28 % |
| Clientes | 14.420 | 8.347 | 42 % |
| Carta | 14.420 | 9.740 | 32 % |
| Caja | 14.420 | 10.580 | 27 % |
| Reportes | 22.681 | 16.409 | 28 % |

Es una muestra pequeña, no una prueba de carga. Los tiempos de navegación varían entre pantallas y no permiten afirmar una mejora porcentual uniforme. La reducción de datos y la eliminación de movimientos/solicitudes innecesarios sí están comprobadas.

Evidencias locales: `outputs/shell-review/performance-before.json`, `performance-after.json` y capturas `theme-{navegador}-{ancho}.png` en el mismo directorio.

## Validación

Se completaron 104 ejecuciones E2E aprobadas, incluyendo las repeticiones en distintos navegadores:

- 6 recorridos completos de Restaurante, 15 controles de tema/navegación/empresa en Chromium, Firefox y WebKit y 1 medición de rendimiento (`.codex_tmp/shell-pass.log`).
- 6 casos de configuración, 19 de plataforma, 31 de auditoría de Restaurante y 9 de accesibilidad en tres navegadores y tamaños (`.codex_tmp/shell-shared-final.log`).
- 6 casos de validación ampliada, incluida la matriz responsive, y 11 flujos críticos compartidos (`.codex_tmp/shell-auth-verified.log`).

Los dos primeros registros también conservan fallos de iteraciones anteriores. Las pruebas se ajustaron a la carga por sección y a esperar la finalización del cierre de sesión; las suites afectadas aprobaron en sus siguientes ejecuciones. La última corrección del salón pasó la matriz responsive y el flujo completo de pedido, cocina, cobro y caja.

Las pruebas usan bases SQLite desechables. No se ejecutó seed ni se modificaron registros operativos en producción.

`npm run release:check` aprobó la verificación de migraciones, tipos, lint y compilaciones de backend/frontend con Node 22.23.2. Registro: `.codex_tmp/shell-release-check.log`.

## Entorno publicado

Frontend: Cloud Run `movendi-frontend`, proyecto `movendi-go-503204`, región `us-west1`. Backend: Railway `MOVENDI-GO/backend`, entorno `production`.

Antes de publicar esta corrección, `/login`, `/api/frontend-health` y `/api/health` respondieron HTTP 200. La muestra anónima midió 246–877 ms de ida y vuelta, incluyendo calentamiento/red. Una consulta de salud mostró 640,6 ms de acceso a la base y la siguiente 78,3 ms: la disponibilidad no garantiza una latencia constante. Evidencia: `outputs/shell-review/production-before.json`.

La sesión de navegador de esta tarea no tiene una cuenta autenticada de producción; los recorridos con roles se validaron localmente. La publicación se realiza mediante el push autorizado a `main`, con despliegues independientes de Railway y GitHub Actions/Cloud Run. El estado de esos despliegues se comprueba al cerrar la tarea.
