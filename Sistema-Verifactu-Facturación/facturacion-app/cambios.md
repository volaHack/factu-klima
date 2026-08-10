# Registro de cambios — facturacion-app

Registro de cada cambio aplicado, con su sección de pendientes.

## 2026-08-11 — Rediseño del badge de serie/numeración en el dashboard

- **Dónde:** `src/app/(app)/dashboard/page.tsx` · `src/app/globals.css` (`.hero-panel-series`).
- **Cambio:** la línea de texto "Serie FAC · la siguiente factura saldrá con el número…" pasa a ser un chip visual propio: icono sobre gradiente de acento, etiqueta "Serie FAC" en versalitas y el número en fuente mono tabular, con la pista "siguiente factura" separada. En móvil muy estrecho (≤480px) se oculta la pista para no apretar el chip.
- **Nota:** el año del número se calcula con el año actual en vez del literal `2026` que estaba fijo.

## 2026-08-11 — Numeración de albaranes y sincronización de company_settings

### Cambio 1: Numeración auto-reparable al guardar albaranes

- **Dónde:** `src/lib/storage.ts` (`saveAlbaran`, `nextFreeAlbaranNumber`, `incrementDocumentNumber`) · `src/lib/utils.ts` (`sequenceFromNumber`) · `src/app/(app)/albaranes/nueva/page.tsx`.
- **Problema:** al crear un albarán salía *"Ese registro ya existe: se ha impedido crear un duplicado"* (23505 de `uq_albaranes_user_series_number`) porque el contador `next_albaran_number` se había quedado por detrás de los números ya usados.
- **Solución:** si el número del borrador ya existe en BD se avanza automáticamente al siguiente libre; `saveAlbaran` devuelve el albarán con el número final y la página persiste el contador corregido (`sequenceFromNumber(saved.number) + 1`).
- **Tests:** `src/lib/albaranes.test.ts` — 2 nuevos: re-numera cuando el número ya existe y conserva el número cuando está libre. Suite completa 79/79.

### Cambio 2: company_settings tolera filas duplicadas (fuera los `.single()`)

- **Dónde:** `src/lib/storage.ts` (`getCompanySettings`, `saveCompanySettings`).
- **Problema:** las lecturas `.single()` devolvían 406 cuando existía más de una fila de `company_settings`, y los settings caían a los valores por defecto (contadores a 1) → nuevos choques de numeración.
- **Solución:** leer/actualizar siempre la fila más reciente con `.order('updated_at', { ascending: false }).limit(1)` (devuelve array) en vez de `.single()`.

### Cambio 3: la cola de sync ya no crea filas duplicadas de company_settings

- **Dónde:** `src/lib/syncEngine.ts` (`processItem`).
- **Problema:** `company_settings` no tiene índice único por `user_id`; el upsert de la cola (que no lleva id de BD) insertaba una fila nueva en cada pasada de sync, acumulando duplicados que rompían los `.single()` y reiniciaban los contadores.
- **Solución:** para `company_settings` se resuelve la fila existente y se actualiza; si no existe, se inserta.

## Por hacer / pendientes

- [ ] Numeración auto-reparable para **devoluciones** y **abonos** (mismo patrón que albaranes: `createDevolucion`, `applyAbonoToInvoice` y sus modales).
- [ ] Colisión de numeración en un albarán creado **offline** y sincronizado después: hoy el sync lo descarta como rechazo permanente (23505) en lugar de re-numerar o avisar.
- [ ] Valorar migración SQL: índice único en `company_settings(user_id)` + limpieza de filas duplicadas existentes.
- [ ] Errores de lint preexistentes sin relación con estos cambios (`useProducts.ts`, `mockData.ts`, `RETRY_DELAY_BASE_MS` sin usar).
