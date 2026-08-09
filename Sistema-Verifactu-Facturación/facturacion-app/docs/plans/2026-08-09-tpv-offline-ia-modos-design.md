# Diseño: TPV offline total, inventario IA, modos Restaurante y Supermercado

Fecha: 2026-08-09 · Rama: `verifactu/tier0-seguridad`

## Contexto

El TPV actual ya es offline-first en lectura de catálogo y guardado de tickets
(IndexedDB + service worker + sync engine), pero tiene 3 huecos que impiden
"funcionar completamente sin internet":

1. **Caja (turno) online-only**: `openPosSession`, `closePosSession` y
   `getActivePosSession` abortan si no hay red (`src/lib/storage.ts:836-891`).
2. **Colisión de numeración offline**: el número de ticket se calcula con
   `getInvoices()` local + `nextTpvNumber` (`src/app/(app)/tpv/page.tsx:356-368`).
   Dos cajas offline pueden emitir el mismo número → `unique_violation` se trata
   como rechazo permanente y el sync engine descarta el ticket (se queda solo en
   local, nunca sube a Supabase).
3. **Devoluciones/anulaciones online-only**: `cancelInvoice` lanza error si no
   hay red (`storage.ts:361`).

## Objetivo

- TPV 100% funcional sin internet: vender, cobrar, abrir/cerrar caja, devolver.
  Sincronización fiable al reconectar, sin perder tickets.
- Inventario IA con patrones de consumo (más vendidos arriba), local-first.
- Modo Supermercado (layout denso + venta por peso/PLU).
- Modo Restaurante (mesas + cuenta abierta, sin cocina en esta fase).
- Mejoras menores de usabilidad.

## 1. Offline completo

### Caja local-first
- Nueva store `pos_sessions` en IndexedDB (`src/lib/offlineDb.ts`, subir
  `DB_VERSION` a 2 y migrar).
- `openPosSession` / `getActivePosSession` / `closePosSession`:
  1. Escriben local (IndexedDB) siempre.
  2. Si hay red, además upsert a `pos_sessions` en Supabase y encolan si falla.
  3. `closePosSession` calcula el arqueo a partir de las ventas en efectivo
     **locales** del turno (no de una query online).
- Las facturas offline ya llevan `pos_session_id`, así el arqueo esperado se
  puede recomponer después del sync.
- Nuevo `SyncTable = 'pos_sessions'` en el `TABLE_MAP` del sync engine.

### Numeración sin colisiones (mitigación del rechazo permanente)
- Al emitir offline, el número se genera como `<serie>-<secuencia>-<sufijo>`
  con sufijo por dispositivo (hash corto persistido en `meta`, ej. `F3K2`).
- El cliente envía `number` con un marcador tipo `TPV-1-F3K2` y un campo
  `pending_renumber: true` (columna nueva en `invoices`).
- Trigger/migración: cuando el servidor recibe un `pending_renumber`, si el
  número ya existe lo renumerará a la siguiente secuencia libre (única) y
  actualizará la factura. **Nunca se descarta el ticket.**
- En línea (red presente) se sigue usando el número normal sin sufijo.

### Devoluciones offline
- `cancelInvoice` pasa a local-first: guarda estado `ANULADA` + motivo en
  IndexedDB y encola la anulación (upsert con status ANULADA).
- Sync engine lo sube al reconectar; las reglas antifraude del servidor siguen
  aplicando para numeración, pero la anulación es idempotente.

### Indicador de sincronización
- `TpvTicket` y `TpvTodaySalesModal` muestran "Pendiente de sincronizar" cuando
  la factura aún no tiene `verifactu.chainedHash` (o un flag local `synced`).
- `TpvTodaySalesModal` avisa del número de tickets sin sincronizar.

## 2. Inventario IA (patrones de consumo)

### Datos
- Migración: columna `units_sold` (int, default 0) en `products`. Se incrementa
  al confirmar una venta (`adjustStock` o `handleConfirmCheckout`).
- Lectura/escritura local-first: misma vía que el resto de `products`.

### Ordenación inteligente
- `TpvProductGrid` ordena los tiles por `units_sold` descendente dentro de la
  categoría activa: los más consumidos arriba.
- En modo Supermercado además se prioriza la categoría con más movimiento del día.

### Panel "Patrones"
- Nueva vista (desde TPV o desde la sección de productos) con:
  - Top productos más vendidos (30 días).
  - Picos de venta por día/hora (mapa de calor simple por horas).
  - Alertas de reposición: `stockQuantity <= lowStockThreshold` combinado con
    frecuencia de venta → "Se agota en ~N días".
- Cálculo puramente client-side sobre tickets locales (`getInvoices()`), sin
  servicios externos → funciona offline.

## 3. Modo Supermercado

- Selector de modo de TPV en Ajustes (`settings.tpvMode: 'tienda' | 'supermercado' | 'restaurante'`,
  default según sector: supermercado→'supermercado', bebidas→'restaurante').
- Layout denso en `TpvProductGrid`: tiles más pequeños, más columnas,
  categorías en chips con scroll, orden IA activado.
- **Venta por peso (PLU)**: al escanear un código de báscula (EAN-13 que
  empieza por 2), abrir diálogo de peso en gramos → línea con `quantity` decimal
  y total = `kg × pricePerKg`. El precio del producto se interpreta como precio
  por kg. `PosCartLine.quantity` pasa a `number` decimal (no romper: redondeo a
  3 decimales en tickets).

## 4. Modo Restaurante (mesas + cuenta abierta)

- Nueva pestaña "Mesas" en el TPV cuando `settings.tpvMode === 'restaurante'`.
- Mapa de mesas (grid de `mesa-XX`), acciones: ocupar, añadir a cuenta, ver
  cuenta, cobrar, vaciar.
- **Cuenta abierta** = estructura local persistida en IndexedDB
  (`open_checks` store): id, mesa, líneas (reutiliza `PosCartLine`), total,
  abierta/cobrada.
- Cobrar mesa → convierte la cuenta en factura mediante el flujo existente de
  `handleConfirmCheckout` (sellado + cola de sync) y vacía la mesa.
- Sin impresora de cocina ni división avanzada de cuentas en esta fase (fase 2).

## 5. Extras

- Aviso visual + contador en "Tickets Hoy" de tickets pendientes de sync.
- Reutilizar `useBarcodeScanner` para el diálogo de peso.
- `db_version` de IndexedDB sube a 2 con migración que crea las stores nuevas
  (`pos_sessions`, `open_checks`) sin borrar datos.

## Verificación

- Unit tests: numeración offline (sin colisión), arqueo de caja local,
  ordenación IA, cálculo PLU gramos→kg.
- `npm run lint` y typecheck en cada bloque.
- Prueba manual offline (DevTools offline): vender, abrir/cerrar caja, devolver;
  reconectar y confirmar sync sin tickets perdidos.

## Fuera de alcance (fase 2)

- Impresora de cocina, división de cuentas entre comensales.
- Báscula física bluetooth; se entra el peso a mano / por PLU.
- IA predictiva con modelo externo (OpenAI); los patrones son locales.
