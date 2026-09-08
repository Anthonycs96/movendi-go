# Revisión de UI/UX y operación desde frontend — Restaurante

Fecha: 7 de septiembre de 2026. Complemento de [la auditoría técnica](RESTAURANT-PRODUCTION-AUDIT.md).

## Método

Prueba en Chromium sobre builds locales de producción, con una base SQLite desechable. El runner prepara el entorno; el restaurante evaluado se crea desde cero mediante la interfaz. La suite `e2e/restaurant-frontend-journey.spec.ts` no utiliza llamadas manuales a API ni escrituras directas a base de datos para completar operaciones de negocio. Cada rol inicia sesión y cambia su contraseña temporal mediante formularios.

Se observan excepciones JavaScript y respuestas HTTP 5xx durante el recorrido. Las capturas comprueban además que la página no tenga desbordamiento horizontal; las tablas pueden conservar su desplazamiento interno.

## Correcciones realizadas

- La navegación contraída del superadministrador tenía enlaces sin nombre accesible. Se agregaron etiquetas, títulos y estado de página actual; los módulos del asistente muestran ahora foco de teclado.
- Los permisos reales de sesión controlan las acciones de salón, pedidos, cocina, carta, promociones, clientes, inventario y emisión fiscal. El mesero deja de encontrar cobros y altas de clientes que el servidor rechaza. Los permisos del servidor siguen siendo obligatorios.
- El cierre conservaba los datos, pero su aviso desaparecía al desmontarse el formulario. El resultado ahora permanece visible en la pantalla de caja después de la actualización y se limpia al abrir una nueva sesión.
- El retiro de caja dependía de usuarios y roles administrativos que no se cargan en esa pantalla. Ahora usa el permiso de sesión correspondiente.
- El resumen deja de ofrecer “Nuevo pedido” a cocina y caja si no tienen permisos para esa operación.
- La cancelación de cocina respeta la configuración del negocio; los usuarios de consulta no reciben controles de preparación ni de estación de impresión.
- El gráfico diario agrupaba ventanas móviles de 24 horas con la fecha del inicio, por lo que una venta de hoy aparecía bajo ayer. Ahora agrupa por medianoches locales, respeta el periodo elegido y excluye ventas de otros periodos. La nota de ganancia corresponde al costo guardado en el pedido.
- Las comandas aumentan productos a 15 px, observaciones a 13 px y botones a un mínimo de 44 px de alto. Las acciones pueden distribuirse en varias líneas sin recorte.

## Recorrido funcional

| Rol / pantalla | Operación verificada |
| --- | --- |
| Superadministrador | Crear restaurante, completar 13 etapas, habilitar módulos, crear carta y mesas, asignar tres usuarios operativos y finalizar implementación. |
| Administración / inventario | Crear insumo de 100 KG, receta de 1 KG por plato y compra de 10 KG. |
| Mesero | Consultar carta y clientes, registrar dos platos con observaciones y consultar el pedido sin controles de cobro. |
| Cocina | Preparar, marcar listo y entregar, conservando las observaciones. |
| Caja | Abrir con S/ 100, cobrar S/ 40 en efectivo y cerrar con S/ 140, sin diferencia. |
| Salón | Marcar limpia la mesa y devolverla al estado libre. |
| Administración en móvil | Corregir un formulario rechazado sin perder su contenido; abrir carrito y registrar otro pedido. |
| Reportes e inventario | Consultar S/ 40 vendidos, comprobar 108 KG después del consumo, exportar CSV y cambiar de periodo. |
| Administración / caja | Registrar retiro autorizado de S/ 10 y conciliar el cierre con S/ 90. |

## Evidencia y validación

| Suite | Resultado final |
| --- | --- |
| Superadministración | 15/15 |
| Configuración de restaurante | 6/6 |
| Flujos críticos generales | 11/11 |
| Auditoría de restaurante | 20/20 |
| Recorrido exclusivamente por frontend | 5/5 |
| Unitarios de backend y frontend | 32 + 18 = 50/50 |

Builds de producción de ambos servicios, TypeScript, ESLint y revisión de espacios del diff completados. Los 57 escenarios E2E incluyen regresión de otros módulos; no equivalen a 57 funciones distintas de Restaurante. Las tres pruebas nuevas de series temporales verifican medianoche, cambio horario y límites semanales.

Registros locales: `.codex_tmp/restaurant-ui-regression-final.log`, `.codex_tmp/restaurant-ui-regression-completion.log`, `.codex_tmp/restaurant-ui-backend-unit.log`, `.codex_tmp/restaurant-ui-frontend-unit-final.log` y `.codex_tmp/restaurant-ui-lint-final.log`. La regresión se continuó sobre el mismo build después de limitar al diálogo el selector “Rubro”, que pasó a coincidir también con el nuevo nombre accesible de navegación. La suite visual final no produjo excepciones JavaScript ni respuestas HTTP 5xx.

Capturas finales:

- [Alta y configuración completadas](../outputs/restaurant-ui-ux/01-alta-finalizada.png).
- [Inventario y receta](../outputs/restaurant-ui-ux/02-inventario-configurado.png).
- [Pedido visible para mesero](../outputs/restaurant-ui-ux/03-pedido-mesero.png).
- [Comanda lista con tipografía ampliada](../outputs/restaurant-ui-ux/04-cocina-lista.png).
- [Resultado del cierre de caja](../outputs/restaurant-ui-ux/05-caja-cerrada.png).
- [Validación recuperable en móvil](../outputs/restaurant-ui-ux/06-error-formulario-movil.png).
- [Carrito móvil](../outputs/restaurant-ui-ux/07-carrito-movil.png).
- [Pedido móvil registrado](../outputs/restaurant-ui-ux/08-pedido-movil-registrado.png).
- [Reportes en escritorio](../outputs/restaurant-ui-ux/09-reportes-desktop.png).
- [Reportes en tablet](../outputs/restaurant-ui-ux/10-reportes-tablet.png).

La revisión visual confirmó formularios y controles utilizables, comandas más legibles y adaptación sin desbordamiento horizontal de la página en las capturas. Como mejora posterior, los errores de validación podrían identificar el campo concreto en lugar del aviso genérico “Revisa los datos ingresados”; actualmente permiten corregir y reenviar conservando lo escrito.

## Alcance y límites

La operación ensayada se puede realizar desde el frontend, con separación de funciones entre administración, mesero, cocina y caja. Esto no certifica todas las combinaciones de configuración, accesibilidad completa ni dispositivos físicos. Se revisan escritorio de 1280 × 720, móvil de 390 × 844 y tablet de 768 × 1024; no representa una certificación en Safari, Firefox, iOS o Android reales.

Persisten los límites de la auditoría técnica: circuito fiscal y clasificación tributaria pendientes, preparación independiente por cocina/barra incompleta, integraciones externas sin circuito completo y validación de PostgreSQL/hardware pendiente. Finalizar el asistente no certifica esas capacidades.

**El veredicto comercial continúa siendo: NO LISTO PARA VENDER como restaurante completo con SUNAT y cocina/barra independientes.**

## Reproducción

En una base exclusivamente desechable:

```powershell
$env:E2E_DATABASE_URL='file:C:/ruta/al/proyecto/apps/backend/prisma/restaurant-ui-audit.db'
node scripts/run-e2e.mjs e2e/restaurant-frontend-journey.spec.ts
```

También está disponible `npm run e2e:restaurant:ui`. El runner aplica migraciones, construye ambos servicios y restablece los datos de prueba. Nunca usar una base productiva para estas pruebas.

## Seguimiento: empresas independientes y configuración del negocio

La opción “Empresa nueva” de Configuración estaba condicionada al rol global SUPER_ADMIN; no era una facultad del administrador de la empresa. El backend también exige ese rol global para crear tenants, incluso cuando el administrador local tiene permisos `*` dentro de su propio negocio.

Se retiró el formulario de creación de empresas de la configuración compartida de Restaurante, Barbería y Transporte. La creación queda centralizada en el centro de control del superadministrador. El botón de edición se denomina ahora “Datos de la empresa”; las sucursales se mantienen como parte del negocio actual, sujetas a sus permisos y límites.

La suite de plataforma pasó 19 escenarios, incluidos cuatro de esta separación: tres administradores locales con rechazo HTTP 403 a una creación válida y un superadministrador que accede al alta desde su centro de control. Evidencia: `.codex_tmp/tenant-platform-boundary.log`.

También pasaron los seis escenarios de validación ampliada, incluido el alta centralizada, roles, aislamiento y la matriz responsive. Total de este seguimiento: 25 pruebas E2E aprobadas, builds y lint correctos. Registro adicional: `.codex_tmp/tenant-platform-validation-final.log`.
