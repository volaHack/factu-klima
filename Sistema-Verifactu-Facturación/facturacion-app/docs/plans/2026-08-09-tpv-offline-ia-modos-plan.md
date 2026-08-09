# TPV Offline Total + Inventario IA + Modos Restaurante/Supermercado — Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:ejecutar-planes to implement this plan task-by-task.

**Goal:** Que el TPV funcione al 100% sin internet (caja, ventas, devoluciones), añadir un inventario con patrones de consumo (más vendidos arriba), un modo Supermercado (layout denso + venta por peso PLU) y un modo Restaurante (mesas + cuenta abierta).

**Architecture:** Local-first. Toda escritura va primero a IndexedDB y se encola en `syncQueue`; al reconectar, `processSyncQueue` empuja a Supabase. La numeración offline usa un sufijo por dispositivo y el servidor la renumerará (trigger) antes del sellado, sin descartar jamás un ticket. La IA de patrones es client-side sobre los tickets locales (sin servicios externos → funciona offline). Las cuentas de restaurante son una store local de IndexedDB que se convierten en facturas al cobrar.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, IndexedDB nativo, Supabase (Postgres triggers antifraude), vitest, lucide-react.

**Antes de empezar por tarea:**
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: `npm test`
- El IDB de producción ya tiene datos → NO borrar stores al subir `DB_VERSION` (migración no destructiva).

---

## Fase 0 — TPV 100% offline

### Task 1: Módulo de lógica pura `tpvOffline.ts` (TDD)

> **Status:** ✅ Done — commits `45f6bdb` + `a79d37c` (fixes de review: parse por segmento posicional, scope por año, test de pluKgToPrice, JSDoc, no-mutación verificada). Tests 11/11.

**Files:**
- Create: `src/lib/tpvOffline.ts`
- Test: `src/lib/tpvOffline.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  nextOfflineNumber, expectedCashForSession, pluToKg,
  sortByUnitsSold, daysUntilOutOfStock,
} from './tpvOffline';

describe('nextOfflineNumber', () => {
  it('genera el siguiente número correlativo de la serie', () => {
    expect(nextOfflineNumber([], 'TPV', 2026)).toBe('TPV-2026-0001');
    expect(nextOfflineNumber(['TPV-2026-0001', 'TPV-2026-0003'], 'TPV', 2026)).toBe('TPV-2026-0004');
  });

  it('añade sufijo por dispositivo cuando se pide temporal (offline)', () => {
    const n = nextOfflineNumber([], 'TPV', 2026, 'F3K2');
    expect(n).toBe('TPV-2026-0001-F3K2');
  });

  it('no colisiona cuando un dispositivo ya emitió un número temporal', () => {
    const existing = ['TPV-2026-0001-F3K2', 'TPV-2026-0002-9X4Q'];
    expect(nextOfflineNumber(existing, 'TPV', 2026, 'F3K2')).toBe('TPV-2026-0003-F3K2');
  });
});

describe('expectedCashForSession', () => {
  it('suma el fondo inicial más las ventas en efectivo no anuladas', () => {
    expect(expectedCashForSession(100, [12.5, 40, 0])).toBe(152.5);
  });
});

describe('pluToKg', () => {
  it('convierte gramos a kg con 3 decimales', () => {
    expect(pluToKg(1250)).toBe(1.25);
    expect(pluToKg(333)).toBe(0.333);
  });
});

describe('sortByUnitsSold', () => {
  it('ordena los más vendidos arriba sin mutar el original', () => {
    const a = { id: 'a', unitsSold: 5 } as any;
    const b = { id: 'b', unitsSold: 50 } as any;
    const c = { id: 'c', unitsSold: 2 } as any;
    expect(sortByUnitsSold([a, c, b]).map(p => p.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('daysUntilOutOfStock', () => {
  it('estima en cuántos días se agota el stock con la frecuencia actual', () => {
    expect(daysUntilOutOfStock(10, 5, 5)).toBe(2); // 10 ud / 5 ud por día
    expect(daysUntilOutOfStock(0, 5, 5)).toBe(0);
    expect(daysUntilOutOfStock(10, 5, 0)).toBe(Infinity);
  });
});
```

**Step 2: Run to verify they fail**
Run: `npx vitest run src/lib/tpvOffline.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// src/lib/tpvOffline.ts
export function nextOfflineNumber(
  existingNumbers: string[],
  series: string,
  year: number,
  deviceSuffix?: string,
): string {
  let max = 0;
  for (const num of existingNumbers) {
    const parts = num.split('-');
    const numPart = parseInt(parts[parts.length - 1] || '0', 10);
    if (!isNaN(numPart) && numPart > max) max = numPart;
  }
  const base = `${series}-${year}-${String(max + 1).padStart(4, '0')}`;
  return deviceSuffix ? `${base}-${deviceSuffix}` : base;
}

export function expectedCashForSession(startingCash: number, cashSales: number[]): number {
  return Number((startingCash + cashSales.reduce((s, v) => s + v, 0)).toFixed(2));
}

export function pluToKg(grams: number): number {
  return Math.round(grams) / 1000;
}

export function pluKgToPrice(pricePerKg: number, kg: number): number {
  return Number((pricePerKg * kg).toFixed(2));
}

export function sortByUnitsSold<T extends { unitsSold?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.unitsSold ?? 0) - (a.unitsSold ?? 0));
}

export function daysUntilOutOfStock(stock: number, threshold: number, unitsPerDay: number): number {
  if (stock <= threshold) return 0;
  if (unitsPerDay <= 0) return Infinity;
  return Math.floor((stock - threshold) / unitsPerDay);
}
```

**Step 4: Run tests, expect PASS**
Run: `npx vitest run src/lib/tpvOffline.test.ts`
Expected: PASS (all 8 tests).

**Step 5: Typecheck + commit**
Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/lib/tpvOffline.ts src/lib/tpvOffline.test.ts
git commit -m "feat(tpv): lógica pura offline — numeración sin colisiones, arqueo, PLU e IA de orden"
```

---

### Task 2: IndexedDB v2 — stores `pos_sessions` y `open_checks`

**Files:**
- Modify: `src/lib/offlineDb.ts`

**Step 1: Bump version y añadir stores**

Cambiar `const DB_VERSION = 1;` por `const DB_VERSION = 2;` y dentro de `onupgradeneeded` añadir (después de las stores existentes):

```ts
// Stores nuevas (v2) — migración no destructiva: sólo se crean si faltan.
if (!db.objectStoreNames.contains('pos_sessions')) {
  db.createObjectStore('pos_sessions', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('open_checks')) {
  db.createObjectStore('open_checks', { keyPath: 'id' });
}
```

Añadir `'pos_sessions'` y `'open_checks'` al array `ALL_STORE_NAMES` (para limpiarlas al cerrar sesión).

Añadir a la unión `SyncTable` el valor `'pos_sessions'`:

```ts
export type SyncTable = 'invoices' | 'clients' | 'products' | 'company_settings' |
  'invoice_line_items' | 'invoice_tax_breakdown' | 'order_approvals' |
  'order_approval_items' | 'user_profiles' | 'pos_sessions';
```

**Step 2: Typecheck**
Run: `npx tsc --noEmit`
Expected: no errors.

**Step 3: Commit**
```bash
git add src/lib/offlineDb.ts
git commit -m "feat(tpv): IndexedDB v2 — stores de pos_sessions y open_checks"
```

---

### Task 3: Caja local-first + syncEngine con dependencias (crítico)

El sync offline de facturas ya encola `invoice` → `line_items` → `tax_breakdown` en ese orden. Al reconectar, el `upsert` de la factura EMITIDA llega ANTES que sus líneas, y `fn_invoice_seal` (que recalcula totales desde `invoice_line_items`) la rechaza con `ANTIFRAUDE: no se puede emitir sin líneas` → el ticket se pierde. Hay que vaciar las líneas antes que el padre.

**Files:**
- Modify: `src/lib/storage.ts` (funciones de PosSession, líneas 835-891)
- Modify: `src/lib/syncEngine.ts` (TABLE_MAP + proceso por dependencias)

**Step 3.1: PosSession local-first en `storage.ts`**

Sustituir `getActivePosSession`, `openPosSession`, `closePosSession` (y `cashSalesTotalForSession`) por versiones que:
1. Siempre escriben/leen IndexedDB.
2. Si `navigator.onLine`, hacen upsert directo; si falla o hay red, encolan `enqueueSyncAction('upsert', 'pos_sessions', row)`.

```ts
function posSessionToRow(s: PosSession, userId: string) {
  return {
    id: s.id, user_id: userId, opened_at: s.openedAt, closed_at: s.closedAt || null,
    starting_cash: s.startingCash, counted_cash: s.countedCash ?? null,
    expected_cash: s.expectedCash ?? null, cash_difference: s.cashDifference ?? null,
    status: s.status, notes: s.notes || null,
  };
}

export async function getActivePosSession(): Promise<PosSession | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  let sessions: Array<Record<string, unknown>> = [];
  if (offlineAvail) sessions = await getAll<any>('pos_sessions');
  if (navigator.onLine && sessions.length === 0) {
    const { data } = await supabase().from('pos_sessions').select('*').eq('status', 'open').maybeSingle();
    if (data) {
      if (offlineAvail) await put('pos_sessions', data);
      return mapPosSessionFromDb(data as any);
    }
    return undefined;
  }
  const open = sessions.find(s => s.status === 'open');
  return open ? mapPosSessionFromDb(open as any) : undefined;
}

export async function openPosSession(startingCash: number): Promise<PosSession> {
  const userId = await requireUserId();
  const session: PosSession = {
    id: generateId(), openedAt: new Date().toISOString(),
    startingCash, status: 'open',
  };
  const row = posSessionToRow(session, userId);
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) await put('pos_sessions', row);
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase().from('pos_sessions').insert(row).select('*').single();
      if (error) throw error;
      return mapPosSessionFromDb(data);
    } catch {
      await enqueueSyncAction('upsert', 'pos_sessions', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'pos_sessions', row);
  }
  return session;
}

export async function closePosSession(sessionId: string, countedCash: number): Promise<PosSession> {
  const userId = await requireUserId();
  const offlineAvail = await isOfflineDbAvailable();
  const cached = offlineAvail ? await getById<any>('pos_sessions', sessionId) : undefined;
  if (!cached) throw new Error('No se encuentra el turno de caja.');

  // Arqueo desde las ventas en efectivo LOCALES del turno.
  const invoices = await getInvoices();
  const cashSales = invoices
    .filter(i => i.posSessionId === sessionId
      && i.paymentMethod === PaymentMethod.EFECTIVO
      && i.status !== InvoiceStatus.ANULADA)
    .reduce((sum, i) => sum + i.total, 0);
  const expectedCash = expectedCashForSession(Number(cached.starting_cash), [cashSales]);

  const session: PosSession = {
    ...mapPosSessionFromDb(cached as any),
    countedCash, expectedCash,
    cashDifference: Number((countedCash - expectedCash).toFixed(2)),
    closedAt: new Date().toISOString(), status: 'closed',
  };
  const row = posSessionToRow(session, userId);
  if (offlineAvail) await put('pos_sessions', row);
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase().from('pos_sessions').update(row).eq('id', sessionId).select('*').single();
      if (error) throw error;
      return mapPosSessionFromDb(data);
    } catch {
      await enqueueSyncAction('upsert', 'pos_sessions', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'pos_sessions', row);
  }
  return session;
}
```

Importar `expectedCashForSession` y `getAll` desde `tpvOffline` y `offlineDb`. Quitar `cashSalesTotalForSession` (ya no se usa).

**Step 3.2: syncEngine — procesar hijos antes que el padre**

En `syncEngine.ts`:

```ts
const CHILD_TABLES: Record<string, string[]> = {
  invoices: ['invoice_line_items', 'invoice_tax_breakdown'],
};
```

En `processSyncQueue`, dentro del bucle, antes de `processItem(supabase, item)` para un `upsert` de `invoices`, vaciar primero las filas hijas de la cola (mismo `invoice_id`):

```ts
if (item.action === 'upsert' && item.table === 'invoices') {
  const pending = queue.filter(q => q.id !== item.id &&
    CHILD_TABLES.invoices.includes(q.table) &&
    (q.data as { invoice_id?: string }).invoice_id === (item.data as { id?: string }).id);
  for (const child of pending) {
    try { await processItem(supabase, child); await removeSyncItem(child.id); }
    catch (err) { /* se deja en cola, se reintentará en la siguiente pasada */ }
  }
}
```

Añadir al `TABLE_MAP`: `pos_sessions: 'pos_sessions'`.

**Step 4: Typecheck**
Run: `npx tsc --noEmit`
Expected: no errors. (`npm run lint` sin warnings nuevos.)

**Step 5: Commit**
```bash
git add src/lib/storage.ts src/lib/syncEngine.ts
git commit -m "feat(tpv): caja local-first y sync con orden de dependencias (padre<-hijos)"
```

---

### Task 4: Numeración offline en el TPV + flag `numberTemporary`

**Files:**
- Modify: `src/lib/types.ts` (`Invoice.numberTemporary?`)
- Modify: `src/lib/storage.ts` (mapeo `number_temporary` en `invRow`, `mapInvoiceFromDb`)
- Modify: `src/app/(app)/tpv/page.tsx` (número offline)
- Modify: `src/lib/offlineDb.ts` — helper `getDeviceSuffix`

**Step 4.1: Tipo**

Añadir a `Invoice`:
```ts
  // Número temporal emitido offline; el servidor lo renumerará al sincronizar.
  numberTemporary?: boolean;
```

**Step 4.2: Storage**

En `saveInvoice` (`invRow`): añadir `number_temporary: invoice.numberTemporary ?? false,`.
En `mapInvoiceFromDb` (línea ~1161): añadir `numberTemporary: inv.number_temporary ?? false,`.

**Step 4.3: Suffix de dispositivo persistente**

En `offlineDb.ts`:
```ts
export async function getDeviceSuffix(): Promise<string> {
  let suffix = await getMeta('deviceSuffix') as string | undefined;
  if (!suffix) {
    suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    await setMeta('deviceSuffix', suffix);
  }
  return suffix;
}
```

**Step 4.4: TPV page — asignar número**

En `handleConfirmCheckout`, sustituir el bloque de cálculo de número (líneas ~355-368) por:

```ts
const allInvoices = await getInvoices();
const tpvSeriesInvoices = allInvoices.filter(i => i.series === settings.tpvSeries);
const existingNumbers = tpvSeriesInvoices.map(i => i.number);
const maxLocal = Math.max(0, ...existingNumbers
  .map(n => parseInt(n.split('-').pop() || '0', 10))
  .filter(n => !isNaN(n)));
const nextTpvNum = Math.max(settings.nextTpvNumber || 1, maxLocal + 1);

const offline = !navigator.onLine;
const deviceSuffix = offline ? await getDeviceSuffix() : undefined;
const number = generateInvoiceNumber(settings.tpvSeries, nextTpvNum)
  + (deviceSuffix ? `-${deviceSuffix}` : '');
```

y en el objeto `invoice`:
```ts
number,
numberTemporary: !!deviceSuffix,
```

**Step 5: Test de regresión offline de emisión**

Añadir a `src/lib/storage.issue.test.ts` un test de que una factura con `numberTemporary: true` mapea a `number_temporary: true` en la fila (mockear `navigator.onLine = false` y verificar `enqueueSyncAction` recibió `number_temporary: true`).

**Step 6: Typecheck + tests + commit**
Run: `npx tsc --noEmit; npm test`
Expected: PASS.
```bash
git add src/lib/types.ts src/lib/storage.ts src/lib/offlineDb.ts "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): numeración offline con sufijo de dispositivo y flag numberTemporary"
```

---

### Task 5: Migración 011 — servidor renumerador + IA + modo

**File:** Create: `supabase/migration_011_tpv_offline_ia_modes.sql`

**Contenido (aplicar con Supabase MCP/CLI/dashboard — el MCP no está autenticado en esta sesión):**

```sql
-- Migración 011: TPV offline (renumeración sin descartar tickets),
-- inventario IA (units_sold) y modo de TPV configurable.

-- --- 1. Inventario IA: contador de unidades vendidas ---
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS units_sold NUMERIC NOT NULL DEFAULT 0;

-- --- 2. Numeración temporal offline ---
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS number_temporary BOOLEAN NOT NULL DEFAULT false;

-- Renumeración previa al sellado: si el número temporal ya existe en la
-- serie (otro dispositivo lo generó antes), asigna el siguiente libre.
-- Se ejecuta ANTES que tr_invoice_seal (orden alfabético) y usa el mismo
-- advisory lock para no colisionar entre syncs simultáneos.
CREATE OR REPLACE FUNCTION public.fn_invoice_offline_renumber()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max BIGINT;
  v_year INT;
  v_prefix TEXT;
  v_candidate TEXT;
BEGIN
  IF NOT NEW.number_temporary OR NEW.sealed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || NEW.series, 0));

  -- Extraer serie y año del número temporal (formato SERIE-AÑO-0000-SUFIJO).
  SELECT
    COALESCE(MAX((substr(NEW.number, length(prefix) + 1))::BIGINT), 0)
  INTO v_max
  FROM (
    SELECT split_part(NEW.number, '-', 1) AS prefix
  ) t
  CROSS JOIN LATERAL (
    SELECT split_part(NEW.number, '-', 2)::INT
  ) yr(y);

  SELECT split_part(NEW.number, '-', 2)::INT INTO v_year;

  SELECT COALESCE(MAX((
    (regexp_match(number, E'-([0-9]{4})(?:-[A-Z0-9]{4})?$'))[1] || '-'
  ))::BIGINT, 0) INTO v_max FROM public.invoices
  WHERE user_id = NEW.user_id AND series = split_part(NEW.number, '-', 1)
    AND number ~ ('^' || split_part(NEW.number, '-', 1) || '-' || v_year || '-[0-9]{4}');

  -- Siguiente número libre de la serie.
  LOOP
    v_max := v_max + 1;
    v_candidate := format('%s-%s-%s',
      split_part(NEW.number, '-', 1), v_year, lpad(v_max::text, 4, '0'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE user_id = NEW.user_id AND series = split_part(NEW.number, '-', 1)
        AND number = v_candidate
    );
  END LOOP;

  IF v_candidate <> NEW.number THEN
    PERFORM public.log_invoice_event(
      NEW.user_id, NEW.id, NEW.number, 'OFFLINE_RENUMBERED', 'info',
      format('Ticket offline renumerado de %s a %s', NEW.number, v_candidate)
    );
    NEW.number := v_candidate;
  END IF;

  -- El ticket offline conserva su fecha real de venta aunque llegue tarde:
  -- se relaja el control antirretroactividad SÓLO para esta inserción y con
  -- registro en el log (ver fn_invoice_seal más abajo).
  NEW.number_temporary := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_invoice_offline_renumber ON public.invoices;
CREATE TRIGGER tr_invoice_offline_renumber
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_offline_renumber();

-- Relajar el bloqueo de fecha retroactiva para tickets offline recién
-- renumerados: el check de backdate pasa del trigger a un flag temporal.
-- Como fn_invoice_offline_renumber ya corrió (limpió number_temporary),
-- usamos el propio trigger de sellado: si llega un ticket offline cuyo
-- number_temporary era true, la fecha puede ser anterior a la última sellada.
-- Ajuste en fn_invoice_seal:
CREATE OR REPLACE FUNCTION public.fn_invoice_seal() ... -- (ver abajo)
```

Nota: para no duplicar 850 líneas, en la migración se re-CREA `fn_invoice_seal` (copiar el cuerpo actual de `migration_002_antifraude.sql` líneas 187-315) y en el bloque de backdate se cambia:

```sql
    -- Antirretroactividad: no se puede emitir con fecha anterior a la última
    -- factura ya emitida — salvo tickets offline renumerados, que conservan
    -- su fecha real de venta (con registro en el log).
    IF v_prev_date IS NOT NULL AND NEW.issue_date < v_prev_date THEN
      PERFORM public.log_invoice_event(
        NEW.user_id, NEW.id, NEW.number, 'OFFLINE_BACKDATE_ALLOWED', 'warning',
        format('Ticket offline del %s sincronizado tras facturas del %s.', NEW.issue_date, v_prev_date)
      );
      -- No se lanza excepción: se sella en la posición actual de la cadena.
    END IF;
```

(El resto del cuerpo de `fn_invoice_seal` se mantiene igual.)

```sql
-- --- 3. Modo de TPV configurable ---
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS tpv_mode TEXT NOT NULL DEFAULT 'tienda'
  CHECK (tpv_mode IN ('tienda', 'supermercado', 'restaurante'));

CREATE INDEX IF NOT EXISTS idx_products_units_sold
  ON products (user_id, units_sold DESC);
```

**Verificación tras aplicar:** desde la pestaña SQL, `SELECT public.invoice_chain_status();` debe seguir devolviendo `chain_valid: true`.

**Commit (SQL pendiente de aplicar al proyecto remoto):**
```bash
git add supabase/migration_011_tpv_offline_ia_modes.sql
git commit -m "feat(db): migración 011 — renumber offline, units_sold y tpv_mode"
```

---

### Task 6: Indicador "Pendiente de sincronizar"

**Files:**
- Modify: `src/components/tpv/TpvTicket.tsx`
- Modify: `src/components/tpv/TpvTodaySalesModal.tsx`

**Step 1: TpvTicket**

Cuando `invoice.numberTemporary` sea true (o no haya `verifactu?.chainedHash` y esté recién emitida), mostrar badge:
```tsx
{invoice.numberTemporary && (
  <span className="badge badge-warning">
    <CloudOff size={12} /> Pendiente de sincronizar
  </span>
)}
```
(Importar `CloudOff` de lucide-react. Colocarlo junto al badge "Ticket Generado".)

**Step 2: TpvTodaySalesModal**

- En el encabezado, bajo el total, añadir contador:
```tsx
const pendingSync = invoices.filter(i => i.numberTemporary).length;
{pendingSync > 0 && (
  <span className="badge badge-warning">⚠ {pendingSync} tickets sin sincronizar</span>
)}
```
- En la lista, junto al número, si `inv.numberTemporary` mostrar `<CloudOff size={12}/>` con `title="Pendiente de sincronizar"`.

**Step 3: Typecheck + commit**
Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/components/tpv/TpvTicket.tsx src/components/tpv/TpvTodaySalesModal.tsx
git commit -m "feat(tpv): badge de pendiente de sincronización en ticket y ventas del día"
```

---

## Fase 1 — Inventario IA

### Task 7: `unitsSold` en productos y su incremento al vender

**Files:**
- Modify: `src/lib/types.ts` (`Product.unitsSold?`)
- Modify: `src/lib/storage.ts` (`mapProductFromDb`, `saveProduct` row, `backgroundRefresh` ya incluye `*`)
- Modify: `src/app/(app)/tpv/page.tsx` (incrementar al confirmar)

**Step 1: Tipo**
```ts
  unitsSold?: number;
```

**Step 2: Storage**
- `mapProductFromDb`: `unitsSold: Number(p.units_sold ?? 0),`
- `saveProduct` row: `units_sold: product.unitsSold ?? 0,`

**Step 3: TPV — incrementar tras la venta**

En `handleConfirmCheckout`, dentro del bucle que llama a `adjustStock` (líneas ~400-408), añadir actualización local del contador:

```ts
for (const line of cart) {
  if (!line.productId.startsWith('custom-')) {
    try {
      await adjustStock(line.productId, -line.quantity);
      const prod = products.find(p => p.id === line.productId);
      if (prod) {
        await saveProduct({ ...prod, unitsSold: (prod.unitsSold ?? 0) + line.quantity });
      }
    } catch {
      toastError('Aviso de stock', `No se pudo actualizar el stock de ${line.productName}.`);
    }
  }
}
```
(`saveProduct` ya encola el upsert offline y hace upsert online.)

**Step 4: Test del mapeo**
Añadir en un test de storage que `mapProductFromDb` expone `unitsSold` desde `units_sold` (exportarlo si hace falta para el test, o testear vía `getProducts` con mock de supabase).

**Step 5: Typecheck + tests + commit**
Run: `npx tsc --noEmit; npm test`
Expected: PASS.
```bash
git add src/lib/types.ts src/lib/storage.ts "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): contador de unidades vendidas por producto (base del inventario IA)"
```

---

### Task 8: Ordenación inteligente del grid

**Files:**
- Modify: `src/components/tpv/TpvProductGrid.tsx`

**Step 1: Aplicar `sortByUnitsSold`**

En el `useMemo` de `filtered`, después de los filtros:
```ts
import { sortByUnitsSold } from '@/lib/tpvOffline';
// ...
return sortByUnitsSold(list);
```

**Step 2: Hint visual**
En cada tile, si `p.unitsSold > 0`, mostrar un mini indicador `★ N` (N = posición) con `title="Más vendido · Nº N"` y color ámbar para los 3 primeros.

**Step 3: Typecheck + commit**
Run: `npx tsc --noEmit`
```bash
git add src/components/tpv/TpvProductGrid.tsx
git commit -m "feat(tpv): los más vendidos salen arriba en el grid de productos"
```

---

### Task 9: Panel "Patrones" (ventas y reposición)

**Files:**
- Create: `src/components/tpv/TpvInsightsModal.tsx`
- Modify: `src/app/(app)/tpv/page.tsx` (botón en la topbar + modal)

**Step 1: Modal con datos de `getInvoices()`**

Contenido:
- Top 10 productos por unidades vendidas (30 días).
- Picos por hora (mapa simple: filas por hora, barra de proporción).
- Alertas de reposición usando `daysUntilOutOfStock(stock, threshold, unitsPerDay)` donde `unitsPerDay = unitsSold30d / 30`.
- Todo con cálculo client-side en `useMemo` sobre `getInvoices()`.

**Step 2: Conectar**
Botón `TrendingUp` "Patrones" en la topbar (junto a "Tickets Hoy") → abre el modal.

**Step 3: Typecheck + commit**
```bash
git add src/components/tpv/TpvInsightsModal.tsx "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): panel de patrones de consumo y alertas de reposición"
```

---

## Fase 2 — Modo Supermercado

### Task 10: `tpvMode` en ajustes y en el TPV

**Files:**
- Modify: `src/lib/types.ts` (`CompanySettings.tpvMode?`)
- Modify: `src/lib/constants.ts` (`TPV_MODES` + `defaultTpvModeForSector`)
- Modify: `src/lib/storage.ts` (`mapSettingsFromDb`, `saveCompanySettings` row)
- Modify: `src/app/(app)/ajustes/page.tsx` (selector)
- Modify: `src/app/(app)/tpv/page.tsx` (leer modo)

**Step 1: Tipos y constantes**
```ts
export type TpvMode = 'tienda' | 'supermercado' | 'restaurante';
// CompanySettings:
tpvMode?: TpvMode;

export const TPV_MODES: { value: TpvMode; label: string; description: string }[] = [
  { value: 'tienda', label: 'Tienda / Estándar', description: 'Tiles grandes y categorías en chips.' },
  { value: 'supermercado', label: 'Supermercado', description: 'Grid denso, orden IA y venta por peso (PLU).' },
  { value: 'restaurante', label: 'Restaurante', description: 'Mesas y cuentas abiertas.' },
];

export function defaultTpvModeForSector(sector: string): TpvMode {
  if (sector === 'supermercado') return 'supermercado';
  if (sector === 'bebidas') return 'restaurante';
  return 'tienda';
}
```

**Step 2: Storage**
- `mapSettingsFromDb`: `tpvMode: (s.tpv_mode as TpvMode) || defaultTpvModeForSector(s.sector),`
- En `saveCompanySettings` row: `tpv_mode: settings.tpvMode ?? defaultTpvModeForSector(settings.sector),`

**Step 3: Ajustes**
En `ajustes/page.tsx`, en la sección TPV, un `<select>` con `TPV_MODES` y helper "Por defecto según sector: X".

**Step 4: TPV page**
En `TpvPage` leer `const tpvMode = settings?.tpvMode ?? defaultTpvModeForSector(settings?.sector ?? 'tienda');` y pasárselo al grid.

**Step 5: Typecheck + commit**
```bash
git add src/lib/types.ts src/lib/constants.ts src/lib/storage.ts src/app/(app)/ajustes/page.tsx "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): modo de TPV configurable (tienda/supermercado/restaurante)"
```

---

### Task 11: Grid denso para supermercado

**Files:**
- Modify: `src/components/tpv/TpvProductGrid.tsx`

**Step 1: Prop `mode`**
Añadir prop `mode: TpvMode`. Si `mode === 'supermercado'`:
- Añadir clase `tpv-product-grid is-dense` (CSS: `grid-template-columns: repeat(auto-fill, minmax(84px, 1fr))`, nombre en 2 líneas clamp, precio más pequeño).
- Categorías en `overflow-x: auto` con chips más pequeños.

**Step 2: CSS**
Añadir al final de `src/app/globals.css` el bloque `is-dense` respetando las variables existentes (`--radius-*`, `--text-*`, `--accent-500`).

**Step 3: Typecheck + commit**
```bash
git add src/components/tpv/TpvProductGrid.tsx src/app/globals.css
git commit -m "feat(tpv): grid denso y orden IA en modo supermercado"
```

---

### Task 12: Venta por peso (PLU)

**Files:**
- Create: `src/components/tpv/TpvWeightModal.tsx`
- Modify: `src/app/(app)/tpv/page.tsx` (`handleScan` + state)

**Step 1: Modal de peso**
Props: `product: Product`, `onAdd(kg: number)`, `onClose`.
- Input numérico de gramos (por defecto 1000), teclado numérico rápido (`500g / 1kg / 2kg`).
- Muestra precio total = `pluKgToPrice(product.unitPrice, kg)`.
- Al confirmar → `onAdd(kg)` con `pluToKg(grams)`.

**Step 2: Detección PLU en `handleScan`**

En `tpv/page.tsx`, al inicio de `handleScan`, antes de buscar producto:
```ts
const pluMatch = /^2\d{5}$/.exec(code);
if (pluMatch) {
  const base = code.slice(0, 6); // EAN báscula: 2 + 5 dígitos + 4 de peso
  const product = products.find(p => p.barcode === code || p.ref === base);
  if (product && product.unit === UnitOfMeasure.KG) {
    setWeightProduct(product);
    return true;
  }
}
```
Estados nuevos: `const [weightProduct, setWeightProduct] = useState<Product | null>(null);`
`handleAddWeight = (kg: number) => { addProductToCart(weightProduct, kg); setWeightProduct(null); }`
Extender `addProductToCart` con cantidad inicial `quantity` (por defecto 1) y redondeo a 3 decimales cuando sea peso.

**Step 3: Render del modal**
Junto al resto de modales: `{weightProduct && <TpvWeightModal product={weightProduct} onAdd={handleAddWeight} onClose={() => setWeightProduct(null)} />}`

**Step 4: Typecheck + commit**
```bash
git add src/components/tpv/TpvWeightModal.tsx "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): venta por peso con códigos de báscula PLU (modo supermercado)"
```

---

## Fase 3 — Modo Restaurante (mesas + cuenta abierta)

### Task 13: Store local `open_checks`

**Files:**
- Modify: `src/lib/offlineDb.ts` (store ya creada en Task 2)
- Create: `src/lib/openChecks.ts`

**Step 1: Helpers locales**

```ts
import { getAll, getById, put, remove } from './offlineDb';
import { generateId } from './utils';
import { PosCartLine } from './types';

export interface OpenCheck {
  id: string;
  tableId: string;
  openedAt: string;
  lines: PosCartLine[];
}

export async function getOpenChecks(): Promise<OpenCheck[]> { return getAll<OpenCheck>('open_checks'); }
export async function getOpenCheck(id: string): Promise<OpenCheck | undefined> { return getById<OpenCheck>('open_checks', id); }
export async function saveOpenCheck(check: OpenCheck): Promise<void> { await put('open_checks', check); }
export async function deleteOpenCheck(id: string): Promise<void> { await remove('open_checks', id); }
export async function createOpenCheck(tableId: string): Promise<OpenCheck> {
  const check: OpenCheck = { id: generateId(), tableId, openedAt: new Date().toISOString(), lines: [] };
  await saveOpenCheck(check);
  return check;
}
```

**Step 2: Test con mocks de offlineDb** (`src/lib/openChecks.test.ts`) siguiendo el patrón de `storage.issue.test.ts`: crear, añadir línea, cobrar (delete).

**Step 3: Typecheck + tests + commit**
```bash
git add src/lib/openChecks.ts src/lib/openChecks.test.ts
git commit -m "feat(tpv): cuentas abiertas de restaurante en IndexedDB"
```

---

### Task 14: Componente de Mesas

**Files:**
- Create: `src/components/tpv/TpvTables.tsx`
- Modify: `src/app/(app)/tpv/page.tsx`

**Step 1: Estado en el TPV**
Cuando `tpvMode === 'restaurante'`, añadir pestaña `Tabla`/`Mesas` en la zona del grid: un botón de pestaña `TpvTables` que muestra:
- Grid de mesas (por defecto 12, configurable más adelante): estado `libre`/`ocupada`.
- Click en mesa libre → `createOpenCheck(tableId)` → abre panel de cuenta.
- Click en mesa ocupada → panel con sus líneas (reutiliza `TpvCart` con `lines` de la cuenta), botones: añadir producto desde el grid (el carrito se sustituye por la cuenta activa), **Cobrar mesa** (convierte la cuenta en factura vía `handleConfirmCheckout` con `onTableCharge`) y **Vaciar** (delete).

**Step 2: Flujo de cobro de mesa**
`handleConfirmCheckout` acepta líneas como argumento opcional (`lines?: PosCartLine[]`). Para mesa:
```ts
const invoice = await issueInvoice(buildInvoiceFromLines(check.lines, method, cashGiven));
await deleteOpenCheck(check.id);
```

**Step 3: Typecheck + commit**
```bash
git add src/components/tpv/TpvTables.tsx "src/app/(app)/tpv/page.tsx"
git commit -m "feat(tpv): modo restaurante — mesas con cuentas abiertas y cobro por mesa"
```

---

## Cierre

### Task 15: Verificación end-to-end

**Step 1:** `npm test` → todos PASS.
**Step 2:** `npx tsc --noEmit` → sin errores.
**Step 3:** `npm run lint` → sin errores nuevos.
**Step 4: Prueba manual offline** (DevTools → Network → Offline):
  1. Abrir caja → funciona.
  2. Vender 3 tickets (números con sufijo de dispositivo).
  3. Devolver un ticket → se encola.
  4. Cerrar caja → arqueo correcto.
  5. Reconectar → `sync-queue` vacía, tickets aparecen sellados en Supabase (renumerados si había colisión), caja cerrada sincronizada.
**Step 5:** Aplicar `migration_011_tpv_offline_ia_modes.sql` al proyecto remoto (MCP/CLI/dashboard) y repetir `SELECT public.invoice_chain_status();` → `chain_valid: true`.

```bash
git add -A
git commit -m "chore(tpv): verificación end-to-end offline, IA y modos"
```

## Riesgos y decisiones tomadas
- **Rechazo permanente de duplicados**: se elimina para tickets offline gracias a la renumeración en servidor antes del sellado.
- **Backdate**: los tickets offline conservan su fecha real de venta; el control antirretroactividad se relaja sólo para inserciones `number_temporary` y con registro en `invoice_events`.
- **Sync ordering**: `syncEngine` vacía líneas antes que la factura padre (si no, el sello falla por "sin líneas").
- **IA**: 100% local (sin llamadas externas); `units_sold` se mueve con `saveProduct`.
- **Restaurante**: sin cocina ni impresión de comandas (fase 2). Mesas y cuentas son locales hasta el cobro.
