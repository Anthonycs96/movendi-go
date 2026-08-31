# Reporte de tipos de negocio y pruebas funcionales

Fecha de validación: 15 de agosto de 2026  
Estado general: **APROBADO**

Actualización: la cobertura fue ampliada a **40/40 escenarios aprobados**. El detalle está en [SCENARIOS-40-REPORT.md](./SCENARIOS-40-REPORT.md).

Atenciones reales: también se ejecutó una batería separada de **40/40 transacciones reales** —20 de Barbería y 20 de Restaurante— documentada en [REAL-ATTENTIONS-40-REPORT.md](./REAL-ATTENTIONS-40-REPORT.md).

## Resumen ejecutivo

La versión V2 tiene actualmente **dos tipos de negocio registrados y operativos**:

| Tipo | Negocio demo | Módulos propios | Pruebas automatizadas | Recorrido visual | Estado |
| --- | --- | --- | ---: | ---: | --- |
| Barbería (`BARBERSHOP`) | Nova Studio | Resumen, agenda, clientes, equipo, servicios, caja y configuración | 16/16 | 7/7 pantallas | APROBADO |
| Restaurante (`RESTAURANT`) | Brasa Norte | Resumen, salón, pedidos, cocina, clientes, carta, caja y configuración | 14/14 | 8/8 pantallas | APROBADO |

El núcleo SaaS compartido —autenticación, empresas, sucursales, usuarios, roles, permisos, sesiones, auditoría y aislamiento multiempresa— no es un tercer tipo de negocio. La matriz nueva incluye **10/10 escenarios compartidos aprobados** entre acceso, seguridad, aislamiento y presentación.

No están registrados en V2 otros tipos como minimarket, farmacia, veterinaria o ferretería.

## 1. Barbería

Negocio probado: **Nova Studio Barbería** (`nova-studio`).

### Módulos comprobados

| Ruta | Pantalla | Resultado visual |
| --- | --- | --- |
| `/dashboard` | Beauty / resumen | Carga correcta |
| `/appointments` | Reservas | Carga correcta |
| `/clients` | Clientes | Carga correcta |
| `/team` | Barberos y horarios | Carga correcta |
| `/services` | Servicios | Carga correcta |
| `/checkout` | Caja y ventas | Carga correcta |
| `/settings` | Configuración | Carga correcta |

Las 7 pantallas cargaron sin error visible, sin desbordamiento horizontal y sin errores o advertencias del navegador.

### Pruebas funcionales ejecutadas

1. **Flujo completo de atención — aprobado**
   - Creación y edición de cliente.
   - Creación y reprogramación de cita.
   - Cambio de estados de la cita.
   - Cobro de la atención.
   - Cierre de caja.
2. **Configuración operativa — aprobado**
   - CRUD lógico de profesional.
   - Configuración de horarios.
   - CRUD lógico de servicios.
3. **Reglas negativas de agenda y API — aprobado**
   - Anónimo: `401`.
   - Datos inválidos: `400`.
   - Registro duplicado: `409`.
   - Cita fuera de horario: `409`.
   - Cita en el pasado: `400`.
   - Colisión de horario: `409`.
   - Acceso a vertical incorrecta: `403`.
   - Recurso inexistente: `404`.

Resultado de Barbería: **3/3 escenarios automatizados aprobados**.

## 2. Restaurante

Negocio probado: **Brasa Norte Restaurante** (`brasa-norte`).

### Módulos comprobados

| Ruta | Pantalla | Resultado visual |
| --- | --- | --- |
| `/dashboard` | Restaurante / resumen | Carga correcta |
| `/floor` | Salón y pedidos | Carga correcta |
| `/orders` | Pedidos | Carga correcta |
| `/kitchen` | Cocina | Carga correcta |
| `/clients` | Clientes | Carga correcta |
| `/menu` | Carta y productos | Carga correcta |
| `/checkout` | Caja y ventas | Carga correcta |
| `/settings` | Salones y Core SaaS | Carga correcta |

Las 8 pantallas cargaron sin error visible, sin desbordamiento horizontal y sin errores o advertencias del navegador.

### Pruebas funcionales ejecutadas

1. **Flujo completo de salón y venta — aprobado**
   - Creación de reserva.
   - Apertura y actualización de pedido.
   - Cambio de cantidades.
   - Transferencia de mesa.
   - Estados de cocina.
   - Cobro y pago.
   - Liberación y limpieza de mesa.
   - Cierre de caja.
2. **Configuración operativa — aprobado**
   - CRUD lógico de cliente.
   - CRUD lógico de categoría y producto.
   - CRUD lógico de salón y mesa.

Resultado de Restaurante: **2/2 escenarios automatizados aprobados**.

## 3. Núcleo SaaS compartido

Pruebas aprobadas:

1. Creación, restricción por permisos y desactivación de usuario mediante RBAC.
2. Superadministración: creación de empresa, rol y usuario; asignación de permisos; inicio de sesión y validación del alcance.
3. Aislamiento multiempresa: un tenant no puede leer ni referenciar datos de otro tenant.

Resultado del núcleo: **3/3 escenarios automatizados aprobados**.

## 4. Pruebas transversales

| Prueba | Cobertura | Resultado |
| --- | --- | --- |
| Matriz responsive | Todas las vistas de ambas verticales en escritorio, laptop, tablet y móvil; modales, tema y consola | 1/1 aprobada |
| Tablas | Búsqueda, ordenamiento y paginación | 1/1 aprobada |
| Acceso local | `http://localhost:3000/login` | HTTP 200 |
| Acceso por red local | `http://192.168.1.119:3000/login` | HTTP 200 |

## Resultado final

- **40/40 escenarios automatizados aprobados** en la matriz ampliada por negocios.
- **15/15 pantallas recorridas visualmente** en la compilación de producción.
- Base SQLite restaurada con los datos demo limpios después de las pruebas.
- Aplicación levantada en el puerto `3000` para localhost y red local.

Conclusión: los dos tipos de negocio implementados en V2, Barbería y Restaurante, están funcionales en los flujos principales, reglas de negocio, permisos, aislamiento y presentación responsive cubiertos por esta batería.
