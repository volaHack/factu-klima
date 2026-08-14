# Fase 1 — Documento único (facturación venta+compra) — Plan de implementación

> **For Claude:** REQUIRED SUB-SKILL: Usa la skill `ejecutar-planes` para implementar este plan tarea a tarea.
> Antes de tocar cualquier componente de Next.js, lee la guía correspondiente en `node_modules/next/dist/docs/` (AGENTS.md: esta versión de Next 16 tiene breaking changes).

**Goal:** Convertir el sistema actual (factura + albarán como tipos separados) en un único motor de documento que soporte `presupuesto → pedido → albarán → factura → rectificativa` en sentido venta y compra, con numeración por tipo y serie por vendedor, sin romper el sellado Verifactu existente.

**Architecture:** La tabla física `invoices` pasa a ser el documento canónico (columna `tipo` + `sentido`). Los triggers antifraude se guardan por `tipo`/`sentido` (solo sellan factura/rectificativa de venta). Presupuesto/pedido reutilizan toda la tubería (líneas, desglose, numeración, plantilla, doble escritura IDB+Supabase+cola) sin descontar stock. Un componente compartido de líneas y otro de totales eliminan la duplicación actual (×3 `recalcLines`, ×3 bloques JSX). La compra es el mismo motor con `sentido='compra'` (suma stock al albarán de compra). Serie por vendedor: el documento toma la serie del vendedor asignado al cliente.

**Tech Stack:** Next.js 16 (client components), React 19, pdfme 6.1.12 (plantillas), IndexedDB nativo + Supabase (offline-first dual-write + cola de sync), vitest 4 (env `node`, tests co-locados en `src/lib/*.test.ts`), Postgres + triggers plpgsql (sellado). ESLint 9 flat config.

**Regla de oro (por qué esto no es un clon de 2M líneas):** cada tipo de documento es un *config* (tipo + estados + regla de stock + serie), no una clase ni un módulo de persistencia nuevo. `tipo` y `sentido` son columnas, no tablas.

---

## Decisiones de diseño (acordadas con el usuario)

- La entidad se llama conceptualmente *documento*; la tabla física **seguirá llamándose `invoices`** para no reescribir sync/RLS/triggers de una vez. `mapInvoiceFromDb`/`buildInvRow` pasan a tratar `tipo`/`sentido`.
- **Sellado Verifactu** solo para `tipo IN ('factura','rectificativa') AND sentido='venta'`. Presupuesto, pedido, albarán y toda la compra **nunca se sellan** y son editables/borrables en los estados permitidos.
- **Stock**: hoy solo `expedirAlbaran` (venta) descuenta; `issueInvoice` no toca stock. Regla: presupuesto/pedido **no** tocan stock (ya se cumple); albarán de compra **suma** stock; albarán de venta sigue descontando. (La gestión de stock por almacén es Fase 2.)
- **Numeración**: series distintas por `(tipo, sentido)` para que `uq_invoices_user_series_number` no colisione. Se guardan en un único JSONB `series_documentos` de `company_settings` (evita explotar de columnas; el sync ya transporta la fila completa de settings).
- **Compartir UI**: crear `LineasDocumento` y `TotalesDocumento` (extraídos de `facturas/nueva`), y `src/lib/documentos.ts` con la lógica de línea/totales/serie/estado inicial. Elimina la duplicación ×3.
- Migración SQL: `supabase/migration_018_tipo_documento.sql` (una sola migración para toda la Fase 1).

---

## Configuración previa a leer (obligatorio antes de empezar)

- `node_modules/next/dist/docs/` — guías de Next 16 (router, server/client components).
- `src/lib/types.ts` — interfaces `Invoice`, `InvoiceLineItem`, `CompanySettings`, enums de estado.
- `src/lib/storage.ts` — `saveInvoice` (L257), `issueInvoice` (L375), `nextFreeInvoiceNumber` (L224), `SEALED_STATUSES` (L208), `isSealed` (L216), `mapInvoiceFromDb` (L2158), `buildInvRow` (L267), `expedirAlbaran` (L1230), `convertirAlbaranesAFactura` (L1282).
- `src/lib/utils.ts` — `generateInvoiceNumber` (L53), `sequenceFromNumber` (L63), `calculateInvoiceTotals` (L91), `calculateLineSubtotal` (L71).
- `src/lib/constants.ts` — `DEFAULT_COMPANY_SETTINGS` (L276).
- `src/lib/offlineDb.ts` — stores IDB (v4), `SyncTable` (L11).
- `src/lib/syncEngine.ts` — `CHILD_TABLES` (L135), `syncInvoiceGroup` (L180).
- `supabase/migration_002_antifraude.sql` — funciones trigger (seal L187, immutable L323, no_delete L405, line_items_guard L439, recalc L472, tax_breakdown_guard L516).
- `supabase/migration_011_tpv_offline_ia_modes.sql` — `fn_invoice_offline_renumber`.
- `src/app/(app)/facturas/nueva/page.tsx`, `src/app/(app)/albaranes/nueva/page.tsx` — formularios a refactorizar.
- `src/lib/plantillas/datos.ts` (`DocumentoImprimible` L20) y `src/components/plantillas/BotonDescargarPdf.tsx` — integración de plantilla.
- `src/components/layout/Sidebar.tsx` — navegación.

**Verificación base (debe estar verde antes de tocar nada):**
```bash
npm test   # 170 passed (21 files)
npx tsc --noEmit
npm run lint
```
Nota: `analisis.ts:117-118` tiene 2 warnings `prefer-const` PREEXISTENTES (no tocarlos).

---

## Etapa 1 — Modelo de documento único

### Task 1.1: Tipos — `tipo`, `sentido`, `origen` y series por tipo

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/constants.ts`

**Step 1:** Añadir a `src/lib/types.ts` (junto a los enums, tras `InvoiceStatus`):

```ts
export type TipoDocumento = 'presupuesto' | 'pedido' | 'albaran' | 'factura' | 'rectificativa';
export type SentidoDocumento = 'venta' | 'compra';

export interface SerieDocumento {
  serie: string;
  nextNumber: number;
}
```

**Step 2:** Añadir al final de la interfaz `Invoice`:

```ts
  /** Tipo de documento. Por defecto 'factura' (compatibilidad con los existentes). */
  tipo?: TipoDocumento;
  /** Venta o compra. Por defecto 'venta'. */
  sentido?: SentidoDocumento;
  /** Documento que da origen a este (presupuesto→pedido→albarán→factura). */
  documentoOrigenId?: string;
  documentoOrigenNumber?: string;
  /** Vendedor asignado (decide la serie, Fase 1 Etapa 4). */
  vendedorId?: string;
```

**Step 3:** Añadir a `CompanySettings`:

```ts
  /** Series y contadores por (tipo, sentido). Clave: `${tipo}_${sentido}`. */
  seriesDocumentos?: Record<string, SerieDocumento>;
```

**Step 4:** En `src/lib/constants.ts`, junto a `DEFAULT_COMPANY_SETTINGS`, añadir la serie por defecto por tipo (valores de Canarias, coherentes con `igicEnabled`): 

```ts
export const DEFAULT_SERIES_DOCUMENTOS: Record<string, { serie: string; nextNumber: number }> = {
  presupuesto_venta: { serie: 'PRE', nextNumber: 1 },
  pedido_venta: { serie: 'PED', nextNumber: 1 },
  albaran_venta: { serie: 'ALB', nextNumber: 1 },
  factura_venta: { serie: 'FAC', nextNumber: 1 },
  rectificativa_venta: { serie: 'FCR', nextNumber: 1 },
  pedido_compra: { serie: 'PEDC', nextNumber: 1 },
  albaran_compra: { serie: 'ALBC', nextNumber: 1 },
  factura_compra: { serie: 'FACC', nextNumber: 1 },
  rectificativa_compra: { serie: 'FCRC', nextNumber: 1 },
};
```
Y en `DEFAULT_COMPANY_SETTINGS`:
```ts
  seriesDocumentos: { ...DEFAULT_SERIES_DOCUMENTOS },
```

**Step 5:** Prueba rápida (migración de datos no requiere test todavía):
```bash
npx tsc --noEmit   # sin errores
```

**Step 6:** Commit
```bash
git add src/lib/types.ts src/lib/constants.ts
git commit -m "feat(documentos): tipo, sentido y series por tipo en el modelo de datos"
```

### Task 1.2: Migración SQL — columna `tipo`/`sentido` + guardas en triggers

**Files:**
- Create: `supabase/migration_018_tipo_documento.sql`

**Step 1:** Crear la migración:

```sql
-- ============================================================
-- 018 - Documento único: tipo y sentido en `invoices`
-- Los triggers antifraude solo sellan factura/rectificativa de VENTA.
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'factura',
  ADD COLUMN IF NOT EXISTS sentido text NOT NULL DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS documento_origen_id uuid,
  ADD COLUMN IF NOT EXISTS documento_origen_number text,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_tipo CHECK (tipo IN ('presupuesto','pedido','albaran','factura','rectificativa')),
  ADD CONSTRAINT chk_invoices_sentido CHECK (sentido IN ('venta','compra'));

-- company_settings: series y contadores por (tipo, sentido) en JSONB
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS series_documentos jsonb NOT NULL DEFAULT '{}'::jsonb;
```

**Step 2:** Añadir la guarda al inicio de `fn_invoice_seal` (después de `BEGIN`). El trigger ahora debe ignorar presupuesto/pedido/albarán y toda compra:

```sql
CREATE OR REPLACE FUNCTION public.fn_invoice_seal()
RETURNS TRIGGER ... (copiar el cuerpo actual completo de migration_002 L187-315)
```
> Sustituir el cuerpo por el mismo pero con este bloque justo tras `BEGIN`:
```sql
  -- Los documentos previos a factura y toda la compra NO se sellan.
  IF COALESCE(NEW.tipo, 'factura') NOT IN ('factura', 'rectificativa')
     OR COALESCE(NEW.sentido, 'venta') <> 'venta' THEN
    NEW.record_hash := NULL;
    NEW.prev_hash   := NULL;
    NEW.chain_index := NULL;
    NEW.sealed_at   := NULL;
    NEW.verifactu_hash             := NULL;
    NEW.verifactu_timestamp        := NULL;
    NEW.verifactu_signature_status := 'PENDING';
    RETURN NEW;
  END IF;
```
> Copia el resto del cuerpo sin cambios (respetando `SET search_path = ''` y `SECURITY DEFINER`).

**Step 3:** Mismo tratamiento en `fn_invoice_immutable` (L323) y `fn_invoice_no_delete` (L405): añadir al inicio (tras `BEGIN`) la misma guarda de tipo/sentido con `RETURN NEW;` (inmutabilidad y antiborrado solo para sellables). En `fn_invoice_immutable` la guarda debe ser idéntica a la de arriba.

**Step 4:** En `fn_invoice_offline_renumber` (migration_011) añadir la misma guarda (`RETURN NEW;` si no es factura/rectificativa de venta).

**Step 5:** `fn_recalc_invoice_totals`, `fn_line_items_guard`, `fn_tax_breakdown_guard` NO se tocan: recalculan/validan líneas para todo tipo de documento.

**Step 6:** Aplicar en local si hay stack local o anotar para el entorno remoto. Comando de verificación cuando se aplique (local):
```bash
npx supabase db push 2>&1 | Select-String "migration_018"
```
> Si no hay proyecto local: la migración se aplica con `apply_migration` de Supabase en el proyecto remoto, y se verifica con `list_tables` (columna `tipo` en `invoices`).

**Step 7:** Commit
```bash
git add supabase/migration_018_tipo_documento.sql
git commit -m "feat(doc): tipo y sentido en invoices; triggers antifraude solo para factura/rectificativa de venta"
```

### Task 1.3: Storage — normalizar tipo/sentido y numeración por tipo

**Files:**
- Modify: `src/lib/storage.ts`

**Step 1:** Añadir helpers (junto a `SEALED_STATUSES` L208):

```ts
export function tipoDocumento(doc: { tipo?: TipoDocumento }): TipoDocumento {
  return doc.tipo ?? 'factura';
}
export function sentidoDocumento(doc: { sentido?: SentidoDocumento }): SentidoDocumento {
  return doc.sentido ?? 'venta';
}
/** true si el documento es sellable fiscalmente (factura/rectificativa de venta). */
export function esSellable(doc: { tipo?: TipoDocumento; sentido?: SentidoDocumento }): boolean {
  const t = tipoDocumento(doc);
  const s = sentidoDocumento(doc);
  return (t === 'factura' || t === 'rectificativa') && s === 'venta';
}
```
Ajustar `isSealed`:
```ts
export function isSealed(invoice: Pick<Invoice, 'status' | 'tipo' | 'sentido'>): boolean {
  return esSellable(invoice) && SEALED_STATUSES.includes(invoice.status);
}
```
Ajustar `SEALED_STATUSES` — sin cambios de valores (siguen siendo los 5).

**Step 2:** Nueva serie por tipo — añadir (junto a `generateInvoiceNumber` import, imports ya presentes):

```ts
function serieDeTipo(settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento): SerieDocumento {
  const config = settings.seriesDocumentos?.[`${tipo}_${sentido}`];
  if (config && config.serie) return config;
  const porDefecto = DEFAULT_SERIES_DOCUMENTOS[`${tipo}_${sentido}`];
  return porDefecto ?? { serie: 'DOC', nextNumber: 1 };
}
```
Importar `DEFAULT_SERIES_DOCUMENTOS` y los nuevos tipos en storage.ts.

**Step 3:** `buildInvRow` (L267) — añadir al objeto:
```ts
    tipo: inv.tipo ?? 'factura',
    sentido: inv.sentido ?? 'venta',
    documento_origen_id: inv.documentoOrigenId ?? null,
    documento_origen_number: inv.documentoOrigenNumber ?? null,
    vendedor_id: inv.vendedorId ?? null,
```

**Step 4:** `mapInvoiceFromDb` (L2158) — añadir al objeto devuelto:
```ts
    tipo: (a.tipo as TipoDocumento) ?? 'factura',
    sentido: (a.sentido as SentidoDocumento) ?? 'venta',
    documentoOrigenId: a.documento_origen_id ?? undefined,
    documentoOrigenNumber: a.documento_origen_number ?? undefined,
    vendedorId: a.vendedor_id ?? undefined,
```

**Step 5:** `issueInvoice` (L375) — lanzar si el documento no es sellable:
```ts
  if (!esSellable(invoice)) {
    throw new Error('Solo las facturas y rectificativas de venta se sellan. Usa guardarDocumento para el resto.');
  }
```

**Step 6:** Test — crear `src/lib/documentos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { esSellable, tipoDocumento } from './storage';

describe('esSellable', () => {
  it('factura de venta sellable', () => expect(esSellable({ tipo: 'factura', sentido: 'venta' })).toBe(true));
  it('rectificativa de venta sellable', () => expect(esSellable({ tipo: 'rectificativa', sentido: 'venta' })).toBe(true));
  it('presupuesto no sellable', () => expect(esSellable({ tipo: 'presupuesto' })).toBe(false));
  it('pedido no sellable', () => expect(esSellable({ tipo: 'pedido' })).toBe(false));
  it('albarán no sellable', () => expect(esSellable({ tipo: 'albaran' })).toBe(false));
  it('compra no sellable aunque sea factura', () => expect(esSellable({ tipo: 'factura', sentido: 'compra' })).toBe(false));
  it('por defecto es factura de venta', () => expect(esSellable({})).toBe(true));
  it('tipoDocumento por defecto factura', () => expect(tipoDocumento({})).toBe('factura'));
});
```

**Step 7:** Verificar:
```bash
npx vitest run src/lib/documentos.test.ts   # 8 passed
npx tsc --noEmit
```

**Step 8:** Commit
```bash
git add src/lib/storage.ts src/lib/documentos.test.ts
git commit -m "feat(doc): normalizar tipo/sentido en storage; sellado solo para factura/rectificativa de venta"
```

### Task 1.4: Compartir la lógica de documento — `src/lib/documentos.ts`

**Files:**
- Create: `src/lib/documentos.ts`

**Step 1:** Crear el módulo con la lógica que hoy está duplicada (×3):

```ts
// Lógica compartida de documentos (factura, presupuesto, pedido, albarán…).
import {
  InvoiceLineItem, InvoiceStatus, CompanySettings, TipoDocumento, SentidoDocumento,
} from './types';
import { generateInvoiceNumber, calculateLineSubtotal, calculateLineTax } from './utils';
import { serieDeTipo } from './storage';

export interface TotalesDocumento { subtotal: number; totalDiscount: number; totalTax: number; total: number; }

export function lineaVacia(settings: CompanySettings): InvoiceLineItem {
  const tasa = settings.igicEnabled ? (settings.igicRates?.[0] ?? 7) : (settings.ivaRates?.[0] ?? 21);
  return {
    id: crypto.randomUUID(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: 'ud',
    taxRate: tasa,
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

/** Recalcula una línea (la fórmula duplicada en facturas/nueva, editar y albaranes/nueva). */
export function recalcularLinea(line: InvoiceLineItem): InvoiceLineItem {
  const subtotal = calculateLineSubtotal(line.quantity, line.unitPrice, line.discountPercent);
  const taxAmount = calculateLineTax(subtotal, line.taxRate);
  return { ...line, subtotal, taxAmount, total: Number((subtotal + taxAmount).toFixed(2)) };
}

/** Número y serie para un documento nuevo de un tipo/sentido. */
export function numeroDeDocumento(
  settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento,
): { series: string; number: string; nextNumber: number } {
  const { serie, nextNumber } = serieDeTipo(settings, tipo, sentido);
  return { series: serie, number: generateInvoiceNumber(serie, nextNumber), nextNumber };
}

/** Estado inicial por tipo (mapeo tipo → estados permitidos). */
export const ESTADOS_POR_TIPO: Record<TipoDocumento, readonly InvoiceStatus[]> = {
  presupuesto: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  pedido: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  albaran: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  factura: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA, InvoiceStatus.ANULADA],
  rectificativa: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
};

export function etiquetaTipo(tipo: TipoDocumento): string {
  const etiquetas: Record<TipoDocumento, string> = {
    presupuesto: 'Presupuesto', pedido: 'Pedido', albaran: 'Albarán',
    factura: 'Factura', rectificativa: 'Factura rectificativa',
  };
  return etiquetas[tipo];
}

export function numeroOrigen(doc: { tipo?: TipoDocumento; documentoOrigenNumber?: string }): string {
  if (!doc.documentoOrigenNumber) return '';
  return `${etiquetaTipo(doc.tipo ?? 'factura')} ${doc.documentoOrigenNumber}`;
}
```

**Step 2:** Verificar:
```bash
npx tsc --noEmit
```

**Step 3:** Commit
```bash
git add src/lib/documentos.ts
git commit -m "feat(doc): logica compartida de documentos (linea, numeracion por tipo, estados)"
```

**Etapa 1 terminada.** Comprobación global:
```bash
npm test   # 178 passed aprox.
npx tsc --noEmit
```

---

## Etapa 2 — Presupuesto y pedido de venta

### Task 2.1: Componentes compartidos de UI (líneas y totales)

**Files:**
- Create: `src/components/documentos/LineasDocumento.tsx`
- Create: `src/components/documentos/TotalesDocumento.tsx`
- Modify: `src/app/(app)/facturas/nueva/page.tsx` (usar los componentes)
- Modify: `src/app/(app)/facturas/[id]/editar/page.tsx`
- Modify: `src/app/(app)/albaranes/nueva/page.tsx`

**Step 1:** Crear `LineasDocumento.tsx` — extraer la tabla de líneas de `facturas/nueva/page.tsx` (líneas L413-495): misma UI (selector de producto, cantidad, precio, descuento, impuesto, columnas custom, botón añadir/borrar) pero recibiendo props `lineItems`, `onChange(lines)` y `settings`. Cada cambio de campo llama a `recalcularLinea` de `documentos.ts`.

```tsx
'use client';
import { InvoiceLineItem, CompanySettings } from '@/lib/types';
import { recalcularLinea } from '@/lib/documentos';

interface Props {
  lineItems: InvoiceLineItem[];
  onChange: (lines: InvoiceLineItem[]) => void;
  settings: CompanySettings;
}
export default function LineasDocumento({ lineItems, onChange, settings }: Props) {
  // Copiar la estructura de fila/cabecera de facturas/nueva L413-495,
  // con onField por campo que actualiza solo la línea tocada:
  //   const actualiza = (id: string, patch: Partial<InvoiceLineItem>) =>
  //     onChange(lineItems.map(l => (l.id === id ? recalcularLinea({ ...l, ...patch }) : l)));
  // El botón "Añadir línea" hace onChange([...lineItems, lineaVacia(settings)]).
}
```

**Step 2:** Crear `TotalesDocumento.tsx` — extraer el bloque de totales de `facturas/nueva` L501-524 (base, descuento, desglose por impuesto, TOTAL), recibiendo `subtotal`, `totalDiscount`, `taxBreakdown`, `total` y `tipo` (para la etiqueta del documento).

```tsx
'use client';
import { TaxBreakdown } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface Props { subtotal: number; totalDiscount: number; taxBreakdown: TaxBreakdown[]; totalTax: number; total: number; etiqueta: string; }
export default function TotalesDocumento(props: Props) { /* JSX copiado de facturas/nueva L501-524 */ }
```

**Step 3:** Refactorizar las 3 páginas para usar los componentes y borrar el `recalcLines` local (ahora `recalcularLinea`). Verificación visual: crear/editar factura y albarán siguen igual.

```bash
npm test && npx tsc --noEmit && npm run lint
```

**Step 4:** Commit
```bash
git add src/components/documentos src/app/"(app)"/facturas src/app/"(app)"/albaranes/nueva/page.tsx
git commit -m "refactor(doc): componentes compartidos de lineas y totales (elimina duplicacion x3)"
```

### Task 2.2: `saveDocumento` — guardado genérico sin sellado

**Files:**
- Modify: `src/lib/storage.ts`

**Step 1:** Añadir (reutiliza `saveInvoice` sin sellar):

```ts
/** Guarda cualquier documento no fiscal (presupuesto, pedido, albarán) o una factura/rectificativa borrador. */
export async function saveDocumento(doc: Invoice): Promise<Invoice> {
  if (esSellable(doc) && isSealed(doc)) {
    throw new Error(`El documento ${doc.number} ya está sellado. No se puede modificar.`);
  }
  return saveInvoice(doc);
}
```

**Step 2:** Test en `src/lib/documentos.test.ts` (añadir al final):

```ts
describe('saveDocumento', () => {
  it('rechaza modificar un documento ya sellado', async () => {
    const { saveDocumento } = await import('./storage');
    await expect(saveDocumento({ status: 'pagada', tipo: 'factura', sentido: 'venta' } as never))
      .rejects.toThrow(/sellado/);
  });
});
```

**Step 3:** Verificar:
```bash
npx vitest run src/lib/documentos.test.ts && npx tsc --noEmit
```

**Step 4:** Commit
```bash
git add src/lib/storage.ts src/lib/documentos.test.ts
git commit -m "feat(doc): saveDocumento generico para documentos no fiscales"
```

### Task 2.3: Página `/documentos` — listado filtrable por tipo y sentido

**Files:**
- Create: `src/app/(app)/documentos/page.tsx`

**Step 1:** Listado que lee `getInvoices()`, filtra por `tipo` (query param `?tipo=presupuesto`) y muestra número, fecha, cliente/proveedor, total, estado y enlaces a detalle. Con CTA «Nuevo presupuesto» / «Nuevo pedido» que enlaza a `/documentos/nuevo?tipo=...`. Reutiliza la estética de `facturas/page.tsx` (buscar + tabla).

**Step 2:** Verificación manual: `npm run dev`, abrir `/documentos`, ver listado vacío con filtros.

**Step 3:** Commit
```bash
git add src/app/"(app)"/documentos/page.tsx
git commit -m "feat(doc): listado de documentos con filtro por tipo"
```

### Task 2.4: Página `/documentos/nuevo` — formulario genérico

**Files:**
- Create: `src/app/(app)/documentos/nuevo/page.tsx`

**Step 1:** Formulario que adapta `facturas/nueva/page.tsx` reutilizando `LineasDocumento`, `TotalesDocumento` y los helpers de `documentos.ts`:

- Lee `tipo` del query param (`'presupuesto' | 'pedido'`; por defecto `'presupuesto'`). **No** admite `factura` (esa ruta sigue siendo `/facturas/nueva`).
- Carga `getClients()`, `getProducts()`, `getCompanySettings()`, plantilla activa (`getPlantillaActiva('factura')` para reutilizar el contrato de campos; el tipo nuevo se añade en la Task 2.5).
- `handleSave`:
  ```ts
  const { series, number, nextNumber } = numeroDeDocumento(settings, tipo, 'venta');
  const documento: Invoice = { /* como en facturas/nueva pero sin dueDate ni paymentMethod para presupuesto */
    tipo, sentido: 'venta', id: generateId(), number, series,
    clientId, clientName, clientNif, clientAddress,
    issueDate, status: InvoiceStatus.BORRADOR,
    lineItems, ...calculateInvoiceTotals(lineItems),
    notes, datosExtras, createdAt, updatedAt,
  };
  const guardado = await saveDocumento(documento);
  await actualizarContadorSerie(settings, `${tipo}_venta`, guardado.number);
  ```
  Donde `actualizarContadorSerie` (en `documentos.ts` o inline) hace `settings.seriesDocumentos[clave].nextNumber = sequenceFromNumber(number) + 1; await saveCompanySettings(settings);`.
- Botón «Emitir»: `saveDocumento({ ...documento, status: InvoiceStatus.EMITIDA })` (presupuesto/pedido **no** pasan por `issueInvoice`, no se sellan).
- Si `tipo === 'pedido'`: mostrar `dueDate` y `paymentMethod` (como factura) y botón «Enviar para aprobación» que llama a `createOrderApproval` (flujo PRE_APROBACION ya existente).
- **Stock**: ninguna acción de este formulario llama a `adjustStock`.

**Step 2:** Verificación manual con datos reales: crear presupuesto y pedido; confirmar que NO descuentan stock (`productos` no cambia `stockQuantity`) y que aparecen en `/documentos`.

**Step 3:** Commit
```bash
git add src/app/"(app)"/documentos/nuevo/page.tsx
git commit -m "feat(doc): creacion de presupuesto y pedido sin descuento de stock"
```

### Task 2.5: Detalle, edición, conversión y plantilla

**Files:**
- Create: `src/app/(app)/documentos/[id]/page.tsx`
- Create: `src/app/(app)/documentos/[id]/editar/page.tsx`
- Modify: `src/lib/plantillas/datos.ts`
- Modify: `src/components/plantillas/BotonDescargarPdf.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1:** Detalle (`documentos/[id]/page.tsx`): reutilizar la estructura de `facturas/[id]/page.tsx` pero con acciones por estado/tipo:
- Presupuesto: anular (guardar `ANULADA`), **«Convertir a pedido»**: crea copia con `tipo:'pedido'`, `documentoOrigenId: id` y número de la serie PED; borrador; redirige al nuevo.
- Pedido: **«Convertir a albarán»**: crea copia `tipo:'albaran'`, `documentoOrigenId` encadenado; borrador; redirige al detalle del albarán.
- Pedido: «Convertir a factura» directo (opcional): crea factura borrador (para pedidos aprobados), mismo encadenado.
- El botón «Imprimir» usa `BotonDescargarPdf` con el tipo del documento.

Helper de conversión en `documentos.ts`:

```ts
export function documentoConvertido(original: Invoice, nuevoTipo: TipoDocumento, settings: CompanySettings): Invoice {
  const { series, number, nextNumber } = numeroDeDocumento(settings, nuevoTipo, original.sentido ?? 'venta');
  const now = new Date().toISOString();
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: nuevoTipo,
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.documentoOrigenId ?? original.id,
    documentoOrigenNumber: original.documentoOrigenNumber ?? original.number,
    createdAt: now,
    updatedAt: now,
  };
}
```

**Step 2:** `datos.ts` — ampliar `DocumentoImprimible`:
```ts
export type DocumentoImprimible =
  | { tipo: 'factura'; documento: Invoice }
  | { tipo: 'albaran'; documento: Albaran }
  | { tipo: 'presupuesto'; documento: Invoice }
  | { tipo: 'pedido'; documento: Invoice }
  | { tipo: 'rectificativa'; documento: Invoice };
```
En `construirDatos`, derivar `doc_tipo`/`doc_titulo` desde `documento.tipo` (con `etiquetaTipo`) en vez de hardcodear. Los campos `doc_vencimiento`, `doc_forma_pago` ya están condicionados; para presupuesto se ocultan (como albarán) — añadir presupuesto/pedido a esa condición. `BotonDescargarPdf`: `getPlantillaActiva` acepta `tipo: 'presupuesto' | 'pedido' | 'albaran' | 'factura' | 'rectificativa'`; si no hay plantilla activa para ese tipo, cae a la de `'factura'` (el contrato de campos es el mismo). Ver `almacen.ts:168` (`getPlantillaActiva`).

**Step 3:** `Sidebar.tsx` — añadir a "Gestión operativa":
```tsx
<NavLink href="/documentos" icon={<FileStack />}>Documentos</NavLink>
```

**Step 4:** Verificación:
- Convertir presupuesto→pedido→albarán y comprobar que cada documento hereda el origen (columna `documento_origen_number` visible en detalle).
- Imprimir un presupuesto: el PDF dice «PRESUPUESTO» y no muestra vencimiento/forma de pago.
- `npm test && npx tsc --noEmit`.

**Step 5:** Commit
```bash
git add src/lib/documentos.ts src/app/"(app)"/documentos src/lib/plantillas/datos.ts src/components/plantillas/BotonDescargarPdf.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(doc): detalle, edicion, conversion presupuesto->pedido->albaran y plantilla por tipo"
```

**Etapa 2 terminada.** Comprobación:
```bash
npm test   # suite completa verde
```

---

## Etapa 3 — Proveedores y compras

### Task 3.1: Entidad Proveedor (reutiliza `clients`)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/app/(app)/clientes/page.tsx` y `clientes/[id]/page.tsx`

**Step 1:** En `Client`, añadir:
```ts
  /** true = la ficha es un proveedor (compras). */
  esProveedor?: boolean;
```
Los proveedores **no** tienen `paymentDays` obligatorio; `defaultPaymentMethod` sigue aplicando a pagos.

**Step 2:** En storage.ts, helpers de filtrado:
```ts
export function getClientes(): Promise<Client[]> { return getClients(); }                       // alias
export async function getProveedores(): Promise<Client[]> {
  const clients = await getClients();
  return clients.filter(c => c.esProveedor);
}
```
Actualizar `saveClient`/`deleteClient` para no romper nada (ya persistirían `es_proveedor` si se añade a la columna; añadir `es_proveedor` a `buildClientRow`/`mapClientFromDb`).

**Step 3:** Migración añadir a `migration_018_tipo_documento.sql` (antes de aplicarla):
```sql
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS es_proveedor boolean NOT NULL DEFAULT false;
```

**Step 4:** UI — en la ficha de cliente, checkbox «Es proveedor»; en el listado, pestaña/filtro Clientes/Proveedores.

**Step 5:** Verificar:
```bash
npx tsc --noEmit && npm test
```

**Step 6:** Commit
```bash
git add src/lib/types.ts src/lib/storage.ts supabase/migration_018_tipo_documento.sql src/app/"(app)"/clientes
git commit -m "feat(doc): proveedores (ficha de cliente con es_proveedor)"
```

### Task 3.2: Documentos de compra con el mismo motor

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/app/(app)/documentos/nuevo/page.tsx`
- Modify: `src/app/(app)/documentos/[id]/page.tsx`

**Step 1:** `numeroDeDocumento` ya soporta `sentido='compra'` (Task 1.4). En `nuevo/page.tsx` aceptar `?tipo=pedido&sentido=compra`, `?tipo=albaran&sentido=compra`, `?tipo=factura&sentido=compra`, `?tipo=rectificativa&sentido=compra`:
- La lista de contraparte es `getProveedores()` cuando `sentido='compra'`.
- Campos del documento compra: iguales (fecha, líneas, descuentos) sin sellado.
- Etiquetas: «Pedido a proveedor», «Albarán de compra», «Factura de compra», «Rectificativa de compra» (usar `etiquetaTipo` + sufijo).

**Step 2:** Stock en compra — `albaran` compra SUMA stock al expedir. En el detalle, acción «Expedir albarán de compra»:
```ts
const { expedirAlbaranCompra } = await import('@/lib/storage');
// en storage.ts:
export async function expedirAlbaranCompra(id: string): Promise<Invoice> {
  const doc = await getInvoiceById(id);
  if (!doc) throw new Error('Documento no encontrado.');
  if (doc.sentido !== 'compra' || doc.tipo !== 'albaran') throw new Error('No es un albarán de compra.');
  if (isSealed(doc)) throw new Error(`El albarán ${doc.number} ya está expedido.`);
  const updated = await saveDocumento({ ...doc, status: InvoiceStatus.EMITIDA });
  for (const li of doc.lineItems) {
    if (!li.productId || li.quantity <= 0) continue;
    await adjustStock(li.productId, li.quantity);   // SUMA
  }
  return updated;
}
```

**Step 3:** El desglose/estados de compra: `ESTADOS_POR_TIPO` aplica igual (borrador→emitido→anulado). Factura de compra **no** pasa por `issueInvoice` (no se sella): guardar con `saveDocumento` y estado `EMITIDA`.

**Step 4:** Verificación manual: crear proveedor → pedido de compra → convertir a albarán de compra → expedir → comprobar que `stockQuantity` sube. `npm test && npx tsc --noEmit`.

**Step 5:** Commit
```bash
git add src/lib/storage.ts src/app/"(app)"/documentos
git commit -m "feat(doc): compras con el mismo motor (pedido/albaran/factura/rectificativa de compra); el albaran de compra suma stock"
```

### Task 3.3: Rectificativa de venta y de compra

**Files:**
- Modify: `src/app/(app)/facturas/[id]/page.tsx`
- Modify: `src/lib/documentos.ts`

**Step 1:** En el detalle de una factura emitida, botón «Rectificar»:
- Copia la factura con `tipo:'rectificativa'`, `sentido` igual, líneas con importes negativos (`quantity: -li.quantity`, `unitPrice: -li.unitPrice` para base negativa), `documentoOrigenId/Number` apuntando a la original, serie `FCR`/`FCRC`.
- `ESTADOS_POR_TIPO.rectificativa` = borrador → emitida → anulada.
- La rectificativa de venta SÍ se sella (`issueInvoice`), de compra no.
- Recalcular totales con `calculateInvoiceTotals`.

Helper en `documentos.ts`:
```ts
export function rectificar(original: Invoice, settings: CompanySettings): Invoice {
  const { series, number } = numeroDeDocumento(settings, 'rectificativa', original.sentido ?? 'venta');
  const now = new Date().toISOString();
  return {
    ...original,
    id: crypto.randomUUID(), tipo: 'rectificativa', number, series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.id, documentoOrigenNumber: original.number,
    lineItems: original.lineItems.map(li => ({ ...li, id: crypto.randomUUID(), quantity: -Math.abs(li.quantity), unitPrice: -Math.abs(li.unitPrice) })),
    createdAt: now, updatedAt: now,
  };
}
```
(La base se recalcula al guardar vía `saveInvoice`; los triggers recalculan del mismo modo.)

**Step 2:** Verificación: rectificar una factura emitida → FCR-2026-0001 con importe negativo, sellada con huella propia (posición siguiente de cadena). `npm test && npx tsc --noEmit`.

**Step 3:** Commit
```bash
git add src/lib/documentos.ts src/app/"(app)"/facturas/[id]/page.tsx
git commit -m "feat(doc): factura rectificativa (venta sellada, compra sin sellar) con importes negativos"
```

**Etapa 3 terminada.** Comprobación global:
```bash
npm test && npx tsc --noEmit && npm run lint
```

---

## Etapa 4 — Serie por vendedor

### Task 4.1: Entidad Vendedor + almacenamiento

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/offlineDb.ts`
- Modify: `src/lib/syncEngine.ts`
- Modify: `supabase/migration_018_tipo_documento.sql`

**Step 1:** Tipos:
```ts
export interface Vendedor {
  id: string;
  nombre: string;
  activo: boolean;
  /** Serie propia por tipo de documento; si falta, usa la de la empresa. */
  series: Partial<Record<string, string>>; // clave `${tipo}_${sentido}` → serie
  createdAt: string;
  updatedAt: string;
}
```
Y en `Client`: `vendedorId?: string;`.

**Step 2:** Migración (añadir al fichero 018):
```sql
CREATE TABLE IF NOT EXISTS public.vendedores (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  series jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendedores_own ON public.vendedores USING (auth.uid() = user_id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS vendedor_id uuid;
```

**Step 3:** `offlineDb.ts` — store `vendedores` (bump `DB_VERSION` a 5 en `onupgradeneeded`, crear `vendedores` con keyPath `id`) y añadir a `SyncTable`:
```ts
const SyncTable = [ /* ... */ , 'vendedores'] as const;
```

**Step 4:** `syncEngine.ts` — `TABLE_MAP` incluye `vendedores` (mismo nombre), sin child tables.

**Step 5:** `storage.ts` — CRUD:
```ts
export async function getVendedores(): Promise<Vendedor[]> { /* getById/getAll de store 'vendedores' + Supabase, patrón de getClients */ }
export async function saveVendedor(v: Vendedor): Promise<void> { /* patrón de saveClient (IDB + upsert Supabase) */ }
export async function deleteVendedor(id: string): Promise<void> { /* solo si ningún cliente lo referencia; patrón deleteClient */ }
```
Añadir `vendedor_id` a `buildClientRow` y `vendedorId` a `mapClientFromDb`. Añadir `vendedor_id` a `buildInvRow` y `vendedorId` a `mapInvoiceFromDb` (ya en Task 1.3).

**Step 6:** Verificar: `npx tsc --noEmit && npm test`.

**Step 7:** Commit
```bash
git add src/lib/types.ts src/lib/storage.ts src/lib/offlineDb.ts src/lib/syncEngine.ts supabase/migration_018_tipo_documento.sql
git commit -m "feat(doc): entidad vendedor con serie propia por tipo"
```

### Task 4.2: Resolución de serie al crear documento

**Files:**
- Modify: `src/lib/documentos.ts`
- Modify: `src/app/(app)/clientes/page.tsx` y `clientes/[id]/page.tsx`
- Modify: `src/app/(app)/documentos/nuevo/page.tsx` y `src/app/(app)/facturas/nueva/page.tsx`

**Step 1:** Resolver la serie del vendedor (si el cliente tiene uno con serie para ese tipo, esa gana):

```ts
export async function serieParaCliente(
  clientId: string | undefined, tipo: TipoDocumento, sentido: SentidoDocumento,
): Promise<{ serie: string; nextNumber: number } | null> {
  if (!clientId) return null;
  const { getClientById, getVendedores } = await import('./storage');
  const client = await getClientById(clientId);
  if (!client?.vendedorId) return null;
  const vendedores = await getVendedores();
  const vendedor = vendedores.find(v => v.id === client.vendedorId);
  const serie = vendedor?.series?.[`${tipo}_${sentido}`];
  if (!serie) return null;
  // El siguiente número se deriva de la serie: máxima secuencia existente + 1 (consulta a invoices).
  const { getInvoices } = await import('./storage');
  const invoices = await getInvoices();
  const usadas = invoices
    .filter(i => i.series === serie)
    .map(i => Number(i.number.match(/-(\d+)$/)?.[1] ?? 0));
  return { serie, nextNumber: usadas.length ? Math.max(...usadas) + 1 : 1 };
}
```
En `numeroDeDocumento`, aceptar `clientId` y sobreescribir la serie con `serieParaCliente` cuando exista.

**Step 2:** Ficha de cliente: selector de vendedor (desde `getVendedores`) en el modal y en el detalle. Ajustes: pantalla de vendedores con CRUD y la serie propia por tipo (`Ajustes` → sección «Vendedores»). Rutas de ficha: mostrar el vendedor suyo.

**Step 3:** Verificación: crear vendedor con serie `V1`; asignarlo a un cliente; crear factura a ese cliente → número `V1-2026-0001`. Sin vendedor → serie normal.

**Step 4:** Commit
```bash
git add src/lib/documentos.ts src/app/"(app)"/clientes src/app/"(app)"/ajustes src/app/"(app)"/facturas/nueva/page.tsx src/app/"(app)"/documentos/nuevo/page.tsx
git commit -m "feat(doc): serie por vendedor al emitir documentos"
```

**Etapa 4 terminada.**

---

## Verificación final de la Fase 1

```bash
npm test                      # suite completa verde (objetivo: los ~178-185 tests originales + los nuevos)
npx tsc --noEmit
npm run lint                  # solo los 2 prefer-const preexistentes de analisis.ts
npm run build                 # build de producción (Next 16)
```

**Checklist manual (con datos reales):**
1. Crear factura normal → número `FAC-…`, sellada con huella, la cadena `integridad` sigue funcionando.
2. Crear presupuesto → `PRE-…`, imprimible como PRESUPUESTO, **no** descuenta stock.
3. Convertir presupuesto → pedido → albarán (venta) → expedir (descuenta stock) → factura (agrupada o individual).
4. Crear proveedor, pedido de compra → albarán de compra → expedir (SUMA stock) → factura de compra (no sellada).
5. Rectificar una factura emitida → `FCR-…` negativa sellada en la cadena.
6. Vendedor con serie `V1` → el documento toma la serie del vendedor del cliente.
7. Mismas acciones en TPV y plantillas no regresionan (`/plantillas` genera el PDF de muestra).

---

## Orden de ejecución y opciones de lanzamiento

**Plan completo y guardado en `docs/plans/2026-08-14-fase1-documento-unico-implementation.md`.**

Dos opciones de ejecución:

1. **Subagentes (esta sesión)** — la skill `desarrollo-con-subagentes`; un subagente por tarea con review entre tareas.
2. **Sesión paralela** — abrir sesión nueva con la skill `ejecutar-planes`; ejecución por lotes con puntos de revisión por Etapa.

Se recomienda ejecutar por Etapas (cada Etapa es un commit navegable y desplegable por separado; Etapa 1 es prerequisito de las demás). Si se quiere valor antes: ejecutar **Etapa 1 + 2** primero (presupuesto y pedido de venta) y dejar Etapas 3-4 para el siguiente ciclo.
