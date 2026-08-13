# Plantillas: campos manuales + detección ampliada Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:ejecutar-planes to implement this plan task-by-task.

**Goal:** Que los campos `custom_1..5` (nº de pedido, matrícula, agente, envío, fecha de entrega) se puedan rellenar en el formulario de factura, persistir en la factura y pintarse con la plantilla activa; y que la detección por diccionario reconozca más variantes (inglés, abreviaturas).

**Architecture:** `datos.ts` ya rellena `custom_N` desde `opciones.datosExtras` — falta (a) marcarlos como manuales en el contrato, (b) un helper que diga qué `custom_N` usa la plantilla activa, (c) inputs en el formulario de factura (alta y edición), (d) persistencia `datos_extras` en `storage` + migración SQL, y (e) pasar `datosExtras` desde `BotonDescargarPdf`. La detección amplía `ETIQUETAS` en `deteccion.ts` sin romper tests existentes.

**Tech Stack:** TypeScript, React (Next.js App Router, client components), Supabase (Postgres + IndexedDB offline sync), pdfme, Vitest.

---

### Task 0: Commitear el fix de la tabla adaptativa ya verificado

La tabla adaptativa (altura de reserva recortada a topes de página y de campo)
ya está implementada y probada en `plantilla.ts` + `generar.test.ts`.

**Step 1: Verificar estado**

Run: `git status --short`
Expected: `plantilla.ts` y `generar.test.ts` modificados.

**Step 2: Revisar que el diff es solo el fix de la tabla**

Run: `git diff --stat`
Expected: solo los dos archivos, sin más cambios.

**Step 3: Commit**

```bash
git add src/lib/plantillas/plantilla.ts src/lib/plantillas/generar.test.ts
git commit -m "fix(plantillas): limitar la altura de la tabla para evitar el crash del repaginador"
```

---

### Task 1: Marcar `custom_1..5` como campos manuales en el contrato

**Files:**
- Modify: `src/lib/plantillas/contrato.ts` (interfaz `CampoPlantilla` ~línea 31, entradas `custom_1..5` ~líneas 88-92)
- Test: `src/lib/plantillas/contrato.test.ts`

**Step 1: Write the failing test**

En `contrato.test.ts`, dentro de un `describe` nuevo:

```ts
describe('campos manuales', () => {
  it('los campos custom_1..5 están marcados como manuales', () => {
    for (const n of ['1', '2', '3', '4', '5']) {
      const campo = campoPorClave(`custom_${n}`);
      expect(campo?.manual).toBe(true);
    }
  });

  it('ningún campo con fuente automática es manual', () => {
    for (const clave of ['empresa_nombre', 'cliente_nombre', 'doc_numero', 'total_general']) {
      expect(campoPorClave(clave)?.manual).toBeFalsy();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/plantillas/contrato.test.ts`
Expected: FAIL (la propiedad `manual` no existe).

**Step 3: Implement**

En `CampoPlantilla`:

```ts
/** El usuario lo rellena a mano en el formulario; no tiene fuente automática. */
manual?: boolean;
```

En cada entrada `custom_1..custom_5`, añadir `manual: true,`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/plantillas/contrato.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/plantillas/contrato.ts src/lib/plantillas/contrato.test.ts
git commit -m "feat(plantillas): marcar custom_1..5 como campos manuales"
```

---

### Task 2: Helper `clavesManualesUsadasPorPlantilla`

**Files:**
- Modify: `src/lib/plantillas/plantilla.ts` (junto a `columnasDePlantilla`, ~línea 523)
- Test: `src/lib/plantillas/__visual.test.ts` (ya importa Template) o nuevo `plantilla.test.ts`

**Step 1: Write the failing test**

```ts
import { clavesManualesUsadasPorPlantilla } from './plantilla';

describe('clavesManualesUsadasPorPlantilla', () => {
  const base = (schemas: any[], staticSchema: any[] = []) => ({
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10], staticSchema },
    schemas,
  });

  it('devuelve las claves custom_N usadas, sin duplicados y ordenadas', () => {
    const t = base([
      [{ name: 'cliente_nombre', type: 'text' }],
      [
        { name: 'custom_2', type: 'text' },
        { name: 'custom_1', type: 'text' },
      ],
    ], [{ name: 'custom_3', type: 'text' }]);
    expect(clavesManualesUsadasPorPlantilla(t as any)).toEqual(['custom_1', 'custom_2', 'custom_3']);
  });

  it('ignora los duplicados con sufijo (_2, _3) y los campos no manuales', () => {
    const t = base([
      [
        { name: 'custom_1', type: 'text' },
        { name: 'custom_1_2', type: 'text' },
        { name: 'total_general', type: 'text' },
      ],
    ]);
    expect(clavesManualesUsadasPorPlantilla(t as any)).toEqual(['custom_1']);
  });

  it('devuelve lista vacía si la plantilla no usa ningún custom', () => {
    expect(clavesManualesUsadasPorPlantilla(base([[{ name: 'doc_numero', type: 'text' }]]) as any)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/plantillas`
Expected: FAIL (`clavesManualesUsadasPorPlantilla` is not a function).

**Step 3: Implement**

```ts
/** Claves `custom_N` (manuales) que la plantilla usa, únicas y ordenadas. */
export function clavesManualesUsadasPorPlantilla(plantilla: Template): string[] {
  const nombres = new Set<string>();
  const recorrer = (esquema: Schema[]) => {
    for (const campo of esquema ?? []) {
      const m = campo.name?.match(/^custom_([1-5])(_\d+)?$/);
      if (m) nombres.add(m[0].replace(/_\d+$/, ''));
    }
  };
  for (const pagina of plantilla.schemas ?? []) recorrer(pagina);
  recorrer(plantilla.basePdf?.staticSchema ?? []);
  return [...nombres].sort();
}
```

Nota: la regex admite el sufijo de duplicado (`custom_1_2`) que genera
`nombreDeCampo`, y devuelve solo la clave base.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/plantillas`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/plantillas/plantilla.ts
git commit -m "feat(plantillas): helper clavesManualesUsadasPorPlantilla"
```

---

### Task 3: `Invoice.datosExtras` + mapeo en storage

**Files:**
- Modify: `src/lib/types.ts` (`Invoice` ~línea 86)
- Modify: `src/lib/storage.ts` (`buildInvRow` ~línea 266, `mapInvoiceFromDb` ~línea 2154)

**Step 1: Write the failing test**

`storage.ts` no tiene tests unitarios (depende de Supabase/IndexedDB). La
verificación será con `npx tsc --noEmit` tras el cambio de tipos. Se crea un
test mínimo del mapeo puro si `mapInvoiceFromDb` fuera puro; no lo es, así que
la cobertura se hace por tipado + revisión manual.

En su lugar, comprobar el contrato en `types.test.ts` (si existe) o añadir
assert en `contrato.test.ts`:

```ts
import type { Invoice } from '../types';
it('Invoice acepta datosExtras', () => {
  const inv: Invoice = { ...facturaMinima(), datosExtras: { custom_1: 'PED-001' } };
  expect(inv.datosExtras?.custom_1).toBe('PED-001');
});
```

(Si `facturaMinima` no existe, crear un objeto con todos los campos obligatorios de `Invoice`.)

**Step 2: Run typecheck to verify**

Run: `npx tsc --noEmit`
Expected: FAIL (falta `datosExtras` en `Invoice`).

**Step 3: Implement**

En `types.ts`, en `Invoice`:

```ts
/** Valores libres para los campos manuales de la plantilla activa (custom_N). */
datosExtras?: Record<string, string>;
```

En `storage.ts` `buildInvRow` (el objeto que va a Supabase/IndexedDB):

```ts
datos_extras: inv.datosExtras ?? {},
```

En `mapInvoiceFromDb` (después de `notes`):

```ts
datosExtras: inv.datos_extras ?? {},
```

**Step 4: Run typecheck to verify**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/storage.ts
git commit -m "feat(datos): persistir datosExtras en la factura (columna datos_extras)"
```

---

### Task 4: Migración SQL `datos_extras`

**Files:**
- Create: `supabase/migration_017_invoice_datos_extras.sql`

**Step 1: Create the migration**

```sql
-- Campos manuales de plantilla (nº de pedido, matrícula, agente, envío,
-- fecha de entrega) en facturas y albaranes.
alter table public.invoices add column if not exists datos_extras jsonb not null default '{}';
alter table public.albaranes add column if not exists datos_extras jsonb not null default '{}';
```

Comprobar antes con `supabase_list_tables` que `albaranes` existe (si no,
solo `invoices`).

**Step 2: Apply via MCP** (`supabase_apply_migration`) con el mismo SQL.
Expected: migración creada.

**Step 3: Commit**

```bash
git add supabase/migration_017_invoice_datos_extras.sql
git commit -m "feat(datos): migración datos_extras en invoices y albaranes"
```

---

### Task 5: Inputs de campos manuales en el formulario de factura (alta)

**Files:**
- Modify: `src/app/(app)/facturas/nueva/page.tsx`
- Test: ninguno automático (componente client con Supabase); verificación manual + lint.

**Step 1: Escribir el estado y la carga de la plantilla activa**

Imports nuevos:

```ts
import { getPlantillaActiva } from '@/lib/plantillas/almacen';
import { clavesManualesUsadasPorPlantilla } from '@/lib/plantillas/plantilla';
import { campoPorClave } from '@/lib/plantillas/contrato';
```

Estado:

```ts
const [clavesManuales, setClavesManuales] = useState<string[]>([]);
const [datosExtras, setDatosExtras] = useState<Record<string, string>>({});
```

En el `useEffect` de carga:

```ts
try {
  const plantilla = await getPlantillaActiva('factura');
  if (plantilla?.plantilla) {
    setClavesManuales(clavesManualesUsadasPorPlantilla(plantilla.plantilla));
  }
} catch {
  // Sin plantilla activa no hay campos manuales que mostrar.
}
```

**Step 2: Render de la tarjeta**

Entre la tarjeta "Datos generales" y "Líneas de factura":

```tsx
{clavesManuales.length > 0 && (
  <div className="card">
    <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos para la plantilla</h3>
    <div className="form-row" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      {clavesManuales.map(clave => {
        const campo = campoPorClave(clave);
        return (
          <div className="form-group" key={clave} style={{ flex: '1 1 220px' }}>
            <label className="form-label">{campo?.etiqueta ?? clave}</label>
            <input
              className="form-input"
              value={datosExtras[clave] ?? ''}
              onChange={e => setDatosExtras(prev => ({ ...prev, [clave]: e.target.value }))}
              placeholder={campo?.descripcion ?? ''}
            />
          </div>
        );
      })}
    </div>
  </div>
)}
```

**Step 3: Incluir `datosExtras` al construir la factura**

En `handleSave`, en el objeto `invoice`:

```ts
datosExtras,
```

**Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. Después, `npm run dev` y comprobar que con plantilla activa que
usa `custom_1` aparece la tarjeta, y sin plantilla no aparece.

**Step 5: Commit**

```bash
git add "src/app/(app)/facturas/nueva/page.tsx"
git commit -m "feat(plantillas): inputs de campos manuales en el alta de factura"
```

---

### Task 6: Mismo en edición (precarga)

**Files:**
- Modify: `src/app/(app)/facturas/[id]/editar/page.tsx`

**Step 1: Precargar los valores guardados**

Tras cargar la factura (`getInvoiceById`/`getInvoiceFromSupabase`):

```ts
const claves = clavesManualesUsadasPorPlantilla(plantilla.plantilla);
setClavesManuales(claves);
setDatosExtras(factura.datosExtras ?? {});
```

**Step 2: Render la misma tarjeta que en alta (mismo JSX) y pasar `datosExtras` al guardar.**

**Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

**Step 4: Commit**

```bash
git add "src/app/(app)/facturas/[id]/editar/page.tsx"
git commit -m "feat(plantillas): campos manuales en edición de factura (precarga)"
```

---

### Task 7: Pasar `datosExtras` desde `BotonDescargarPdf`

**Files:**
- Modify: `src/components/plantillas/BotonDescargarPdf.tsx` (líneas ~51-53 y ~115-117)

**Step 1: Implement**

En ambas llamadas a `construirDatos`:

```ts
const datos = tipo === 'factura'
  ? construirDatos({ tipo: 'factura', documento: documento as Invoice }, ajustes, {
      cliente,
      datosExtras: (documento as Invoice).datosExtras,
    })
  : construirDatos({ tipo: 'albaran', documento: documento as Albaran }, ajustes, {
      cliente,
      datosExtras: (documento as Albaran).datosExtras,
    });
```

**Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. Manual: factura con `custom_1` rellenado → PDF muestra el valor.

**Step 3: Commit**

```bash
git add src/components/plantillas/BotonDescargarPdf.tsx
git commit -m "feat(plantillas): pasar datosExtras al generar el PDF"
```

---

### Task 8: Ampliar diccionarios de detección

**Files:**
- Modify: `src/lib/plantillas/deteccion.ts` (`ETIQUETAS` ~líneas 126-145)
- Test: `src/lib/plantillas/deteccion.test.ts`

**Step 1: Write the failing tests**

Añadir al final de `deteccion.test.ts`:

```ts
describe('detección ampliada por diccionario', () => {
  const asignar = (etiqueta: string) => {
    const [linea] = agruparEnLineas([texto(etiqueta, 10, 30)]);
    const analisis = detectar(paginaDeEjemplo([texto(etiqueta, 10, 30), texto('X', 80, 30)]));
    return claves(analisis);
  };

  it.each([
    ['Numero de factura', 'doc_numero'],
    ['Invoice number', 'doc_numero'],
    ['Fecha de la factura', 'doc_fecha'],
    ['Issue date', 'doc_fecha'],
    ['Vencimiento de la factura', 'doc_vencimiento'],
    ['Forma de cobro', 'doc_forma_pago'],
    ['Payment method', 'doc_forma_pago'],
    ['Importe a facturar', 'total_base'],
    ['Neto a pagar', 'total_general'],
    ['IVA repercutido', 'total_iva'],
    ['Descuento aplicado', 'total_descuento'],
    ['Nº de pedido', 'custom_1'],
    ['Order number', 'custom_1'],
    ['Nº de bastidor', 'custom_2'],
    ['Vendedor', 'custom_3'],
    ['Método de envío', 'custom_4'],
    ['Fecha de entrega prevista', 'custom_5'],
  ])('reconoce «%s» como %s', (etiqueta, claveEsperada) => {
    const mapa = asignar(etiqueta);
    const encontrado = Object.entries(mapa).find(([k, v]) => k === claveEsperada);
    expect(encontrado).toBeDefined();
  });
});
```

Ajustar el helper `asignar` a la estructura real de `detectar` (el test de la
línea 186 usa `analisis.campos` y `claves(analisis)`). Usar el patrón de la
línea 185.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/plantillas/deteccion.test.ts`
Expected: FAIL (las variantes nuevas no se reconocen aún).

**Step 3: Implement — ampliar `ETIQUETAS`**

Añadir variantes a las reglas existentes (en minúsculas, el normalizador
ignora acentos y mayúsculas). Concretamente:

- `doc_numero`: `numero de factura`, `no de factura`, `invoice number`, `invoice no`.
- `doc_fecha`: `fecha de la factura`, `fecha factura`, `issue date`, `fecha de emision de la factura`.
- `doc_vencimiento`: `vencimiento de la factura`, `pago vence`, `pago vence el`.
- `doc_forma_pago`: `forma de cobro`, `metodo de cobro`, `payment method`.
- `doc_estado`: `estado del documento`.
- `doc_serie`: `serie del documento`.
- `total_base`: `importe a facturar`, `base iva`.
- `total_general`: `total a cobrar`, `neto a pagar`, `total con iva`.
- `total_iva`: `cuota iva`, `iva repercutido`, `iva soportado`, `impuestos`.
- `total_descuento`: `descuento aplicado`, `% dto`.
- `custom_1`: `nº de pedido`, `referencia del pedido`, `referencia pedido`, `order number`, `purchase order`.
- `custom_2`: `nº de bastidor`, `n.º bastidor`, `vin`.
- `custom_3`: `vendedor`, `comercial`.
- `custom_4`: `forma de envio`, `metodo de envio`, `transportista`.
- `custom_5`: `fecha de entrega prevista`, `entrega estimada`.
- `verifactu_observaciones`: `observaciones de la factura`.

Cada regla se amplía dentro de su propio `(?:...)` en la regex, sin cambiar el
`clave` ni la `prioridad`, y verificando que ninguna variante nueva sea
capturada antes por otra regla (revisar el orden de la lista).

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/plantillas/deteccion.test.ts`
Expected: PASS (todos, incluidos los previos).

**Step 5: Commit**

```bash
git add src/lib/plantillas/deteccion.ts src/lib/plantillas/deteccion.test.ts
git commit -m "feat(plantillas): ampliar diccionarios de detección (inglés y variantes)"
```

---

### Task 9: Parche infalible de pdfme

**Files:**
- Create: `scripts/parchear-pdfme.mjs`
- Modify: `package.json` (hooks `postinstall`, `predev`, `prebuild`, `prevercel-build`)

**Step 1: Verificar el código actual de pdfme**

Run: `node -e "const s=require('fs').readFileSync('node_modules/@pdfme/common/dist/index.js','utf8'); const i=s.indexOf('placeUnitsOnPages'); console.log(s.slice(i-50, i+400))"`
Expected: ver `placeUnitsOnPages` y la línea `if (currentYInPage < 0) currentYInPage = 0;`.

**Step 2: Escribir el script**

```js
/**
 * Parchea @pdfme/common para que el repaginador nunca apunte a una página
 * negativa. Cuando una plantilla tiene un campo por debajo del pie de la
 * página (o la altura de la tabla recortada deja los totales a una Y que
 * cae en la página anterior), `placeUnitsOnPages` calcula
 * `currentPageIndex = floor(startGlobalY / contentHeight)` y ese índice
 * puede ser -1; al hacer `pages[-1].push(...)` pdfme revienta con
 * "Cannot read properties of undefined (reading 'push')". El guard evita
 * que ese índice baje de 0.
 *
 * La tabla adaptativa de `plantilla.ts` evita el caso real; esto es la red
 * de seguridad para plantillas editadas a mano.
 *
 * Idempotente: si el guard ya está, no toca nada.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichero = join(raiz, 'node_modules', '@pdfme', 'common', 'dist', 'index.js');
const GUARD = 'if (currentPageIndex < 0) currentPageIndex = 0;';

try {
  const codigo = readFileSync(fichero, 'utf8');
  if (codigo.includes(GUARD)) {
    console.log('[pdfme] Ya está parcheado; se omite.');
    process.exit(0);
  }
  const objetivo = 'if (currentYInPage < 0) currentYInPage = 0;';
  if (!codigo.includes(objetivo)) {
    console.error('[pdfme] No se encuentra el punto de anclaje; revisa la versión del paquete.');
    process.exit(1);
  }
  writeFileSync(fichero, codigo.replace(objetivo, `${objetivo}\n\t${GUARD}`));
  console.log('[pdfme] Guard de página negativa añadido.');
} catch (err) {
  // En un postinstall con dependencias a medio instalar puede no existir.
  console.warn('[pdfme] No se pudo parchear; se omite.', err.message);
  process.exit(0);
}
```

**Step 3: Probar el script**

Run: `node scripts/parchear-pdfme.mjs`
Expected: `[pdfme] Guard de página negativa añadido.` — y al repetirlo:
`Ya está parcheado; se omite.`

**Step 4: Enlazar los hooks**

En `package.json`:

```json
"postinstall": "node scripts/copiar-worker-pdfjs.mjs && node scripts/parchear-pdfme.mjs",
"predev": "node scripts/copiar-worker-pdfjs.mjs && node scripts/parchear-pdfme.mjs",
"prebuild": "node scripts/copiar-worker-pdfjs.mjs && node scripts/parchear-pdfme.mjs",
"prevercel-build": "node scripts/copiar-worker-pdfjs.mjs && node scripts/parchear-pdfme.mjs",
```

**Step 5: Verificar con la suite**

Run: `npm run test`
Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/parchear-pdfme.mjs package.json package-lock.json
git commit -m "fix(pdfme): parche postinstall contra páginas negativas en el repaginador"
```

---

### Task 10: Suite completa, cambios.md y cierre

**Files:**
- Modify: `cambios.md`

**Step 1: Suite completa**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: todo PASS.

**Step 2: Registrar en `cambios.md`**

Bajo `## 2026-08-13`, sección `### Plantillas`:

```md
- La tabla se ajusta al contenido real: encoge con pocas líneas, crece con
  muchas, y los totales nunca se salen de la página (antes, con pocas
  líneas, pdfme podía fallar al repaginar).
- Campos manuales de la plantilla (nº de pedido, matrícula, agente, envío,
  fecha de entrega): si la plantilla activa los usa, el formulario de
  factura los muestra para rellenarlos y se guardan con la factura.
- La detección reconoce más variantes (inglés, abreviaturas Nº, "fecha de
  la factura", etc.).
```

**Step 3: Commit**

```bash
git add cambios.md
git commit -m "docs: cambios de plantillas (tabla adaptativa, campos manuales, detección)"
```

**Step 4: Estado final**

Run: `git log --oneline -12`
Expected: los commits de este plan en orden.
