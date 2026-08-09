# Precios + Suscripciones Stripe — Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use ejecutar-plan-paso-a-paso to implement this plan task-by-task.

**Goal:** Página pública `/precios` con 3 planes (Básico/Pro/Sin límite, mensual o anual) que se cobran vía Stripe Billing (suscripciones recurrentes), con el límite de facturas/mes de cada plan aplicado tanto en la UI como en la base de datos.

**Architecture:** Stripe Checkout en modo `subscription` (páginas alojadas por Stripe, no formularios de tarjeta propios) + Stripe Customer Portal para gestionar/cancelar. El estado de la suscripción vive en 4 columnas nuevas de `company_settings`, escritas únicamente por el webhook de Stripe (nunca por el cliente). El límite se aplica dos veces: en la UI (bloquea el botón antes de molestar al usuario) y en un trigger de Postgres (para que nadie lo salte llamando a la API REST de Supabase directamente) — mismo patrón que ya usan los triggers antifraude/cross-tenant de `migration_004`.

**Tech Stack:** Next.js (App Router) + Supabase (Postgres/RLS) + Stripe (`stripe` npm package, ya instalado) + vitest.

**Diseño previo:** `docs/plans/2026-08-08-precios-suscripciones-stripe-design.md` — léelo primero, ahí están las decisiones de producto (precios, límites, alcance).

---

### Task 1: Migración de base de datos — columnas de suscripción + límite

**Files:**
- Create: `facturacion-app/supabase/migration_005_suscripciones.sql`

**Contexto importante de la migración anterior (004):** en Supabase, `ALTER DEFAULT PRIVILEGES` concede `EXECUTE` a `anon`/`authenticated` automáticamente en toda función nueva del schema `public` — no es el `PUBLIC` de Postgres puro, así que `REVOKE ... FROM PUBLIC` **no sirve**, hay que revocar explícitamente `FROM anon, authenticated`. Ya nos costó dos migraciones de más descubrir esto — no lo repitas.

**Paso 1: Escribe la migración**

```sql
-- ============================================================
-- MIGRACIÓN 005: Suscripciones (planes de precio)
-- ============================================================

-- 1. Estado de suscripción en company_settings. No se crea una tabla
-- `subscriptions` aparte: la app es 1 usuario = 1 empresa = como mucho
-- 1 suscripción activa, y company_settings ya es la tabla de 1 fila por
-- usuario. Estas columnas las escribe SOLO el webhook de Stripe (service
-- role) — nunca pasan por saveCompanySettings ni por el cliente.
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 2. Cuántas facturas ha emitido el usuario este mes natural. Cuenta
-- todo lo que no sea un borrador descartable (un borrador sin emitir no
-- consume cupo).
CREATE OR REPLACE FUNCTION fn_monthly_invoice_count(p_user_id UUID)
RETURNS INT
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COUNT(*)::INT FROM public.invoices
  WHERE user_id = p_user_id
    AND status <> 'borrador'
    AND issue_date >= date_trunc('month', CURRENT_DATE)
    AND issue_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
$$;

-- 3. Límite por plan. Los números están duplicados a propósito en
-- src/lib/plans.ts (fuente de verdad para la UI) — si cambias un límite
-- de plan, cámbialo en los dos sitios. NULL = sin límite.
CREATE OR REPLACE FUNCTION fn_plan_invoice_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'basico' THEN 15
    WHEN 'pro' THEN 100
    WHEN 'sin_limite' THEN NULL
    ELSE 0  -- sin plan (o plan desconocido) = 0 facturas permitidas
  END;
$$;

-- 4. Trigger: rechaza el INSERT si no hay suscripción activa o si ya se
-- alcanzó el límite del mes. Defensa en profundidad — la UI ya evita
-- llegar aquí en el camino normal, esto es para quien se salte la UI.
CREATE OR REPLACE FUNCTION fn_check_subscription_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan TEXT;
  v_status TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  SELECT subscription_plan, subscription_status
    INTO v_plan, v_status
    FROM public.company_settings
    WHERE user_id = NEW.user_id;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SUSCRIPCION: no hay una suscripción activa. Ve a /precios.';
  END IF;

  v_limit := public.fn_plan_invoice_limit(v_plan);
  IF v_limit IS NOT NULL THEN
    v_count := public.fn_monthly_invoice_count(NEW.user_id);
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'SUSCRIPCION: límite de % facturas/mes alcanzado para el plan %.', v_limit, v_plan;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_check_subscription_limit ON invoices;
CREATE TRIGGER tr_check_subscription_limit
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.status <> 'borrador')
  EXECUTE FUNCTION fn_check_subscription_limit();

-- Solo las llama el trigger (SECURITY DEFINER, se ejecuta como el dueño).
-- Ver nota de arriba: FROM anon, authenticated, NO "FROM PUBLIC".
REVOKE EXECUTE ON FUNCTION fn_monthly_invoice_count(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_plan_invoice_limit(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_check_subscription_limit() FROM anon, authenticated;
```

**Step 2: Aplica la migración con el MCP de Supabase**

Usa la tool `mcp__supabase__apply_migration` con `name: "suscripciones"` y el contenido de arriba como `query`. (Es como se aplicaron las migraciones 004 en esta misma sesión — no hay CLI de Supabase configurada localmente.)

**Step 3: Verifica que el trigger bloquea sin suscripción**

Ejecuta con `mcp__supabase__execute_sql` (usa un `user_id` real de `auth.users` y revierte con ROLLBACK si tu cliente SQL lo soporta, o borra la fila de prueba después):

```sql
-- Debe fallar con el mensaje "no hay una suscripción activa"
INSERT INTO invoices (id, user_id, number, series, client_name, issue_date, due_date, status)
VALUES (gen_random_uuid(), '<tu-user-id>', 'TEST-001', 'FAC', 'Cliente Test', CURRENT_DATE, CURRENT_DATE, 'emitida');
```

Expected: `ERROR: SUSCRIPCION: no hay una suscripción activa. Ve a /precios.`

**Step 4: Verifica los grants (igual que hicimos para migration_004)**

```sql
SELECT p.proname, r.rolname, pg_catalog.has_function_privilege(r.rolname, p.oid, 'EXECUTE')
FROM pg_proc p, pg_roles r
WHERE p.proname IN ('fn_monthly_invoice_count','fn_plan_invoice_limit','fn_check_subscription_limit')
AND r.rolname IN ('anon','authenticated');
```

Expected: todas las filas `false`.

---

### Task 2: Configuración de planes compartida (TypeScript)

**Files:**
- Create: `src/lib/plans.ts`
- Test: `src/lib/plans.test.ts`

**Step 1: Escribe el test que falla**

```typescript
import { describe, it, expect } from 'vitest';
import { PLANS, getPlan, ANNUAL_MONTHS_FREE } from './plans';

describe('plans', () => {
  it('el precio anual es 10x el mensual (2 meses gratis) en los tres planes', () => {
    for (const plan of PLANS) {
      expect(plan.priceAnnual).toBe(plan.priceMonthly * 10);
    }
  });

  it('getPlan devuelve el plan por id', () => {
    expect(getPlan('pro')?.invoiceLimit).toBe(100);
  });

  it('getPlan devuelve undefined para un id desconocido', () => {
    expect(getPlan('inventado')).toBeUndefined();
  });

  it('"sin_limite" no tiene tope de facturas', () => {
    expect(getPlan('sin_limite')?.invoiceLimit).toBeNull();
  });

  it('ANNUAL_MONTHS_FREE es 2, consistente con el 10x', () => {
    expect(ANNUAL_MONTHS_FREE).toBe(2);
  });
});
```

**Step 2: Ejecuta y confirma que falla**

Run: `npm test -- plans.test.ts`
Expected: FAIL (`Cannot find module './plans'`)

**Step 3: Implementa `src/lib/plans.ts`**

```typescript
export type PlanId = 'basico' | 'pro' | 'sin_limite';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  invoiceLimit: number | null; // null = sin límite
  featured: boolean;
  stripePriceEnvMonthly: string;
  stripePriceEnvAnnual: string;
}

export const ANNUAL_MONTHS_FREE = 2;

// OJO: si cambias priceMonthly/invoiceLimit aquí, cambia también
// fn_plan_invoice_limit en migration_005_suscripciones.sql — no hay
// una fuente de verdad única entre Postgres y TypeScript para esto.
export const PLANS: Plan[] = [
  {
    id: 'basico', name: 'Básico',
    priceMonthly: 49, priceAnnual: 490,
    invoiceLimit: 15, featured: false,
    stripePriceEnvMonthly: 'STRIPE_PRICE_BASICO_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_BASICO_ANUAL',
  },
  {
    id: 'pro', name: 'Pro',
    priceMonthly: 79, priceAnnual: 790,
    invoiceLimit: 100, featured: true,
    stripePriceEnvMonthly: 'STRIPE_PRICE_PRO_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_PRO_ANUAL',
  },
  {
    id: 'sin_limite', name: 'Sin límite',
    priceMonthly: 119, priceAnnual: 1190,
    invoiceLimit: null, featured: false,
    stripePriceEnvMonthly: 'STRIPE_PRICE_SINLIMITE_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_SINLIMITE_ANUAL',
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find(p => p.id === id);
}
```

**Step 4: Ejecuta y confirma que pasa**

Run: `npm test -- plans.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/plans.ts src/lib/plans.test.ts facturacion-app/supabase/migration_005_suscripciones.sql
git commit -m "feat: definir planes de suscripción y límite de facturas por plan"
```

---

### Task 3: Script de creación de Products/Prices en Stripe

**Files:**
- Create: `scripts/setup-stripe-plans.mjs`

No añadas `ts-node`/`tsx` como dependencia solo para esto — Node ejecuta `.mjs` nativo y ya soporta `--env-file` (Node ≥20.6, y este proyecto ya requiere Node moderno para Next 16).

**Step 1: Escribe el script**

```javascript
// Ejecutar UNA VEZ por entorno (test y luego live) para crear los
// Products/Prices de Stripe. Imprime las variables de entorno a copiar
// a .env.local — Stripe no permite "leer" precios por nombre después,
// así que guarda esta salida.
import Stripe from 'stripe';
import { PLANS } from '../src/lib/plans.ts';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28' });

for (const plan of PLANS) {
  const product = await stripe.products.create({ name: `Plan ${plan.name}` });

  const monthly = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: plan.priceMonthly * 100,
    recurring: { interval: 'month' },
  });

  const annual = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: plan.priceAnnual * 100,
    recurring: { interval: 'year' },
  });

  console.log(`${plan.stripePriceEnvMonthly}=${monthly.id}`);
  console.log(`${plan.stripePriceEnvAnnual}=${annual.id}`);
}
```

Nota: este script importa `plans.ts` (TypeScript) desde un `.mjs`. Node no
transpila TS de forma nativa. Si al ejecutar falla el `import`, la
alternativa sin dependencias nuevas es copiar los 3 objetos de `PLANS` a
mano dentro de este script en JS plano — es un script de un solo uso, la
duplicación puntual aquí es aceptable (YAGNI: no merece la pena montar un
paso de build para un script que se ejecuta dos veces en la vida del
proyecto).

**Step 2: Ejecútalo contra tu cuenta de test de Stripe**

Run: `node --env-file=.env.local scripts/setup-stripe-plans.mjs`
Expected: imprime 6 líneas `STRIPE_PRICE_..._..=price_...`

**Step 3: Copia esas 6 líneas a `.env.local`**

**Step 4: Actualiza `.env.example`** documentando las 6 variables nuevas (secretas, solo servidor, igual que `STRIPE_SECRET_KEY`).

**Step 5: Commit**

```bash
git add scripts/setup-stripe-plans.mjs facturacion-app/.env.example
git commit -m "chore: script para crear los planes de suscripción en Stripe"
```

(No hay commit de `.env.local` — está en `.gitignore`.)

---

### Task 4: Tipos + lectura de ajustes de suscripción

**Files:**
- Modify: `src/lib/types.ts` (bloque `CompanySettings`, junto a los campos de Stripe existentes)
- Modify: `src/lib/storage.ts:997` (`mapSettingsFromDb`)
- Modify: `src/lib/storage.ts` (nueva función `getInvoiceQuota`, cerca de `getInvoices`)

**Step 1: Añade los campos al tipo**

En `src/lib/types.ts`, dentro de `CompanySettings`, junto a `stripePublishableKey`:

```typescript
  // Suscripción (solo lectura desde el cliente: la escribe el webhook)
  subscriptionPlan?: 'basico' | 'pro' | 'sin_limite' | null;
  subscriptionStatus?: 'active' | 'past_due' | 'canceled' | null;
```

(`stripeCustomerId`/`stripeSubscriptionId` NO hacen falta en el tipo del cliente — son detalles de servidor que la UI nunca necesita mostrar ni leer.)

**Step 2: Mapea las columnas en `mapSettingsFromDb`**

Añade dentro del `return { ... }` de `mapSettingsFromDb` (`src/lib/storage.ts:997`):

```typescript
    subscriptionPlan: s.subscription_plan || null,
    subscriptionStatus: s.subscription_status || null,
```

**Step 3: Añade `getInvoiceQuota`**

Cerca de `getInvoices` en `storage.ts`:

```typescript
export interface InvoiceQuota {
  plan: 'basico' | 'pro' | 'sin_limite' | null;
  active: boolean;
  limit: number | null; // null = sin límite
  used: number;
  canCreate: boolean;
}

export async function getInvoiceQuota(): Promise<InvoiceQuota> {
  const settings = await getCompanySettings();
  const plan = settings.subscriptionPlan ?? null;
  const active = settings.subscriptionStatus === 'active';
  const limit = plan ? getPlan(plan)?.invoiceLimit ?? 0 : 0;

  if (!active) return { plan, active, limit, used: 0, canCreate: false };
  if (limit === null) return { plan, active, limit, used: 0, canCreate: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase()
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'borrador')
    .gte('issue_date', startOfMonth.toISOString().split('T')[0]);

  const used = count ?? 0;
  return { plan, active, limit, used, canCreate: used < limit };
}
```

Añade `import { getPlan } from './plans';` arriba del fichero.

**Step 4: Verifica que compila y no rompe nada existente**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: todos los tests existentes + los de `plans.test.ts` en verde.

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/storage.ts
git commit -m "feat: leer estado de suscripción y calcular cupo de facturas"
```

---

### Task 5: Ruta API — iniciar Checkout de suscripción

**Files:**
- Create: `src/app/api/stripe/subscribe/route.ts`

**Step 1: Implementa la ruta**

Sigue el mismo estilo que `src/app/api/stripe/checkout/route.ts` (ya existente): importar `Stripe`, `createClient` del servidor, `checkRateLimit`.

```typescript
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getPlan, PlanId } from '@/lib/plans';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

const STRIPE_API_VERSION = '2026-01-28';

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`subscribe:${clientIpFromRequest(request)}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
  }

  const { planId, interval } = await request.json();
  const plan = getPlan(planId);
  if (!plan || (interval !== 'month' && interval !== 'year')) {
    return NextResponse.json({ error: 'Plan o periodicidad no válidos' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // El frontend interpreta este código para mandar a /login?next=/precios
    return NextResponse.json({ error: 'No autenticado', requiresLogin: true }, { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 500 });
  }
  const priceId = process.env[interval === 'month' ? plan.stripePriceEnvMonthly : plan.stripePriceEnvAnnual];
  if (!priceId) {
    return NextResponse.json({ error: `Falta el Price de Stripe para ${plan.id}/${interval}` }, { status: 500 });
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
  const baseUrl = new URL(request.url).origin;

  const { data: settings } = await supabase.from('company_settings').select('stripe_customer_id').eq('user_id', user.id).single();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: settings?.stripe_customer_id || undefined,
    customer_email: settings?.stripe_customer_id ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    success_url: `${baseUrl}/dashboard?subscribed=true`,
    cancel_url: `${baseUrl}/precios?cancelled=true`,
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 2: Verificación manual (no hay test automático — igual que el resto de rutas Stripe de este repo, que se prueban con Stripe test mode, no con mocks)**

Con `npm run dev` y `stripe listen --forward-to localhost:3000/api/stripe/webhook` corriendo, haz `POST` a `/api/stripe/subscribe` con sesión iniciada y confirma que devuelve una `url` de `checkout.stripe.com`.

**Step 3: Commit**

```bash
git add src/app/api/stripe/subscribe/route.ts
git commit -m "feat: ruta para iniciar el checkout de suscripción"
```

---

### Task 6: Webhook — manejar eventos de suscripción

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

**Step 1: Distingue el modo de la sesión en `checkout.session.completed`**

El bloque actual (`if (event.type === 'checkout.session.completed')`) asume siempre modo `payment` (pago de una factura). Reemplázalo por una rama por `session.mode`:

```typescript
if (event.type === 'checkout.session.completed') {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode === 'subscription') {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (userId && planId && session.customer && session.subscription) {
      await admin.from('company_settings').update({
        subscription_plan: planId,
        subscription_status: 'active',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      }).eq('user_id', userId);
    }
    return NextResponse.json({ received: true });
  }

  // ... resto del bloque existente de pago de factura, sin cambios
}

if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.userId;
  if (userId) {
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : (sub.status === 'active' ? 'active' : 'past_due');
    await admin.from('company_settings').update({ subscription_status: status }).eq('user_id', userId);
  }
  return NextResponse.json({ received: true });
}
```

`admin` ya existe en el fichero para el flujo de pago de facturas — reutilízalo, no crees un segundo cliente.

**Step 2: Registra los eventos nuevos en Stripe**

En el checklist ya existente dentro de ese mismo fichero (comentario "CHECKLIST DE PUESTA EN PRODUCCIÓN"), añade `customer.subscription.updated` y `customer.subscription.deleted` a la lista de eventos a escuchar en el endpoint del dashboard, junto al ya existente `checkout.session.completed`.

**Step 3: Verificación manual con Stripe CLI**

```
stripe trigger checkout.session.completed
```

No sirve directamente (no trae `mode: subscription` ni metadata realista) — la verificación real es el flujo completo end-to-end del Task 8, con una suscripción de verdad en test mode.

**Step 4: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat: webhook procesa altas y cambios de suscripción"
```

---

### Task 7: Página pública `/precios`

**Files:**
- Create: `src/app/precios/page.tsx`

**Step 1: Implementa la página**

- `'use client'`, importa `PLANS` de `@/lib/plans`.
- Estado local `interval: 'month' | 'year'` con un toggle.
- 3 tarjetas (`.map(PLANS)`), la de `plan.featured` con una clase/borde distintivo.
- Botón "Suscribirme" por tarjeta → `fetch('/api/stripe/subscribe', { method: 'POST', body: JSON.stringify({ planId: plan.id, interval }) })`.
  - Si la respuesta es 401 con `requiresLogin: true` → `router.push('/login?next=/precios')`.
  - Si es 200 → `window.location.href = data.url`.
- Sin sidebar/layout autenticado: esta ruta debe quedar fuera del layout de `/dashboard` — comprueba cómo `/login` y `/aprobar/[token]` evitan el layout autenticado (probablemente un `layout.tsx` distinto o condicional a nivel de `src/app/layout.tsx`) y sigue el mismo patrón para que `/precios` no muestre el sidebar de la app.

**Step 2: Prueba manual en el navegador**

`npm run dev` → abre `http://localhost:3000/precios` sin sesión iniciada → deben verse las 3 tarjetas, el toggle mensual/anual debe cambiar los precios mostrados, y "Suscribirme" sin sesión debe mandarte a `/login`.

**Step 3: Commit**

```bash
git add src/app/precios/page.tsx
git commit -m "feat: página pública de precios"
```

---

### Task 8: Bloqueo al crear factura + gestión de suscripción en Ajustes

**Files:**
- Modify: `src/app/facturas/nueva/page.tsx` (mismo patrón que ya usa `getOnboardingStatus` en este fichero)
- Create: `src/app/api/stripe/portal/route.ts`
- Modify: `src/app/ajustes/page.tsx`

**Step 1: Gate en "Nueva factura"**

En `NuevaFacturaPage`, junto a la comprobación de onboarding ya existente, añade una llamada a `getInvoiceQuota()`. Si `!quota.canCreate`, renderiza un aviso (reutiliza el patrón visual de `getOnboardingStatus` si ya bloquea el formulario de forma similar) con: "Has alcanzado el límite de tu plan" o "No tienes una suscripción activa", y un `<Link href="/precios">Ver planes</Link>`.

**Step 2: Ruta del Customer Portal**

```typescript
// src/app/api/stripe/portal/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: settings } = await supabase.from('company_settings').select('stripe_customer_id').eq('user_id', user.id).single();
  if (!settings?.stripe_customer_id) {
    return NextResponse.json({ error: 'No tienes ninguna suscripción todavía' }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28' as Stripe.LatestApiVersion });
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: settings.stripe_customer_id,
    return_url: `${new URL(request.url).origin}/ajustes`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

**Step 3: Sección en Ajustes**

En `ajustes/page.tsx`, junto a la sección "Cobros con Stripe" ya existente, añade una nueva sección "Tu plan" que muestre `settings.subscriptionPlan`/`subscriptionStatus` y un botón "Gestionar suscripción" que llame a `/api/stripe/portal` y redirija a `data.url`.

**Step 4: Verificación**

`npx tsc --noEmit` y `npm run lint` sin errores nuevos. Prueba manual: con una suscripción activa de test, "Gestionar suscripción" debe abrir el portal real de Stripe.

**Step 5: Commit**

```bash
git add src/app/facturas/nueva/page.tsx src/app/api/stripe/portal/route.ts src/app/ajustes/page.tsx
git commit -m "feat: bloquear facturación sin cupo y gestionar suscripción desde Ajustes"
```

---

### Task 9: Verificación end-to-end manual (Stripe test mode)

No hay forma razonable de automatizar esto sin un entorno de test de Stripe simulado (no existe en este repo hoy, y montarlo sería un proyecto en sí mismo — YAGNI para 3 planes). Verificación manual obligatoria antes de dar la funcionalidad por terminada:

1. `npm run dev` en una terminal, `stripe listen --forward-to localhost:3000/api/stripe/webhook` en otra (copia el `whsec_` que imprime a `STRIPE_WEBHOOK_SECRET` si ha cambiado desde la última vez).
2. Crea una cuenta nueva en `/login` (modo registro).
3. Ve a `/facturas/nueva` → debe bloquear con el aviso de "sin suscripción activa".
4. Ve a `/precios` → elige "Básico" mensual → tarjeta de test `4242 4242 4242 4242`, cualquier fecha futura/CVC.
5. Tras volver a `/dashboard`, comprueba en Supabase (`company_settings`) que `subscription_status = 'active'` y `subscription_plan = 'basico'`.
6. Vuelve a `/facturas/nueva` → ya debe dejar crear.
7. Crea 15 facturas (o baja el límite temporalmente en la migración para probarlo más rápido) → la 16ª debe bloquear en la UI.
8. Fuerza el intento directo contra Supabase (INSERT manual como en el Task 1, paso 3) para confirmar que el trigger también bloquea aunque se salte la UI.
9. Desde Ajustes → "Gestionar suscripción" → cancela en el portal de Stripe → confirma que el webhook pone `subscription_status = 'canceled'` y que `/facturas/nueva` vuelve a bloquear.

---

## Execution Handoff

Plan guardado en `docs/plans/2026-08-08-precios-suscripciones-stripe-implementation.md`.
