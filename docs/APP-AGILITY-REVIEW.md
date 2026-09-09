# Agilidad de la aplicación

8 de septiembre de 2026. Comparación con `3fb2c383ce363c7eaa2d89d868c3af8fb2cb5fd8`.

## Cambios aplicados

- Barbería, Restaurante y Transporte cargan el código de la sección visitada mediante componentes dinámicos. Se conserva el render inicial del servidor y aparece un estado de carga durante la navegación.
- La navegación compartida muestra una señal inmediata de transición. La precarga se activa después de 150 ms de intención con mouse o foco de teclado, y se cancela al salir o hacer clic inmediato. Se precarga el límite de layout/carga de las rutas dinámicas; no se incorpora una caché persistente de datos privados.
- Barbería y Plataforma consultan las colecciones correspondientes a cada sección. Las peticiones sin sección mantienen el contrato completo. Plataforma valida la sección y sus permisos antes de consultar, devuelve `private, no-store` y elimina una consulta de sesión secuencial en la página.
- Salón y Cocina conservan los pedidos activos, incluidos los pagados aún pendientes de cocina, pero dejan de consultar el historial cerrado que no muestran.
- El asistente de creación/configuración de negocios se monta al abrirlo. Se conservan los cambios del formulario al cerrar y volver a abrir, y el botón de origen permanece disponible para recuperar el foco.
- Los selectores compartidos indexan sus etiquetas y difieren el filtrado visual para mantener fluida la escritura. La selección real y el envío siguen siendo síncronos.
- El formato monetario reutiliza hasta 32 formateadores por moneda/idioma; las tablas reutilizan el comparador de texto y números.
- La actualización automática de Salón y Cocina espera a terminar la anterior, pausa las pestañas ocultas y evita interrumpir formularios o diálogos. Las operaciones siguen confirmándose en el servidor.

## Medición reproducible

Node 22.23.2, compilaciones de producción, Chromium, servicios locales y la misma base SQLite desechable sembrada. La prueba `e2e/app-performance.spec.ts` visita 29 secciones de los cuatro ámbitos. Los resultados quedan en `outputs/app-performance/{before,after}-*.json`, excluidos de Git.

JavaScript inicial registrado por Resource Timing al mostrar el encabezado del resumen:

| Ámbito | Antes, bytes | Después, bytes | Reducción |
| --- | ---: | ---: | ---: |
| Barbería | 946.632 | 552.976 | 41,6 % |
| Restaurante | 946.632 | 552.976 | 41,6 % |
| Transporte | 946.632 | 552.976 | 41,6 % |
| Plataforma | 688.233 | 574.244 | 16,6 % |

Son bytes decodificados de recursos con iniciador `script`, no transferencia comprimida, TTI ni una medición de todos los recursos de la página. Los módulos visitados después descargan su código cuando corresponde.

Ejemplos de respuestas JSON de datos:

| Pantalla | Antes, bytes | Después, bytes | Reducción |
| --- | ---: | ---: | ---: |
| Barbería: clientes | 4.958 | 2.106 | 57,5 % |
| Barbería: servicios | 4.958 | 1.948 | 60,7 % |
| Barbería: caja | 4.958 | 2.750 | 44,5 % |
| Plataforma: planes | 31.798 | 3.008 | 90,5 % |
| Plataforma: usuarios | 31.798 | 2.532 | 92,0 % |
| Plataforma: facturación | 31.798 | 2.351 | 92,6 % |

El volumen de Restaurante y Transporte no cambió en esta muestra: ya tenían consultas por sección, y el seed no contiene el historial cerrado que ahora se omite en Salón/Cocina. La prueba de contrato agrega ese caso y verifica que los pedidos activos se conservan.

La media de duración del recorrido de navegación, desde clic hasta las comprobaciones de URL/carga/encabezado, fue 318→276 ms en Barbería, 318→350 ms en Restaurante, 362→370 ms en Transporte y 488→254 ms en Plataforma. Cada sección tiene una sola muestra de navegación; incluye esperas del ejecutor y variaciones de servidor. No demuestra que todas las pantallas sean más rápidas. Las solicitudes de API se registran con la mediana de tres muestras por sección.

Un microbenchmark local de 10.000 formatos monetarios, mediana de cinco ejecuciones, pasó de 386,2 a 9,2 ms. Este resultado corresponde únicamente a ese cálculo; no representa la velocidad de toda la aplicación.

## Validación y límites

Validación aprobada:

- `release:check`: migraciones, tipos, lint y compilaciones de backend/frontend. Registro: `.codex_tmp/agility-release-verified.log`.
- 55 pruebas unitarias: 18 de frontend y 37 de backend (`.codex_tmp/agility-unit.log`).
- 115 casos E2E, contando las variantes de navegador una vez: contratos 3, medición/navegación 4, flujos generales 11, plataforma 19, transporte 35, recorrido frontend de restaurante 6, mesas/actividad/permisos 7, validación ampliada 6, controles compartidos 15 y accesibilidad 9.

Registros E2E: `.codex_tmp/agility-e2e.log`, `agility-e2e-final.log`, `agility-e2e-verified.log`, `agility-e2e-remaining.log` y `agility-contracts-final.log`. Los primeros registros conservan fallos de las pruebas antiguas de transporte y del reinicio de su base; las suites afectadas aprobaron tras actualizar sus fixtures y la limpieza de ensambles. No se suman ejecuciones repetidas al total de 115.

Los contratos por sección comprueban que los campos usados coincidan con la respuesta completa. Las pruebas de transporte se actualizaron al flujo vigente de ensambles preparados y siguen verificando descanso, duplicidad y conflictos de vehículo, carreta y conductores.

La validación usa bases desechables, sin modificar datos operativos. Los recorridos autenticados se comprueban localmente; la publicación se verifica mediante las versiones y el estado de salud de frontend/backend. No se incluye una prueba de carga concurrente ni validación de NubeFact o impresora física.
