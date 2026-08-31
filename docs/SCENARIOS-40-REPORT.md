# Reporte de 40 escenarios y variantes

Fecha: 15 de agosto de 2026  
Resultado: **40/40 aprobados**  
Duración: **1 minuto 24 segundos**  
Navegador: Chromium  
Reintentos: **0**

## Distribución

| Área | Escenarios | Resultado |
| --- | ---: | --- |
| Acceso y seguridad anónima | 8 | 8/8 |
| Barbería | 16 | 16/16 |
| Restaurante | 14 | 14/14 |
| Aislamiento multiempresa | 1 | 1/1 |
| Responsive y estabilidad visual | 1 | 1/1 |
| **Total** | **40** | **40/40** |

## Casos ejecutados

| N.º | Área | Variante | Resultado |
| ---: | --- | --- | --- |
| 01 | Acceso | Identidad visual y ausencia de credenciales demo | Aprobado |
| 02 | Acceso | Inicio de sesión del administrador de Barbería | Aprobado |
| 03 | Acceso | Inicio de sesión del administrador de Restaurante | Aprobado |
| 04 | Acceso | Rechazo de contraseña incorrecta | Aprobado |
| 05 | Acceso | Rechazo de negocio inexistente | Aprobado |
| 06 | Seguridad | Anónimo bloqueado en clientes del núcleo | Aprobado |
| 07 | Seguridad | Anónimo bloqueado al escribir en Barbería | Aprobado |
| 08 | Seguridad | Anónimo bloqueado al escribir en Restaurante | Aprobado |
| 09 | Barbería | Dashboard sin error ni overflow | Aprobado |
| 10 | Barbería | Agenda sin error ni overflow | Aprobado |
| 11 | Barbería | Clientes sin error ni overflow | Aprobado |
| 12 | Barbería | Equipo sin error ni overflow | Aprobado |
| 13 | Barbería | Servicios sin error ni overflow | Aprobado |
| 14 | Barbería | Caja sin error ni overflow | Aprobado |
| 15 | Barbería | Configuración sin error ni overflow | Aprobado |
| 16 | Barbería | RBAC del rol Barbero | Aprobado |
| 17 | Barbería | Creación válida de cliente | Aprobado |
| 18 | Barbería | Rechazo de nombre de cliente demasiado corto | Aprobado |
| 19 | Barbería | Rechazo de teléfono duplicado | Aprobado |
| 20 | Barbería | Rechazo de comisión mayor a 100 % | Aprobado |
| 21 | Barbería | Rechazo de servicio con duración inválida | Aprobado |
| 22 | Barbería | Rechazo de cita en el pasado | Aprobado |
| 23 | Barbería | Rechazo de cita fuera de horario | Aprobado |
| 24 | Barbería | Detección de colisión entre citas | Aprobado |
| 25 | Restaurante | Dashboard sin error ni overflow | Aprobado |
| 26 | Restaurante | Salón sin error ni overflow | Aprobado |
| 27 | Restaurante | Pedidos sin error ni overflow | Aprobado |
| 28 | Restaurante | Cocina sin error ni overflow | Aprobado |
| 29 | Restaurante | Clientes sin error ni overflow | Aprobado |
| 30 | Restaurante | Carta sin error ni overflow | Aprobado |
| 31 | Restaurante | Caja sin error ni overflow | Aprobado |
| 32 | Restaurante | Configuración sin error ni overflow | Aprobado |
| 33 | Restaurante | RBAC del rol Cocina | Aprobado |
| 34 | Restaurante | Creación válida de cliente | Aprobado |
| 35 | Restaurante | Rechazo de correo de cliente inválido | Aprobado |
| 36 | Restaurante | Rechazo de producto con precio cero | Aprobado |
| 37 | Restaurante | Rechazo de mesa con más de 50 personas | Aprobado |
| 38 | Restaurante | Apertura y cancelación de pedido, restaurando la mesa | Aprobado |
| 39 | Multiempresa | Bloqueo bidireccional de datos, módulos y vistas | Aprobado |
| 40 | Presentación | Móvil, tablet y escritorio en ambas verticales | Aprobado |

## Verificaciones técnicas

- La lista de Playwright contiene exactamente 40 tests.
- TypeScript terminó sin errores.
- ESLint terminó sin errores en la nueva batería.
- Todos los tests usaron la base SQLite real, restaurada antes y después de la ejecución.
- No se omitieron casos y no se utilizaron reintentos para ocultar fallos.

## Repetición

```powershell
npm.cmd run e2e:40
```

El comando restaura los datos demo y ejecuta únicamente esta matriz de 40 escenarios.
