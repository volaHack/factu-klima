# Tier 0 — Seguridad activa: Plan de implementación

> **Para Claude:** SUB-SKILL REQUERIDA para ejecutar: `desarrollo-con-subagentes` (en esta misma sesión, un subagente fresco por tarea con revisión de código entre tareas) o `ejecutar-plan-paso-a-paso` (sesión aparte, ejecución por lotes con puntos de control).

**Objetivo:** cerrar los riesgos de seguridad activos encontrados en la auditoría del 2026-08-03 (ver `docs/plans/2026-08-03-mejoras-facturacion-design.md`, Tier 0) antes de tocar nada más del roadmap: acceso público sin control a tablas de aprobación de pedidos, ausencia de rate limiting, redirect abierto, cabeceras de seguridad ausentes, e IndexedDB no se limpia al cerrar sesión.

**Arquitectura:** el cambio de fondo es mover el portal público `/aprobar/[token]` de "el navegador anónimo llama directo a Supabase con la clave pública" a "el navegador llama a nuestras propias API routes, que usan la service role key en el servidor" — el mismo patrón que ya usa `src/app/api/stripe/checkout/route.ts` para el mismo flujo. Esto permite (a) bloquear con RLS todo acceso anónimo directo a `order_approvals`/`order_approval_items` sin necesidad de una política pública frágil, y (b) aplicar rate limiting real en el servidor. El rate limiting se implementa con una tabla + función RPC en Supabase (ya es la pieza central de infraestructura del proyecto; no añade dependencias nuevas ni servicios de pago).

**Tech Stack:** Next.js 16 App Router (route handlers), Supabase (Postgres + `@supabase/supabase-js` con service role), TypeScript, Vitest (nuevo, solo para lógica pura).

**Antes de empezar:** este repo usa Next.js 16 con cambios respecto a versiones anteriores — consulta `node_modules/next/dist/docs/` si algo de la API de route handlers no se comporta como esperas.

---

### Task 0: Configurar Vitest para tests de lógica pura

El repo no tiene ningún test (confirmado en la auditoría). Vitest es la opción más ligera para probar funciones puras de TypeScript sin arrancar Next.js. Esto NO sustituye la falta de cobertura general (eso es Tier 3, más adelante) — es solo la infraestructura mínima para poder hacer TDD real en las dos piezas de este plan que son lógica pura.

**Archivos:**
- Modificar: `facturacion-app/package.json`
- Crear: `facturacion-app/vitest.config.ts`

**Paso 1:** Instalar Vitest como devDependency.

```bash
cd facturacion-app
npm install -D vitest
```

**Paso 2:** Crear `facturacion-app/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
  },
});
```

**Paso 3:** Añadir el script `test` en `package.json` (junto a `dev`/`build`/`start`/`lint`):

```json
"test": "vitest run"
```

**Paso 4: Verificar**

Run: `npm run test`
Esperado: `No test files found` (todavía no hay ningún `*.test.ts`) pero sin errores de configuración — confirma que Vitest arranca y resuelve el alias `@/`.

**Paso 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: añadir Vitest para tests de lógica pura"
```

---

### Task 1: Redirect seguro en `/auth/callback` (evitar open redirect)

**Contexto:** `src/app/auth/callback/route.ts` toma `next` de la query string y lo concatena directo en la URL de redirect. Un enlace como `/auth/callback?code=...&next=https://sitio-malicioso.com` redirigiría tras el login a un dominio externo.

**Archivos:**
- Crear: `facturacion-app/src/lib/security.ts`
- Test: `facturacion-app/src/lib/security.test.ts`
- Modificar: `facturacion-app/src/app/auth/callback/route.ts`

**Paso 1: Escribir el test que falla**

```typescript
// facturacion-app/src/lib/security.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeRedirectPath } from './security';

describe('isSafeRedirectPath', () => {
  it('acepta una ruta interna simple', () => {
    expect(isSafeRedirectPath('/dashboard')).toBe(true);
  });

  it('acepta una ruta interna con query string', () => {
    expect(isSafeRedirectPath('/facturas/123?paid=true')).toBe(true);
  });

  it('rechaza una URL absoluta a otro dominio', () => {
    expect(isSafeRedirectPath('https://sitio-malicioso.com')).toBe(false);
  });

  it('rechaza un protocol-relative URL (bypass clásico de "empieza por /")', () => {
    expect(isSafeRedirectPath('//sitio-malicioso.com')).toBe(false);
  });

  it('rechaza rutas con backslash usadas para confundir parsers', () => {
    expect(isSafeRedirectPath('/\\sitio-malicioso.com')).toBe(false);
  });

  it('rechaza cadenas vacías o no-string', () => {
    expect(isSafeRedirectPath('')).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });
});
```

**Paso 2: Ejecutar y confirmar que falla**

Run: `npm run test -- security.test.ts`
Esperado: FAIL — `Cannot find module './security'` (todavía no existe).

**Paso 3: Implementación mínima**

```typescript
// facturacion-app/src/lib/security.ts

/**
 * Comprueba que una ruta de redirect proporcionada por el usuario (query
 * string, body, etc.) sea una ruta interna de la app y no pueda usarse
 * para redirigir a un dominio externo (open redirect).
 */
export function isSafeRedirectPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false; // protocol-relative URL
  if (path.startsWith('/\\')) return false; // algunos navegadores tratan \ como /
  return true;
}
```

**Paso 4: Ejecutar y confirmar que pasa**

Run: `npm run test -- security.test.ts`
Esperado: PASS (7 tests).

**Paso 5: Usarlo en el callback de auth**

En `facturacion-app/src/app/auth/callback/route.ts`, sustituir:

```typescript
  const next = searchParams.get('next') ?? '/dashboard';
```

por:

```typescript
  const rawNext = searchParams.get('next');
  const next = isSafeRedirectPath(rawNext) ? rawNext : '/dashboard';
```

y añadir el import:

```typescript
import { isSafeRedirectPath } from '@/lib/security';
```

**Paso 6: Verificación manual**

Con el servidor dev corriendo (`npm run dev`), confirmar en el navegador:
- `http://localhost:3000/auth/callback?next=/dashboard` conserva el comportamiento normal.
- `http://localhost:3000/auth/callback?next=https://example.com` cae al fallback `/dashboard`, no redirige a `example.com`.

**Paso 7: Commit**

```bash
git add src/lib/security.ts src/lib/security.test.ts src/app/auth/callback/route.ts
git commit -m "fix: evitar open redirect en /auth/callback validando el parámetro next"
```

---

### Task 2: Migración 004 — tablas faltantes, RLS y rate limiting

**Contexto:** `order_approvals`, `order_approval_items` y `user_profiles` se usan en producción sin estar en ninguna migración del repo (confirmado por grep: cero coincidencias en `supabase/*.sql`). Además, no hay verificación de que `invoices.client_id`/`invoice_line_items.product_id` pertenezcan al mismo usuario que la factura.

**Archivos:**
- Crear: `facturacion-app/supabase/migration_004_seguridad_tier0.sql`

**Contenido completo:**

```sql
-- ============================================================
-- MIGRACIÓN 004: Seguridad Tier 0
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Trae bajo control de versiones: user_profiles, order_approvals,
-- order_approval_items (ya usadas en producción sin migración) +
-- añade rate limiting server-side + verificación de propiedad
-- cross-tenant en invoices/invoice_line_items.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. USER_PROFILES (onboarding) — acceso solo del propio usuario
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_owner_policy" ON user_profiles
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles TO authenticated;

-- ------------------------------------------------------------
-- 2. ORDER_APPROVALS / ORDER_APPROVAL_ITEMS
--
-- El dueño autenticado (Elena) puede leer/crear sus propias
-- aprobaciones vía RLS normal. El cliente externo anónimo que
-- accede por /aprobar/[token] NO tiene política — a propósito:
-- ese camino pasa exclusivamente por las API routes del servidor
-- (service role, que ignora RLS), nunca por el cliente Supabase
-- del navegador. Así no hace falta una política "select where
-- token matches" que sería difícil de proteger contra fuerza
-- bruta a nivel de base de datos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  client_message TEXT DEFAULT '',
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_approvals_invoice ON order_approvals(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_approvals_token ON order_approvals(token);

CREATE TABLE IF NOT EXISTS order_approval_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id UUID NOT NULL REFERENCES order_approvals(id) ON DELETE CASCADE,
  line_item_id UUID REFERENCES invoice_line_items(id) ON DELETE SET NULL,
  accepted BOOLEAN NOT NULL DEFAULT TRUE,
  adjusted_quantity DECIMAL(12,4),
  rejection_reason TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_order_approval_items_approval ON order_approval_items(approval_id);

ALTER TABLE order_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_approval_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_approvals_owner_policy" ON order_approvals
  FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "order_approval_items_owner_policy" ON order_approval_items
  FOR ALL TO authenticated
  USING (approval_id IN (
    SELECT oa.id FROM order_approvals oa
    JOIN invoices i ON i.id = oa.invoice_id
    WHERE i.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (approval_id IN (
    SELECT oa.id FROM order_approvals oa
    JOIN invoices i ON i.id = oa.invoice_id
    WHERE i.user_id = (SELECT auth.uid())
  ));

-- Nota: NO se conceden privilegios a "anon" a propósito. El portal
-- público usa la service role key desde las API routes del servidor.
GRANT SELECT, INSERT, UPDATE, DELETE ON order_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_approval_items TO authenticated;

-- ------------------------------------------------------------
-- 3. RATE LIMITING — tabla + función RPC atómica
--
-- Ventana fija (fixed window): se agrupa por bloques de
-- p_window_seconds. Suficientemente bueno para frenar fuerza
-- bruta/abuso; no pretende ser un sliding-window exacto.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie accede a esta tabla directamente, solo la
-- función SECURITY DEFINER de abajo (que se ejecuta como el dueño
-- de la tabla y por tanto ignora RLS).

CREATE OR REPLACE FUNCTION fn_check_rate_limit(p_key TEXT, p_max_hits INT, p_window_seconds INT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_hits (bucket_key, window_start, hit_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET hit_count = public.rate_limit_hits.hit_count + 1
  RETURNING hit_count INTO v_count;

  -- Limpieza oportunista de ventanas viejas (evita crecer sin límite
  -- sin necesitar un cron job dedicado).
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN v_count <= p_max_hits;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION fn_check_rate_limit(TEXT, INT, INT) TO authenticated, anon, service_role;

-- ------------------------------------------------------------
-- 4. INTEGRIDAD CROSS-TENANT: client_id/product_id deben
--    pertenecer al mismo usuario que la factura.
--
-- La RLS de `invoices` solo comprueba invoices.user_id = auth.uid();
-- no impide insertar una factura con client_id/product_id de OTRO
-- usuario si el atacante conoce/adivina ese UUID. Este trigger lo
-- bloquea a nivel de base de datos, no solo de aplicación.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_invoice_client_ownership()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = NEW.client_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'client_id % no pertenece al mismo usuario que la factura', NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_invoice_client_ownership ON invoices;
CREATE TRIGGER tr_invoice_client_ownership
  BEFORE INSERT OR UPDATE OF client_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_check_invoice_client_ownership();

CREATE OR REPLACE FUNCTION fn_check_line_item_product_ownership()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_user_id UUID;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT user_id INTO v_invoice_user_id FROM public.invoices WHERE id = NEW.invoice_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = NEW.product_id AND user_id = v_invoice_user_id
    ) THEN
      RAISE EXCEPTION 'product_id % no pertenece al mismo usuario que la factura', NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_line_item_product_ownership ON invoice_line_items;
CREATE TRIGGER tr_line_item_product_ownership
  BEFORE INSERT OR UPDATE OF product_id ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION fn_check_line_item_product_ownership();
```

**Paso 1: Aplicar la migración**

Esta migración se ejecuta a mano en Supabase Dashboard → SQL Editor (así es como se ejecutaron las tres anteriores en este proyecto; no hay CLI de Supabase configurada todavía — eso es un ítem de Tier 2). Si en el momento de ejecutar este plan ya hay acceso al MCP de Supabase con token válido, usar `mcp__supabase__apply_migration` en su lugar.

**Paso 2: Verificación manual (no hay entorno de test con DB en este repo todavía)**

En el SQL Editor de Supabase, tras aplicar:

```sql
-- Debe devolver 0 filas si RLS está bien: como anon, no se debe poder leer nada
SET ROLE anon;
SELECT * FROM order_approvals LIMIT 1;
RESET ROLE;

-- Debe fallar con la excepción del trigger:
-- (sustituir los UUID por uno de un cliente real y un client_id que exista
-- pero pertenezca a OTRO user_id)
-- INSERT INTO invoices (user_id, number, series, client_id, client_name, due_date)
-- VALUES ('<otro-user-id>', 'TEST', 'TEST', '<client_id-de-un-tercer-usuario>', 'Test', now());
```

**Paso 3: Commit**

```bash
git add supabase/migration_004_seguridad_tier0.sql
git commit -m "feat: migración 004 — tablas de aprobación bajo control de versiones, RLS bloqueada por defecto, rate limiting y verificación cross-tenant"
```

---

### Task 3: Helper de rate limiting

**Archivos:**
- Crear: `facturacion-app/src/lib/rateLimit.ts`
- Test: `facturacion-app/src/lib/rateLimit.test.ts`

**Paso 1: Escribir el test que falla (solo la parte pura: extracción de IP)**

```typescript
// facturacion-app/src/lib/rateLimit.test.ts
import { describe, it, expect } from 'vitest';
import { clientIpFromRequest } from './rateLimit';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/test', { headers });
}

describe('clientIpFromRequest', () => {
  it('usa la primera IP de x-forwarded-for si hay varias', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(clientIpFromRequest(req)).toBe('203.0.113.5');
  });

  it('usa x-real-ip si no hay x-forwarded-for', () => {
    const req = makeRequest({ 'x-real-ip': '203.0.113.9' });
    expect(clientIpFromRequest(req)).toBe('203.0.113.9');
  });

  it('devuelve "unknown" si no hay ninguna cabecera', () => {
    const req = makeRequest({});
    expect(clientIpFromRequest(req)).toBe('unknown');
  });
});
```

**Paso 2: Ejecutar y confirmar que falla**

Run: `npm run test -- rateLimit.test.ts`
Esperado: FAIL — módulo no existe.

**Paso 3: Implementación**

```typescript
// facturacion-app/src/lib/rateLimit.ts
import { createClient as createAdminClient } from '@supabase/supabase-js';

export function clientIpFromRequest(request: Request): string {
  const headers = request.headers;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Comprueba y registra un "hit" contra un límite de peticiones usando la
 * función RPC fn_check_rate_limit (ver migration_004). Fail-open: si la
 * infraestructura de rate limiting no está disponible (falta la service
 * role key, o falla la llamada), NO se bloquea la petición — un fallo de
 * infraestructura no debe tumbar el servicio, solo perder esta capa de
 * protección puntualmente.
 */
export async function checkRateLimit(
  key: string,
  maxHits: number,
  windowSeconds: number
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Rate limiting no disponible: falta SUPABASE_SERVICE_ROLE_KEY.');
    return true;
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('fn_check_rate_limit', {
    p_key: key,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('Error comprobando rate limit:', error);
    return true;
  }

  return data === true;
}
```

**Paso 4: Ejecutar y confirmar que pasa**

Run: `npm run test -- rateLimit.test.ts`
Esperado: PASS (3 tests). `checkRateLimit` no se testea unitariamente aquí porque depende de Supabase real — se verifica de forma manual/integración en la Task 4, contra la función RPC creada en la Task 2.

**Paso 5: Commit**

```bash
git add src/lib/rateLimit.ts src/lib/rateLimit.test.ts
git commit -m "feat: helper de rate limiting server-side respaldado por Supabase"
```

---

### Task 4: Mover el portal público `/aprobar/[token]` a API routes con service role

**Archivos:**
- Crear: `facturacion-app/src/app/api/aprobar/[token]/route.ts`
- Crear: `facturacion-app/src/app/api/aprobar/[token]/respond/route.ts`
- Modificar: `facturacion-app/src/lib/storage.ts` (exportar mappers reutilizados; eliminar `getApprovalByToken` y `submitApprovalResponse`, que quedan sustituidas)
- Modificar: `facturacion-app/src/app/aprobar/[token]/page.tsx`

**Paso 1: Exportar los mappers que se van a reutilizar**

En `facturacion-app/src/lib/storage.ts`, añadir `export` delante de estas cuatro funciones (siguen siendo funciones puras, solo cambia su visibilidad):

```typescript
export function mapInvoiceFromDb(inv: any, lineItems: any[], taxBreakdown: any[]): Invoice {
export function mapLineItemFromDb(li: any): InvoiceLineItem {
export function mapSettingsFromDb(s: any): CompanySettings {
export function mapApprovalItemFromDb(i: any): OrderApprovalItem {
```

(`mapApprovalFromDb` también debe exportarse igual.)

**Paso 2: Crear la ruta GET — obtener aprobación por token**

```typescript
// facturacion-app/src/app/api/aprobar/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import {
  mapInvoiceFromDb, mapLineItemFromDb, mapSettingsFromDb, mapApprovalFromDb,
} from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const allowed = await checkRateLimit(`aprobar-get:${clientIpFromRequest(request)}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Portal de aprobación no disponible: falta SUPABASE_SERVICE_ROLE_KEY.');
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  }
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: approvalRow } = await admin
    .from('order_approvals')
    .select('*')
    .eq('token', token)
    .single();

  if (!approvalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: invRow } = await admin
    .from('invoices').select('*').eq('id', approvalRow.invoice_id).single();
  if (!invRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: lineItemsRows } = await admin
    .from('invoice_line_items').select('*').eq('invoice_id', invRow.id).order('sort_order', { ascending: true });
  const { data: taxBreakdownRows } = await admin
    .from('invoice_tax_breakdown').select('*').eq('invoice_id', invRow.id);
  const { data: itemsRows } = await admin
    .from('order_approval_items').select('*').eq('approval_id', approvalRow.id);
  const { data: settingsRow } = await admin
    .from('company_settings').select('*').eq('user_id', invRow.user_id).limit(1).single();

  return NextResponse.json({
    approval: mapApprovalFromDb(approvalRow),
    invoice: mapInvoiceFromDb(invRow, lineItemsRows || [], taxBreakdownRows || []),
    items: (itemsRows || []).map((i: any) => ({
      id: i.id, approvalId: i.approval_id, lineItemId: i.line_item_id,
      accepted: i.accepted, adjustedQuantity: i.adjusted_quantity ? Number(i.adjusted_quantity) : null,
      rejectionReason: i.rejection_reason || '',
    })),
    companySettings: settingsRow ? mapSettingsFromDb(settingsRow) : null,
  });
}
```

Nota: `mapLineItemFromDb` se usa indirectamente dentro de `mapInvoiceFromDb` (que ya la llama internamente); se exporta igualmente por si se necesita suelta en el futuro — no generar lint warning de "no usada": si el linter se queja, quitar el import suelto y dejar solo los tres que se usan directamente.

**Paso 3: Crear la ruta POST — enviar respuesta del cliente**

```typescript
// facturacion-app/src/app/api/aprobar/[token]/respond/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

interface RespondBody {
  items: { lineItemId: string; accepted: boolean; adjustedQuantity?: number; rejectionReason?: string }[];
  clientMessage?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const allowed = await checkRateLimit(`aprobar-respond:${clientIpFromRequest(request)}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
  }

  let body: RespondBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Faltan items' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Portal de aprobación no disponible: falta SUPABASE_SERVICE_ROLE_KEY.');
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  }
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: approvalRow } = await admin
    .from('order_approvals').select('*').eq('token', token).single();

  if (!approvalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (approvalRow.status !== 'pending') {
    return NextResponse.json({ error: 'already_responded' }, { status: 409 });
  }
  if (new Date(approvalRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const itemRows = body.items.map(item => ({
    approval_id: approvalRow.id,
    line_item_id: item.lineItemId,
    accepted: item.accepted,
    adjusted_quantity: item.adjustedQuantity ?? null,
    rejection_reason: item.rejectionReason || '',
  }));
  await admin.from('order_approval_items').insert(itemRows);

  const allAccepted = body.items.every(i => i.accepted && !i.adjustedQuantity);
  const allRejected = body.items.every(i => !i.accepted);
  const status = allAccepted ? 'approved' : allRejected ? 'rejected' : 'partial';
  const invoiceStatus = allAccepted ? 'aprobado' : allRejected ? 'rechazado' : 'aprobado_parcial';

  await admin.from('order_approvals').update({
    status,
    client_message: body.clientMessage || '',
    responded_at: new Date().toISOString(),
  }).eq('id', approvalRow.id);

  await admin.from('invoices').update({
    status: invoiceStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', approvalRow.invoice_id);

  return NextResponse.json({ success: true });
}
```

**Paso 4: Actualizar la página pública para llamar a las nuevas rutas**

En `facturacion-app/src/app/aprobar/[token]/page.tsx`:

- Quitar el import `import { getApprovalByToken, submitApprovalResponse } from '@/lib/storage';`
- Sustituir el cuerpo del `useEffect` (línea 43-44) que llama a `getApprovalByToken(token)` por:

```typescript
      const res = await fetch(`/api/aprobar/${token}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const result = await res.json();
```

- Sustituir la llamada a `submitApprovalResponse(token, mapped, clientMessage)` (línea 104) por:

```typescript
    const res = await fetch(`/api/aprobar/${token}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: mapped, clientMessage }),
    });
    const ok = res.ok;
```

**Paso 5: Eliminar el código muerto en storage.ts**

Borrar de `facturacion-app/src/lib/storage.ts` las funciones `getApprovalByToken` y `submitApprovalResponse` completas (ya no las llama nadie tras el Paso 4 — confirmar con `grep -rn "getApprovalByToken\|submitApprovalResponse" src/` antes de borrar, debe dar cero resultados fuera de storage.ts).

**Paso 6: Verificación manual**

Con `npm run dev` y una fila de prueba en `order_approvals` (creada vía `createOrderApproval` desde la app autenticada, o a mano en el SQL Editor):
- `GET http://localhost:3000/api/aprobar/<token-real>` devuelve el JSON esperado.
- `GET http://localhost:3000/api/aprobar/token-que-no-existe` devuelve 404.
- La página `/aprobar/<token-real>` en el navegador sigue funcionando igual que antes (carga el pedido, permite aceptar/rechazar, enviar).
- Repetir la petición GET más de 30 veces en la misma hora devuelve 429 (verifica que el rate limit funciona).

**Paso 7: Commit**

```bash
git add src/app/api/aprobar src/app/aprobar/[token]/page.tsx src/lib/storage.ts
git commit -m "refactor: portal público de aprobación pasa por API routes con service role en vez de Supabase anónimo directo"
```

---

### Task 5: Rate limiting en subida de certificado y checkout público

**Archivos:**
- Modificar: `facturacion-app/src/app/api/verifactu/certificate/upload/route.ts`
- Modificar: `facturacion-app/src/app/api/stripe/checkout/route.ts`

**Paso 1:** En `certificate/upload/route.ts`, tras obtener `user` (después del check `if (!user)`), añadir:

```typescript
    const allowed = await checkRateLimit(`cert-upload:${user.id}`, 5, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Demasiadas subidas de certificado. Inténtalo de nuevo más tarde.' },
        { status: 429 }
      );
    }
```

y el import: `import { checkRateLimit } from '@/lib/rateLimit';`

**Paso 2:** En `stripe/checkout/route.ts`, justo después de leer `{ invoiceId, approvalToken }` del body, añadir (solo limita el flujo público, que es el expuesto a abuso anónimo):

```typescript
    if (typeof approvalToken === 'string' && approvalToken.length > 0) {
      const allowed = await checkRateLimit(`checkout-public:${clientIpFromRequest(request)}`, 10, 3600);
      if (!allowed) {
        return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
      }
    }
```

y el import: `import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';`. Como esta ruta recibe `Request` (no `NextRequest`), `clientIpFromRequest` funciona igual porque solo usa `.headers`.

**Paso 3: Verificación manual**

Subir un certificado de prueba 6 veces seguidas en menos de una hora desde `/verifactu` — la sexta debe devolver el error 429. Repetir el flujo de checkout público desde `/aprobar/[token]` no debería verse afectado en uso normal (10/hora es holgado para un cliente legítimo).

**Paso 4: Commit**

```bash
git add src/app/api/verifactu/certificate/upload/route.ts src/app/api/stripe/checkout/route.ts
git commit -m "feat: aplicar rate limiting a subida de certificado y checkout público"
```

---

### Task 6: Cabeceras de seguridad HTTP

**Archivos:**
- Modificar: `facturacion-app/next.config.ts`

**Paso 1: Implementación**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        // Todas las rutas salvo el portal público, que se embebe a
        // propósito en flujos de pago y no debe llevar X-Frame-Options
        // DENY si en el futuro se quiere permitir incrustarlo.
        source: '/((?!aprobar).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        source: '/aprobar/:path*',
        headers: [
          // El portal público SÍ necesita protección anti-clickjacking:
          // nadie debería poder incrustarlo en un iframe ajeno para
          // engañar al cliente y hacerle pagar/aprobar sin darse cuenta.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Paso 2: Verificación manual**

Run: `npm run dev`, luego `curl -sI http://localhost:3000/dashboard | grep -i x-frame` → debe mostrar `X-Frame-Options: DENY`. Igual para `curl -sI http://localhost:3000/aprobar/cualquier-token | grep -i x-frame` → debe mostrar `SAMEORIGIN`.

**Paso 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: añadir cabeceras de seguridad HTTP (X-Frame-Options, HSTS, etc.)"
```

---

### Task 7: Limpiar IndexedDB al cerrar sesión

**Contexto:** `resetAllData()` (en `storage.ts`) borra datos del servidor y es una acción explícita del usuario en Ajustes — no tocar. Lo que falta es limpiar la caché LOCAL (IndexedDB) al hacer logout, para que en un dispositivo compartido el siguiente usuario no vea datos de la empresa anterior mientras esté offline.

**Archivos:**
- Modificar: `facturacion-app/src/lib/offlineDb.ts`
- Modificar: `facturacion-app/src/components/layout/AccountMenu.tsx`

**Paso 1:** En `offlineDb.ts`, añadir (usando el `clearStore` ya existente):

```typescript
const ALL_STORE_NAMES = ['invoices', 'clients', 'products', 'settings', 'userProfiles', 'syncQueue', 'meta'];

/**
 * Limpia toda la caché local de IndexedDB. Se llama al cerrar sesión para
 * que un dispositivo compartido entre varias empresas no siga mostrando
 * datos de la sesión anterior mientras está offline.
 */
export async function clearOfflineCache(): Promise<void> {
  await Promise.all(ALL_STORE_NAMES.map(name => clearStore(name)));
}
```

**Paso 2:** En `AccountMenu.tsx`, importar `clearOfflineCache` desde `@/lib/offlineDb` y convertir el formulario de logout (línea 152-156) en un submit interceptado:

```tsx
              <form
                action="/auth/signout"
                method="post"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await clearOfflineCache();
                  e.currentTarget.submit();
                }}
              >
                <button type="submit" className="account-dropdown-item danger" style={{ width: '100%' }}>
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </form>
```

**Paso 3: Verificación manual**

En el navegador: iniciar sesión, dejar que se rellene la caché offline (abrir `/facturas` o `/clientes` para forzar la descarga a IndexedDB), abrir DevTools → Application → IndexedDB → `facturacion-offline` y confirmar que hay datos en `invoices`/`clients`. Cerrar sesión desde el menú de cuenta. Volver a abrir DevTools → IndexedDB → los stores deben estar vacíos.

**Paso 4: Commit**

```bash
git add src/lib/offlineDb.ts src/components/layout/AccountMenu.tsx
git commit -m "fix: limpiar caché IndexedDB local al cerrar sesión"
```

---

## Orden de ejecución recomendado

Task 0 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7. Las Tasks 1, 6 y 7 son independientes entre sí y de las demás (se pueden paralelizar). Las Tasks 3 y 4 dependen de la Task 2 (necesitan la migración aplicada) y la Task 3 (necesitan `checkRateLimit`). La Task 5 depende de la Task 3.

## Qué NO cubre este plan

Rate limiting real distribuido (esta implementación usa una tabla Postgres, correcta y suficiente para el volumen esperado, pero no es lo mismo que un limitador dedicado tipo Upstash si el tráfico creciera mucho), soporte de equipos/roles (Tier 2), tests más allá de la lógica pura extraída aquí (Tier 3, cobertura general), y la integración real con AEAT (Tier 1, ciclo aparte tras investigar la especificación oficial).
