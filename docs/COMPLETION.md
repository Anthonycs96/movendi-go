# Definición de terminado del alcance local

Fecha: 16 de agosto de 2026.

El “100%” de este proyecto significa que los cuatro dominios comprometidos —Core SaaS, Barbería, Restaurante y Transporte— pueden completar sus ciclos operativos principales con persistencia, autorización y aislamiento reales. No significa replicar proveedores externos sin credenciales ni toda la infraestructura empresarial del proyecto original.

## Matriz de aceptación

| Dominio | Ciclo terminado | Evidencia automatizada |
| --- | --- | --- |
| Identidad | Login, logout, expiración, cookie opaca, contraseña bcrypt y revocación de sesiones. | E2E de autenticación/RBAC y pruebas de permisos. |
| Multi-tenant | Tenant y sucursal fijados por sesión; referencias externas revalidadas en servidor; sucursales inactivas no sostienen sesiones. | E2E de lectura/escritura cruzada y acceso a vertical ajeno. |
| Plataforma | Centro Super Admin; métricas globales; crear/editar/suspender/reactivar empresas; planes, suscripciones, equipo global, auditoría y catálogo. | 15 E2E globales incluyendo alta completa y acceso del nuevo administrador. |
| Administración del tenant | Crear/editar sucursal, usuario y rol; activar/desactivar; proteger usuario actual y último administrador; auditar cambios. | E2E restringe, desactiva y rechaza el login del operador. |
| Barbería | Mantener clientes, profesionales, horarios y servicios; crear, confirmar, reprogramar, marcar ausencia/cancelar y cobrar citas; abrir/cerrar caja. | E2E completa cliente → edición → cita → reprogramación → cobro → cierre sin diferencia. |
| Restaurante | Mantener clientes, categorías, productos, ambientes y mesas; reservar/liberar; crear/trasladar/cancelar pedido; operar KDS; cobrar, limpiar y cerrar caja. | E2E completa reserva → pedido → traslado → preparación → cobro → limpieza → cierre. |
| Transporte | Mantener maestros, rutas, flota, conductores y documentos; programar/asignar/seguir viajes; controlar descansos; registrar incidentes, gastos, pagos, combustible, OT, repuestos y neumáticos; cerrar liquidación. | 30 E2E reales cubren ciclos válidos, límites, errores de usuario, RBAC, aislamiento y responsive. |
| Calidad UI | Navegación por manifiestos/RBAC, feedback de mutaciones, escritorio, móvil, tema y ausencia de overflow. | E2E observa consola/respuestas y captura desktop/mobile. |
| Entrega | Seed reproducible, Prisma validado, unit tests, ESLint, TypeScript, build y Playwright. | Comandos de la sección Calidad del README. |

## Fuera del alcance local

La conexión efectiva a Railway/Google Cloud, GPS externo, SUNAT/GRE, almacenamiento de archivos, email transaccional, pasarela, telemetría multi-instancia, backups administrados y observabilidad externa requieren cuentas o infraestructura del propietario. El rate limiting ya persiste en base y el backup local está implementado, pero no se presentan proveedores externos como servicios ya conectados.
