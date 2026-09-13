# Inventario, entrega 4: separación de rubros y transacciones

## Implementación

Inventario concentra movimientos, compras, conteos y consultas de stock. Su dominio y casos de uso dependen de puertos propios; los adaptadores Prisma reciben la transacción y el ámbito de empresa/sucursal. El CRUD sencillo y las consultas permanecen en `server`, conforme al alcance de arquitectura hexagonal ligera.

Recetas, consumos de ventas, devoluciones y consultas de productos/ventas se trasladaron a `modules/restaurant/server`. Se conservó el consumo de recetas anteriores a los snapshots porque todavía permite procesar operaciones históricas; no es código muerto.

`core/composition/inventory.ts` conecta las rutas existentes con las capacidades comunes y las reglas de Restaurante. Inyecta validación de unidades, política de stock negativo y reservas físicas. Inventario ya no consulta la configuración ni los pedidos de Restaurante. Los otros rubros conservan sus valores predeterminados, sin recibir las reglas de Restaurante.

El ejecutor `withSerializableTransaction` reside en `core/database/transactions.ts`. Todos los consumidores anteriores se actualizaron: inventario, autenticación, Restaurante, comprobantes y mantenimiento de Transporte. Conserva Serializable, el plazo de 30 segundos y un máximo de tres intentos por conflicto. Los adaptadores traducen conflictos optimistas a `TransactionConflictError`; el código HTTP legacy `INVENTORY_BUSY` al agotar intentos se conserva para evitar alterar contratos.

## Código retirado

- Implementaciones de recetas, consumos, devoluciones y consultas de Restaurante en los archivos de Inventario; sus nuevas ubicaciones son únicas.
- Ejecutor anterior `withInventoryTransaction`, sus importaciones y su bloque final inalcanzable. No se dejó un alias obsoleto.
- Esquemas de recetas/devoluciones en Inventario, trasladados a Restaurante.
- Duplicación del parseo Zod a errores HTTP, sustituida por `core/validation/parse-input.ts`.

Las reglas ESLint impiden importar otros rubros desde Inventario e importar módulos de negocio desde `core/database`. Se verificó además que los casos de uso no puedan importar infraestructura. No se afirma que se haya depurado todo el SaaS: la limpieza restante acompaña cada etapa.

## Validación

- Backend: 76 pruebas aprobadas; tres pruebas exclusivas de PostgreSQL omitidas en SQLite.
- PostgreSQL: 31 pruebas aprobadas, sin omisiones. Incluyen concurrencia de consumos, compras y conteos, aislamiento, idempotencia y rollback.
- Dos caracterizaciones de ventas aprobadas antes y después del traslado: receta legacy con rendimiento/merma y venta con snapshot sin doble descuento. Se verifica rollback tanto del consumo como de la devolución.
- Composición: se conserva la configuración de Restaurante y no se aplica a Transporte. Se verifica la traducción de conflictos y los reintentos P2034.
- Builds de producción de backend/frontend, comprobación TypeScript integrada y lint del código afectado aprobados.
- E2E: 68 escenarios aprobados: 6 de configuración de Restaurante, 31 de auditoría de Restaurante, 1 de compatibilidad de inventario de Transporte y 30 de Transporte. El runner terminó con código 0 y restauró los datos iniciales de la base E2E.

El runner PostgreSQL crea un cluster local aislado y lo elimina tras detenerlo. Utiliza `db push` sobre una base nueva para estas pruebas: no sustituye la validación del historial de migraciones productivas. Los E2E utilizan su base local separada.

La auditoría conserva su posición posterior al commit. Las consultas mantienen sus límites anteriores (1.000 artículos y 300 movimientos para indicadores); corregir la paginación y los agregados sigue siendo una mejora funcional pendiente. Esta extracción no cambia el esquema de datos, los endpoints ni sus respuestas. Los logs E2E contienen mensajes de transacciones cerradas durante la importación de carta y `The destination stream closed early` en navegación, sin fallos en esos escenarios; no se declara resuelto su origen. No se publicó ningún cambio.

Con esta evidencia se cierra la etapa principal de Inventario. Esta es su cuarta entrega interna, no la etapa principal de Pagos. Quedan ocho etapas del plan completo, empezando por Ventas; el avance global se mantiene en [estado de migración](HEXAGONAL-MIGRATION-STATUS.md).
