# Diseño — Plantillas de factura: tabla adaptativa, campos manuales y detección fiable (2026-08-13)

## Origen

Tras el revisor de plantillas (subir un PDF de muestra y marcar cada texto como
Modificable o Fijo), el usuario pidió el "resultado perfecto": una factura
descargada con la plantilla activa debe quedar idéntica al diseño, con el
contenido real del documento. Los fallos detectados al probar facturas reales:

1. **La tabla se desbordaba**: con pocas líneas, lo que va debajo de la tabla
   (los totales) se empujaba a coordenadas negativas y pdfme fallaba con
   `Cannot read properties of undefined (reading 'push')`.
2. **Los campos `custom_1..custom_5` (nº de pedido, matrícula, agente, envío,
   fecha de entrega) no tienen dónde rellenarse**: la detección los asigna
   desde la etiqueta del PDF, pero no hay campo en el formulario ni forma de
   guardarlos en la factura.
3. **La detección por diccionario cubre pocas variantes** (inglés, abreviatura
   "Nº", "Fecha emisión"…), lo que deja muchos campos sin asignar en facturas
   reales.

## Acuerdo de alcance (2026-08-13)

- En el formulario de factura, cuando hay plantilla activa, **solo se muestran
  los campos manuales que la plantilla usa** (los `custom_N` presentes en la
  plantilla) y que no tengan fuente automática. Los campos con fuente
  automática (historial del cliente, totales…) no se muestran.
- El dato se persiste en la factura (borrador o emitida) como `datosExtras`,
  y se rellena en el PDF con la plantilla activa.
- La detección amplía diccionarios y etiquetas, cubierta por tests.

## 1. Tabla adaptativa (verificado e implementado)

El bug real: la altura de la tabla usaba `tabla.altoTotal` (la del PDF de
muestra) sin tope. Con una factura de menos líneas, la tabla encogía pero los
totales conservaban su posición original → quedaban a una Y negativa → el
repaginador de pdfme (que divide la posición entre la altura de página) pasaba
a la página `-1` y reventaba en `pages[-1].push`.

Fix en `src/lib/plantillas/plantilla.ts` (función `alturaReservaTabla`):

```
alturaReserva = min(altoTotal,
                    altoPagina − margenPie − tabla.y,      // tope de página
                    proximoCampoDebajo − tabla.y + minCab)  // tope por campo
```

- Con el mismo número de líneas que la muestra → altura idéntica → calco exacto.
- Con menos líneas → la tabla encoge y los totales suben con ella (correcto).
- Con más líneas → crece hasta el tope y repagina.
- `alturaMinimaCabecera` garantiza que nunca quede una tabla de 0 de alto.

Verificado con tests en `generar.test.ts` y reproducción empírica del crash
original. **Ya está commiteado este ciclo** (junto con este diseño).

## 2. Campos manuales en el formulario

### 2.1 Contrato

`contrato.ts`: los campos `custom_1..custom_5` se marcan `manual: true`
(nuevo atributo en `CampoPlantilla`), indicando que no tienen fuente
automática y que si la plantilla los usa, el formulario debe dejarlos editar.

### 2.2 Nuevo helper: `clavesManualesUsadasPorPlantilla`

En `src/lib/plantillas/plantilla.ts` (junto a `columnasDePlantilla`):

```ts
export function clavesManualesUsadasPorPlantilla(plantilla: Template): string[]
```

- Recorre `plantilla.schemas` + `plantilla.basePdf.staticSchema`.
- Reconoce los campos cuyo nombre coincide con `custom_N` (con o sin sufijo
  de duplicado `_2`, `_3`… generado por `nombreDeCampo`).
- Devuelve las claves únicas ordenadas (`['custom_1', 'custom_3']`).

### 2.3 Formulario de factura

En `src/app/(app)/facturas/nueva/page.tsx` y `[id]/editar/page.tsx`:

- Al montar, si hay plantilla activa de factura (y es "Modificable" usable),
  se cargan `clavesManualesUsadasPorPlantilla`.
- Si la lista no está vacía, se muestra una tarjeta **"Datos para la
  plantilla"** (entre Datos generales y Líneas) con un `<input>` por clave,
  etiquetado con la `etiqueta` del contrato (`Nº de pedido`, `Matrícula`…).
- El estado de cada input vive en `datosExtras: Record<string, string>` del
  documento; se guarda al guardar la factura y se precarga al editar.

### 2.4 Persistencia (`datosExtras`)

- `src/lib/types.ts`: `Invoice` gana `datosExtras?: Record<string, string>`.
- `src/lib/storage.ts`:
  - `buildInvRow`: añade `datos_extras: inv.datosExtras ?? {}`.
  - `mapInvoiceFromDb`: lee `inv.datos_extras` → `datosExtras` (con fallback `{}`).
- Migración SQL (supabase): `alter table public.invoices add column
  datos_extras jsonb not null default '{}';` (y lo mismo para `albaranes` si la
  columna existe en la tabla; los albaranes ya comparten el tipo `Albaran`).

### 2.5 PDF

`src/components/plantillas/BotonDescargarPdf.tsx`: pasa
`datosExtras: documento.datosExtras` a `construirDatos(...)`. El motor ya lo
soporta (`datos.ts` rellena `custom_N` desde `opciones.datosExtras`).

## 3. Parche infalible de pdfme (defensa)

La tabla adaptativa elimina el crash en los casos reales. Como red de
seguridad para plantillas editadas a mano (p. ej. un campo arrastrado sobre la
tabla), se parchea `@pdfme/common`:

- Script `scripts/parchear-pdfme.mjs`: localiza
  `node_modules/@pdfme/common/dist/index.js`, verifica que contiene el patrón
  esperado de `placeUnitsOnPages` y añade el guardado de página negativa:
  ```js
  if (currentPageIndex < 0) currentPageIndex = 0;
  ```
  Idempotente (si el guard ya está, no toca nada) y con fallo claro si el
  paquete cambia de estructura.
- Se ejecuta tras `npm install` (`postinstall` en `package.json`) y antes de
  build/preview si aplica.

## 4. Detección fiable (diccionarios)

Ampliar `ETIQUETAS` en `src/lib/plantillas/deteccion.ts` (todas las entradas
van minúsculas, con acentos, y el normalizador se encarga de comparar):

- **Nº de documento**: `numero de factura`, `nº de factura`, `no de factura`,
  `invoice number`, `invoice no`.
- **Fecha**: `fecha de la factura`, `fecha factura`, `issue date`, `fecha de
  emision de la factura`.
- **Vencimiento**: `vencimiento de la factura`, `pago vence`, `pago vence el`.
- **Forma de pago**: `forma de cobro`, `metodo de cobro`, `payment method`.
- **Estado**: `estado del documento`.
- **Serie**: `serie del documento`.
- **Base imponible**: `importe a facturar`, `base imponible`, `base iva`.
- **Total**: `total a cobrar`, `neto a pagar`, `total con iva`.
- **IVA**: `cuota iva`, `iva repercutido`, `iva soportado`, `impuestos`.
- **Descuento**: `descuento aplicado`, `% dto`, `descuento (sin importe)`.
- **custom_1** (pedido): `nº de pedido`, `referencia del pedido`,
  `referencia pedido`, `order number`, `po number`, `purchase order`.
- **custom_2** (matrícula): `nº de bastidor`, `n.º bastidor`, `vin`.
- **custom_3** (agente): `vendedor`, `comercial`.
- **custom_4** (envío): `forma de envio`, `metodo de envio`, `transportista`.
- **custom_5** (entrega): `fecha de entrega prevista`, `entrega estimada`.
- **Observaciones**: `observaciones de la factura`.

Criterio: las reglas nuevas solo se añaden si no se pisan entre sí (se prueban
en el orden de `prioridad` y cada etiqueta debe seguir clasificando igual con
los tests existentes). La ampliación se cubre con tests unitarios de
`separarEtiquetaYValor`/`detectar` (incluyendo variantes en inglés, con `Nº`,
y con `:` pegado al valor).

## Fuera de alcance (este ciclo)

- Soporte de albaranes en `BotonDescargarPdf` (los albaranes ya comparten tipo
  y motor; se deja la puerta abierta con el mapeo en `storage`).
- Detección de imágenes/marcas de agua, firma electrónica, QR Verifactu.
- Reescritura del pipeline de detección por IA.

## Archivos afectados

| Archivo | Cambio |
| --- | --- |
| `src/lib/plantillas/plantilla.ts` | (ya) `alturaReservaTabla`; (nuevo) `clavesManualesUsadasPorPlantilla` |
| `src/lib/plantillas/contrato.ts` | `manual: true` en `custom_1..5` |
| `src/lib/plantillas/deteccion.ts` | ampliar `ETIQUETAS` |
| `src/lib/plantillas/generar.test.ts` | (ya) tests de tabla adaptativa; (nuevo) helper |
| `src/lib/plantillas/deteccion.test.ts` | tests de nuevos diccionarios |
| `src/lib/types.ts` | `Invoice.datosExtras` |
| `src/lib/storage.ts` | `buildInvRow`/`mapInvoiceFromDb` |
| `supabase/migration_017_*.sql` | columna `datos_extras` |
| `src/app/(app)/facturas/nueva/page.tsx` | tarjeta de campos manuales |
| `src/app/(app)/facturas/[id]/editar/page.tsx` | precarga + tarjeta |
| `src/components/plantillas/BotonDescargarPdf.tsx` | pasar `datosExtras` |
| `scripts/parchear-pdfme.mjs` | nuevo |
| `package.json` | hook `postinstall` |
