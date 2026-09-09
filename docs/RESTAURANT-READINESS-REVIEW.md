# Revisión de preparación operativa — 9 de septiembre de 2026

## Cambios entregados

- Acceso con correo y contraseña antes de revelar empresas; selección posterior para múltiples empresas y verificación de identidades separadas con el mismo correo. Limitación atómica por cuenta que no se reinicia cambiando IP o empresa. La consulta pública de empresas ya no está disponible sin sesión.
- Comprobación de origen de escrituras y cabeceras de seguridad básicas. Corrección del proxy para respuestas descomprimidas y reconstrucción de la autoridad HTTP. Next.js actualizado a 16.3.4 y dependencias vulnerables actualizadas.
- Cocina con vistas por pedido y por producción, agrupación que conserva observaciones distintas, tiempo transcurrido y señal de conexión. Salón y cocina consultan una revisión pequeña cada dos segundos y actualizan datos cuando cambia, sin refrescar mientras se editan campos de texto o diálogos. No se implementó operación offline ni WebSocket/SSE.
- Impresión web con confirmación del operador. Agente ESC/POS por TCP/IP, diario persistente por intento, control de vencimiento de concesiones y separación entre envío y papel confirmado. Simular no consume la cola real. USB e instalador como servicio quedan fuera de esta versión.
- Coste por receta con rendimiento y merma guardado en cada línea del pedido. Cambiar el coste del insumo posteriormente no modifica ese historial.
- Canje de puntos configurable desde el club, vista previa en caja, límites por saldo/descuento y descuento transaccional para impedir doble gasto. Devolver una venta reintegra lo canjeado y revierte lo ganado; puede quedar una deuda de puntos si los ganados ya se gastaron.
- Importación PDF por páginas mediante Mistral, con pausa/reanudación, cuota mensual, límites de tamaño/intentos y revisión manual antes de aplicar. Precios dudosos, variantes y combos se revisan; costes e impuestos no se inventan. Confirmación atómica, aislamiento por empresa/sede y reintento sin duplicar la importación. La pestaña debe permanecer abierta durante la lectura.
- Copia consistente SQLite con WAL y restauración a destino nuevo; respaldo PostgreSQL con manifiesto SHA-256 y restauración transaccional que rechaza bases ocupadas.
- Registro de capacitación y primer turno acompañado en Configuración, y guía de operación para impresoras, PDF, recuperación y aceptación fiscal.

## Evidencia local

Entorno: Node 22.23.2, compilaciones de producción de Next.js y PostgreSQL 17.5 aislado en loopback. No se ejecutó el seed sobre datos del usuario ni sobre producción.

- TypeScript y ESLint sin errores; pruebas unitarias: 18 frontend y 40 backend.
- Pruebas del agente TCP simulado y recuperación SQLite/WAL: 2 aprobadas.
- Migraciones SQLite desde base vacía: sin diferencias con el esquema. Migraciones PostgreSQL aplicadas en base aislada.
- Restauración PostgreSQL a base nueva: conteos coincidentes de empresas, clientes, pedidos, ventas e importaciones/comandas; rechazo de un destino ocupado.
- Auditoría npm completa: cero vulnerabilidades conocidas en el momento de la revisión. No equivale a ausencia de fallos de seguridad en el código.
- Recorridos de navegador aprobados: 71 (10 nuevos de preparación operativa, 5 caja/club, 31 auditoría de restaurante, 6 exclusivamente por frontend, 3 accesibilidad por resolución, 11 flujos generales y 5 controles de navegación). El ajuste posterior de foco en el filtro de cocina se verifica además con su prueba específica.
- Prueba acotada: 30 lecturas de revisión con concurrencia 10: mediana 55 ms y percentil 95 de 386 ms en la ejecución registrada. Es una medición local de ese endpoint, no una certificación de capacidad de todos los módulos o del servicio publicado.

Las evidencias y capturas están en `outputs/restaurant-readiness`, y los logs de ejecución en `.codex_tmp/readiness-*.log`; ambos directorios quedan fuera de Git. Copia previa de producción: `backups/postgresql/pre-readiness-20260909.dump` y su manifiesto. Se verificó estructura y checksum del archivo; la prueba de restauración mencionada arriba usó la base aislada de pruebas.

## Pendientes que requieren servicios o trabajo en el local

1. Configurar la cuenta Mistral y probar la carta real, evaluar exactitud por página y coste observado. La extracción se validó con respuestas simuladas; no se envió el PDF del usuario a un tercero durante esta ejecución.
2. Conectar una impresora real y validar papel, notas, caracteres, rutas, cortes, desconexión y reimpresión. La prueba de TCP usa un servidor simulado.
3. Validar NubeFact BETA de extremo a extremo: emisión, consulta, incertidumbre/reintento, XML/CDR y devolución/nota de crédito. Confirmar fiscalidad con el responsable del negocio antes de producción. Tener credenciales o probar conexión no acredita estos recorridos.
4. Ejecutar un piloto en hora punta con dispositivos y red del local; medir todas las operaciones importantes y acordar objetivos de respuesta. La actualización cada dos segundos requiere conectividad.
5. Acordar soporte, horarios, escalamiento y capacitación real. Programar copias externas con retención y simulacros; los scripts no crean ese servicio operativo automáticamente.
6. Auditoría de penetración independiente y seguimiento continuo de dependencias. La CSP añadida es una base restrictiva para objetos, formularios y enmarcado; no una CSP completa con nonces para scripts.

La implementación mejora la preparación para competir, pero no demuestra paridad comercial o de fiabilidad con otro proveedor. Tampoco acredita por sí sola soporte 24/7 ni operación fiscal o física real.

Guía: [Operación y puesta en marcha](RESTAURANT-OPERATIONS-RUNBOOK.md).
