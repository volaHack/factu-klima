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

## 2026-08-13 — Plantillas: tabla adaptativa, campos manuales y detección ampliada

### Cambio 1: la tabla de la plantilla se ajusta al contenido real

- **Dónde:** `src/lib/plantillas/plantilla.ts` (`alturaReservaTabla`, `alturaMinimaCabecera`).
- **Cambio:** la tabla encoge con pocas líneas, crece con muchas, y los totales nunca se salen de la página. Antes, con pocas líneas, pdfme podía fallar al repaginar (`Cannot read properties of undefined (reading 'push')`).
- **Red de seguridad:** `scripts/parchear-pdfme.mjs` añade un guard contra páginas negativas en el repaginador de `@pdfme/common` (idempotente, enlazado en `postinstall`/`predev`/`prebuild`/`prevercel-build`).

### Cambio 2: campos manuales de la plantilla en el formulario

- **Dónde:** `src/lib/plantillas/contrato.ts` (`manual` en `custom_1..custom_5`) · `src/lib/plantillas/plantilla.ts` (`clavesManualesUsadasPorPlantilla`) · `src/lib/types.ts` (`datosExtras` en `Invoice` y `Albaran`) · `src/lib/storage.ts` (persistencia en `datos_extras`) · `src/components/facturas/DatosPlantillaCard.tsx` · páginas de crear/editar factura · `src/components/plantillas/BotonDescargarPdf.tsx`.
- **Cambio:** si la plantilla activa usa campos `custom_N` (nº de pedido, matrícula, agente, envío, fecha de entrega…), el formulario de factura los muestra para rellenarlos y se guardan con la factura; el PDF se genera con esos valores. La detección asigna los rótulos (`Nº de bastidor`, `Vendedor`, `Método de envío`…) a esos campos.
- **Pendiente:** aplicar la migración `supabase/migration_017_invoice_datos_extras.sql` en la base de datos (añade `datos_extras JSONB` a `invoices` y `albaranes`). El código ya está preparado; sin la migración, guardar facturas con campos manuales fallará.

### Cambio 3: la detección reconoce más variantes

- **Dónde:** `src/lib/plantillas/deteccion.ts` (`ETIQUETAS`) · `src/lib/plantillas/deteccion.test.ts`.
- **Cambio:** inglés (`invoice number`, `issue date`, `payment method`, `order number`, `purchase order`…), abreviaturas `Nº`, variantes compuestas (`fecha de la factura`, `importe a facturar`, `neto a pagar`, `iva repercutido`…) y campos libres (`custom_2..custom_5`). `nº de pedido` ahora es `custom_1` (antes caía en `doc_numero`).
- **Tests:** 15 nuevos en `deteccion.test.ts`.

## Por hacer / pendientes

- [ ] Numeración auto-reparable para **devoluciones** y **abonos** (mismo patrón que albaranes: `createDevolucion`, `applyAbonoToInvoice` y sus modales).
- [ ] Colisión de numeración en un albarán creado **offline** y sincronizado después: hoy el sync lo descarta como rechazo permanente (23505) en lugar de re-numerar o avisar.
- [ ] Valorar migración SQL: índice único en `company_settings(user_id)` + limpieza de filas duplicadas existentes.
- [ ] Errores de lint preexistentes sin relación con estos cambios (`useProducts.ts`, `mockData.ts`, `RETRY_DELAY_BASE_MS` sin usar).
