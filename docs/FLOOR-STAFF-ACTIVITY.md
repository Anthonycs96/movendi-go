# Mesas y actividad del personal

## Operación desde el frontend

- En **Salón → Mesas y pedido**, las mesas y la carta permanecen en la misma vista. En pantallas amplias, las mesas forman una columna lateral compacta; en pantallas medianas se distribuyen encima de la carta y en móviles se recorren horizontalmente. Elegir otra mesa cambia directamente su pedido, sin botón de regreso.
- Cada mesa muestra nombre, estado y área o código de pedido. Las acciones de reserva, recepción, limpieza y QR se agrupan para la mesa seleccionada. El pedido activo conserva sus detalles en el panel de atención.
- Los borradores de pedidos nuevos se conservan por mesa y modalidad mientras permanece abierta esta vista. Cambiar entre mesas, para llevar y delivery no mezcla sus productos. Al enviar un pedido se limpia su borrador; durante el envío se bloquea el cambio de mesa o modalidad.
- **Salón → Actividad del personal** muestra los trabajadores de la sucursal, su última acción registrada y el número de pedidos abiertos que crearon. El registro cronológico permite filtrar por trabajador, últimas 24 horas o últimos 7 días, y consultar páginas anteriores.
- La página de actividad reciente se actualiza cada 15 segundos mientras está visible. También dispone de **Actualizar** y de un estado de error con reintento. La consulta del salón se pausa mientras se ve la actividad.
- Al cambiar de sucursal se reinicia la vista, incluidos pestañas, filtros y borradores, para no conservar información de la sede anterior.

## Permisos

En **Configuración → Roles → Editar**, el administrador puede asignar **Ver actividad del personal (en Salón)** al rol correspondiente. Ese rol también necesita **Ver salón y mesas** para entrar al salón. El permiso específico es `restaurant:staff:read`; no se concede por los permisos antiguos de lectura general o de caja. Administrador conserva acceso total.

La API verifica la sesión y el permiso en cada consulta. Los datos se limitan a la empresa y sucursal de la sesión, incluidos los filtros y cursores de paginación. El registro previo de auditoría del restaurante también exige este permiso. No se entregan correos, contraseñas ni metadatos internos.

Las acciones corresponden a operaciones registradas en el sistema. No indican presencia física, conexión actual ni actividad fuera de la aplicación; la autoría de un pedido no equivale a una asignación de trabajo vigente.

## Validación

Se aprobaron 39 ejecuciones E2E: 7 de la nueva función, 6 recorridos completos de restaurante, 11 flujos compartidos, 6 validaciones generales y 9 revisiones de accesibilidad en Chromium, Firefox y WebKit. Incluyen aislamiento por empresa/sucursal, cambio de sede desde el frontend, revocación de permisos, filtros, paginación, conservación del borrador dentro de la misma sucursal y tamaños de 390 a 1920 px. La comprobación de modo oscuro detectó y corrigió el contraste del filtro activo de mesas.

`npm run release:check` aprobó migraciones, tipos, lint y compilaciones. Evidencias locales en `.codex_tmp/staff-e2e-final.log`, `staff-cross-browser.log`, `staff-accessibility-final.log` y `staff-release-final.log`; el registro entre navegadores conserva el fallo de contraste anterior a su corrección. Capturas en `outputs/staff-review` y `outputs/restaurant-browser-review`. Las pruebas se ejecutaron en una base desechable, sin modificar datos operativos.

El ajuste final de cambio de sucursal aprobó `staff-branch-release.log` y los 7 casos de `staff-branch-verified.log`.

El rediseño compacto volvió a validar los 39 casos: 7 de mesas/actividad y 6 recorridos en `compact-e2e-final.log`; 11 flujos generales, 6 validaciones y 6 casos Firefox/WebKit en `compact-e2e-remaining.log`; y 3 casos Chromium en `compact-accessibility-final.log`. Los registros iniciales conservan los fallos de selectores que todavía esperaban pasos eliminados y del contraste de la categoría activa en modo oscuro, corregidos antes de la última ejecución. La matriz comprueba tamaños mínimos de mesa, cambio directo, borradores separados por mesa/modalidad y operación móvil. `compact-verified-release.log` acredita migraciones, tipos, lint y compilaciones del resultado final.
