# Comparación final: Movendi Go original vs V2

Fecha de ejecución: 16 de agosto de 2026.

## Dictamen ejecutivo

V2 es superior dentro del alcance ya migrado —Core SaaS, Barbería, Restaurante y Super Admin— por organización, aislamiento por empresa y sucursal, consistencia visual, datos demostrables y pruebas E2E contra una base real.

V2 todavía no supera al original en amplitud total. El original conserva verticales y capacidades que aún no existen en V2: minimarket, transporte, veterinaria, panadería, eventos, portal de clientes, portal de conductores, inventario/compras, archivos, realtime y recuperación de contraseña por correo. Por tanto, V2 es la mejor base y la mejor implementación de los dos verticales migrados, pero todavía no es un reemplazo funcional completo del monorepo original.

## Evidencia de comparación viva

- Original levantado en `http://127.0.0.1:3200` con backend real en `http://127.0.0.1:3001`.
- V2 levantado por Playwright en `http://localhost:3100`.
- Comparación Playwright: 1/1 aprobada.
- Capturas generadas: 32 entre login, Barbería, Restaurante y móvil.
- V2: sin respuestas 500, errores de consola, errores de página, hidratación ni overflow horizontal durante el comparador.
- Identidad: `Movendi Go`, descripción, logo 192 y logo 512 coinciden. Los dos PNG tienen exactamente el mismo SHA-256 en ambos proyectos.

## Matriz comparativa

| Área | Original | V2 | Ganador actual |
| --- | --- | --- | --- |
| Identidad | Marca Movendi Go, logo y tema base | Mismos archivos de marca y paleta; shell más uniforme | Empate de identidad |
| Login | Completo, con recuperación y solicitud de acceso | Más limpio y consistente; sesión opaca y detección de negocio | V2 en UX/seguridad local; Original en recuperación |
| Arquitectura | 72 páginas, 42 routers y 189 modelos; gran monorepo | 4 entradas dinámicas, 7 Route Handlers y 22 modelos; módulos autocontenidos | V2 en simplicidad; Original en amplitud |
| Multiempresa | Scope por tenant | Scope servidor por tenant y sucursal en cada lectura/escritura | V2 |
| RBAC | Amplio y distribuido | Unificado entre manifiestos, UI y API | V2 |
| Barbería | Más filtros y funciones históricas, pero seed QA vacío | Flujo cliente → servicio → barbero → cita → cobro con datos reales | V2 en flujo migrado |
| Restaurante | Salón muy amplio y varios modos de vista | Mesa → pedido táctil → cocina → traslado → cobro, persistente y compacto | V2 en flujo principal; Original en opciones avanzadas |
| Super Admin | Consola amplia y configuración importable | Consola profesional con negocios, planes, suscripciones, usuarios, auditoría, catálogo y entorno | V2 en coherencia; Original conserva importación avanzada |
| Móvil | Barra inferior directa | Barra inferior contextual nueva más menú completo y safe-area | V2 |
| Pruebas | E2E frontend basado en mock en varias suites; backend muy cubierto | 108 E2E declaradas con persistencia real y seed aislado por suite | V2 para evidencia integral del alcance migrado |
| Despliegue | Frontend/backend separados y más infraestructura | Standalone único, Railway, Cloud Build y PostgreSQL de producción | V2 en operación simple |
| Verticales | Barbería, restaurante, minimarket, transporte, veterinaria, panadería, eventos y otros | Barbería y restaurante | Original |

## Mejoras aplicadas durante esta comparación

| Componente | Hallazgo | Corrección | Verificación |
| --- | --- | --- | --- |
| Navegación móvil | El original ofrecía acceso inferior más directo | Se agregó barra inferior contextual de cinco acciones con estado activo, safe-area y menú completo | Playwright móvil aprobado; navegación Agenda → Clientes verificada |
| Comparación original | La suite se omitía si el original estaba apagado | Se levantaron backend y frontend originales y se ejecutó la comparación completa | 32/32 capturas generadas; 1/1 comparador aprobado |
| Identidad | Era necesario demostrar que no se inventó otra marca | Se compararon nombre, descripción y hashes de ambos iconos | Coincidencia exacta |

## Brechas reales para que V2 sea superior en todo el producto

1. Migrar Minimarket: productos, inventario, compras, POS y reportes.
2. Migrar Transporte: flota, conductores, movimientos, mantenimiento, neumáticos, combustible, liquidaciones, gastos y reportes.
3. Migrar Veterinaria, Panadería y Eventos con sus flujos E2E reales.
4. Incorporar portales de cliente/conductor y recuperación/activación de cuenta.
5. Incorporar archivos e imágenes, notificaciones, realtime y conectores externos cuando sean necesarios.
6. Repetir por cada vertical la misma regla de V2: scope de servidor, sucursales, RBAC, datos reales, pruebas negativas y despliegue PostgreSQL.

No se marcan estas brechas como aprobadas ni implementadas.
