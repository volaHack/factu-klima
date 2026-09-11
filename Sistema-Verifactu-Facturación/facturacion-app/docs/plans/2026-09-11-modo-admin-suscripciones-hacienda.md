# Modo administradora, suscripciones y Hacienda — plan de implementación

> **Para Claude:** SUB-SKILL OBLIGATORIA: usar `ejecutar-plan-paso-a-paso` (sesión aparte) o `desarrollo-con-subagentes` (esta sesión) para ejecutar este plan tarea a tarea.

**Objetivo:** que el plan y el estado de cada cuenta sólo los decida Stripe o la administradora, dar a Elena un panel `/admin` protegido con 2FA, y facturar solos los cobros de la plataforma dejando el 420 y el 130 preparados.

**Arquitectura:** dos tablas nuevas que ningún usuario puede escribir (`administradores`, `suscripciones`) pasan a ser la única fuente de verdad del plan; el webhook de Stripe y la API de administración escriben con la service role. El panel son páginas de servidor bajo `src/app/(app)/admin/` que verifican admin + `aal2` antes de leer nada. Los cobros se convierten en facturas de la cuenta de Elena con una función SQL que numera, inserta y emite en una sola transacción; el sellado Veri*Factu sigue siendo el trigger de siempre.

**Stack:** Next 16.3 (App Router, `proxy.ts`, route handlers con `params` como Promise), Supabase (`@supabase/ssr`, service role, MFA TOTP), Stripe SDK 22.4 (API `2026-07-29.dahlia`), Vitest 4.

**Diseño:** `docs/plans/2026-09-11-modo-admin-suscripciones-hacienda-design.md`.

---

## Antes de empezar

- Leer `AGENTS.md`: Next 16 no es el que conoces. Guías útiles en `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (sección «Creating a Data Access Layer») y `01-getting-started/15-route-handlers.md`.
- Las migraciones se guardan en `supabase/migration_0NN_*.sql` **y** se aplican con la herramienta MCP `apply_migration` (quedan registradas en `supabase_migrations.schema_migrations`; la última es la 038). Número siguiente: **039**.
- Los rechazos cuyo mensaje empieza por `ANTIFRAUDE:` o `SUSCRIPCION:` son definitivos: no se reintentan.
- En Stripe v22 (`dahlia`) el fin de periodo está en cada elemento (`sub.items.data[i].current_period_end`), no en la suscripción, y la suscripción de una factura está en `invoice.parent?.subscription_details?.subscription`.
- Comandos: `npm test` (vitest), `npx tsc --noEmit -p .`, `npx eslint <ficheros>`.
- Commits: sólo las rutas tocadas (`git add -- ruta…`). La raíz del repo es `C:/Users/volit/Documents` y está llena de ficheros personales.

---

# FASE 1 — Cerrar los agujeros y crear el rol

### Tarea 1: tabla `administradores` y `soy_admin()`

**Ficheros:**
- Crear: `supabase/migration_039_administradores.sql`

**Paso 1: escribir la migración**

```sql
-- ============================================================
-- MIGRACIÓN 039: rol de administradora de la plataforma
--
-- Hasta ahora «admin» era un email escrito a mano en storage.ts, en el
-- trigger de límite y en la migración 005. Ahora es una fila en una
-- tabla que nadie puede leer ni escribir desde la API pública: sólo se
-- rellena desde el editor SQL de Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.administradores (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota      TEXT
);

ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: ni lectura ni escritura desde la API.
REVOKE ALL ON public.administradores FROM anon, authenticated;

-- Para el servidor y los triggers: ¿es admin este usuario?
CREATE OR REPLACE FUNCTION public.es_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.administradores WHERE user_id = p_uid);
$$;
REVOKE EXECUTE ON FUNCTION public.es_admin(UUID) FROM PUBLIC, anon, authenticated;

-- Para el navegador: sólo se puede preguntar por uno mismo, así nadie
-- sondea qué otras cuentas son admin.
CREATE OR REPLACE FUNCTION public.soy_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.es_admin(auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.soy_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soy_admin() TO authenticated;
```

**Paso 2: aplicarla** con `apply_migration` (nombre `admin_039_administradores`, contenido del fichero).

**Paso 3: comprobar que un usuario normal no la ve** (`execute_sql`):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.administradores;  -- Esperado: ERROR permission denied
ROLLBACK;
```

**Paso 4: alta de Elena — LA HACE ELLA** (o lo confirma por escrito antes de ejecutarlo), en el editor SQL de Supabase:

```sql
INSERT INTO public.administradores (user_id, nota)
SELECT id, 'Propietaria de la plataforma'
FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com';
```

Comprobar: `SELECT public.es_admin(id) FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com';` → `true`.

**Paso 5: commit**

```bash
git add -- facturacion-app/supabase/migration_039_administradores.sql
git commit -m "feat(admin): tabla de administradores que no se escribe desde la app"
```

---

### Tarea 2: tablas `suscripciones`, `stripe_eventos` y `admin_registro`

**Ficheros:**
- Crear: `supabase/migration_040_suscripciones.sql`

**Paso 1: escribir la migración**

```sql
-- ============================================================
-- MIGRACIÓN 040: la suscripción sale de company_settings
--
-- El plan vivía en company_settings, que el propio usuario puede
-- actualizar (política settings_user_policy): desde Ajustes cualquiera
-- se ponía «Sin límite» activo sin pagar, y el trigger de límite se lo
-- creía. Ahora vive aquí, el usuario sólo la LEE, y escriben el webhook
-- de Stripe y la API de administración con la service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suscripciones (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  origen                 TEXT NOT NULL CHECK (origen IN ('stripe', 'cortesia')),
  plan_id                TEXT NOT NULL CHECK (plan_id IN ('basico', 'pro', 'sin_limite')),
  estado                 TEXT NOT NULL CHECK (estado IN ('active', 'past_due', 'canceled', 'inactive')),
  intervalo              TEXT CHECK (intervalo IN ('month', 'year')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  periodo_fin            TIMESTAMPTZ,
  cancela_al_final       BOOLEAN NOT NULL DEFAULT false,
  cortesia_hasta         DATE,
  motivo                 TEXT,
  -- `created` del último evento de Stripe aplicado: los eventos pueden
  -- llegar desordenados y uno viejo no debe pisar a uno nuevo.
  stripe_evento_creado   BIGINT,
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cortesia_con_fecha_y_motivo
    CHECK (origen <> 'cortesia' OR (cortesia_hasta IS NOT NULL AND coalesce(trim(motivo), '') <> ''))
);

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY suscripciones_leer_la_propia ON public.suscripciones
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.suscripciones FROM anon, authenticated;

-- Cada evento de Stripe, una vez. Y el rastro de lo que no se pudo hacer.
CREATE TABLE IF NOT EXISTS public.stripe_eventos (
  id           TEXT PRIMARY KEY,
  tipo         TEXT NOT NULL,
  recibido_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  procesado_en TIMESTAMPTZ,
  error        TEXT
);
ALTER TABLE public.stripe_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_eventos FROM anon, authenticated;

-- Lo que hace la administradora, sin posibilidad de borrarlo.
CREATE TABLE IF NOT EXISTS public.admin_registro (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id  UUID NOT NULL REFERENCES auth.users(id),
  accion    TEXT NOT NULL,
  cuenta_id UUID REFERENCES auth.users(id),
  detalle   JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo    TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_registro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_registro FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_admin_registro_inmutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'ANTIFRAUDE: el registro de administración no se modifica ni se borra.'
    USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS tr_admin_registro_inmutable ON public.admin_registro;
CREATE TRIGGER tr_admin_registro_inmutable
  BEFORE UPDATE OR DELETE ON public.admin_registro
  FOR EACH ROW EXECUTE FUNCTION public.fn_admin_registro_inmutable();

-- Volcado. En Stripe no hay ninguna suscripción (modo pruebas, 0 cobros),
-- así que toda cuenta «activa» lo es sin haber pagado: pasa a cortesía de
-- 30 días y Elena decide desde el panel. Las admins no necesitan fila.
INSERT INTO public.suscripciones (user_id, origen, plan_id, estado, stripe_customer_id, cortesia_hasta, motivo)
SELECT DISTINCT ON (cs.user_id)
  cs.user_id, 'cortesia',
  CASE WHEN COALESCE(cs.subscription_plan, cs.plan_id) IN ('basico', 'pro', 'sin_limite')
       THEN COALESCE(cs.subscription_plan, cs.plan_id) ELSE 'basico' END,
  'active', cs.stripe_customer_id,
  (now() + interval '30 days')::date,
  'Activada sin cobro antes del cambio de septiembre de 2026'
FROM public.company_settings cs
WHERE cs.subscription_status = 'active'
  AND NOT public.es_admin(cs.user_id)
ORDER BY cs.user_id, cs.updated_at DESC NULLS LAST
ON CONFLICT (user_id) DO NOTHING;
```

**Paso 2: aplicar** (`admin_040_suscripciones`). **Requisito:** Tarea 1 paso 4 hecho, o la cuenta de Elena recibirá una cortesía que no le hace falta (inofensivo, pero sobra).

**Paso 3: comprobar RLS** (`execute_sql`, sustituyendo el uuid por el de cualquier cuenta de prueba):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<UUID>","role":"authenticated"}', true);
SELECT count(*) FROM public.suscripciones;                    -- Esperado: 0 ó 1 (sólo la suya)
UPDATE public.suscripciones SET plan_id = 'sin_limite';        -- Esperado: ERROR permission denied
INSERT INTO public.admin_registro (admin_id, accion) VALUES ('<UUID>', 'x'); -- Esperado: ERROR
ROLLBACK;
```

Y `SELECT origen, plan_id, estado, cortesia_hasta FROM public.suscripciones;` → las 2 cuentas que estaban activas, como cortesía.

**Paso 4: commit** (`git add -- facturacion-app/supabase/migration_040_suscripciones.sql`, mensaje `feat(suscripciones): el plan sale de company_settings y el usuario sólo lo lee`).

---

### Tarea 3: el trigger de límite lee `suscripciones`

**Ficheros:**
- Crear: `supabase/migration_041_limite_desde_suscripciones.sql`

**Paso 1: escribir la migración**

```sql
-- ============================================================
-- MIGRACIÓN 041: el límite de emisión se fía de `suscripciones`
--
-- Antes leía company_settings (que el usuario escribe) y tenía el email
-- de la propietaria escrito a mano. `past_due` sigue emitiendo: Stripe
-- está reintentando el cobro, y cortar la facturación de un cliente por
-- una tarjeta caducada un día es peor que esperar a que Stripe cancele.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit()
RETURNS TRIGGER SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_already_sealed BOOLEAN;
  s                public.suscripciones%ROWTYPE;
  v_limit          INT;
  v_count          INT;
BEGIN
  SELECT sealed_at IS NOT NULL INTO v_already_sealed
    FROM public.invoices WHERE id = NEW.id;
  IF v_already_sealed THEN
    RETURN NEW;
  END IF;

  IF public.es_admin(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.suscripciones WHERE user_id = NEW.user_id;

  IF NOT FOUND
     OR s.estado NOT IN ('active', 'past_due')
     OR (s.origen = 'cortesia' AND s.cortesia_hasta < current_date) THEN
    RAISE EXCEPTION 'SUSCRIPCION: no hay una suscripción activa. Ve a /precios.';
  END IF;

  v_limit := public.fn_plan_invoice_limit(s.plan_id);
  IF v_limit IS NOT NULL THEN
    v_count := public.fn_monthly_invoice_count(NEW.user_id);
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'SUSCRIPCION: límite de % facturas/mes alcanzado para el plan %.', v_limit, s.plan_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.fn_check_subscription_limit() FROM PUBLIC, anon, authenticated;

-- Facturas selladas este mes por cuenta, para el panel. Sólo service role.
CREATE OR REPLACE FUNCTION public.admin_facturas_mes()
RETURNS TABLE (user_id UUID, facturas BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.user_id, count(*)
  FROM public.invoices i
  WHERE i.sealed_at >= date_trunc('month', now())
    AND i.status <> 'anulada'
  GROUP BY i.user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_facturas_mes() FROM PUBLIC, anon, authenticated;
```

**Paso 2: aplicar** (`admin_041_limite_desde_suscripciones`).

**Paso 3: comprobar** que `pg_get_functiondef('public.fn_check_subscription_limit'::regproc)` ya no contiene `volitancrooss` ni `company_settings`.

**Paso 4:** `npm test -- plans` → PASS (el test de `plans.test.ts` lee `fn_plan_invoice_limit`, que no se toca).

**Paso 5: commit** (`feat(suscripciones): el límite de emisión deja de fiarse de company_settings`).

---

### Tarea 4: `estadoEfectivo` — qué significa «activa»

**Ficheros:**
- Crear: `src/lib/suscripcion.ts`
- Test: `src/lib/suscripcion.test.ts`

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { estadoEfectivo, type FilaSuscripcion } from './suscripcion';

const base: FilaSuscripcion = {
  origen: 'stripe', plan_id: 'pro', estado: 'active',
  cortesia_hasta: null, periodo_fin: null, cancela_al_final: false,
};
const hoy = new Date('2026-09-11T10:00:00Z');

describe('estadoEfectivo', () => {
  it('sin fila no hay suscripción', () => {
    expect(estadoEfectivo(null, hoy)).toEqual({ activa: false, planId: null, origen: null });
  });
  it('Stripe activa', () => {
    expect(estadoEfectivo(base, hoy)).toMatchObject({ activa: true, planId: 'pro', origen: 'stripe' });
  });
  it('past_due sigue activa mientras Stripe reintenta', () => {
    expect(estadoEfectivo({ ...base, estado: 'past_due' }, hoy).activa).toBe(true);
  });
  it('cancelada no', () => {
    expect(estadoEfectivo({ ...base, estado: 'canceled' }, hoy).activa).toBe(false);
  });
  it('cortesía vigente hasta el mismo día incluido', () => {
    const c = { ...base, origen: 'cortesia' as const, cortesia_hasta: '2026-09-11' };
    expect(estadoEfectivo(c, hoy).activa).toBe(true);
  });
  it('cortesía caducada no, y dice cuándo terminó', () => {
    const c = { ...base, origen: 'cortesia' as const, cortesia_hasta: '2026-09-10' };
    const e = estadoEfectivo(c, hoy);
    expect(e.activa).toBe(false);
    expect(e.motivoInactiva).toContain('2026-09-10');
  });
});
```

**Paso 2:** `npm test -- suscripcion` → FAIL («Cannot find module './suscripcion'»).

**Paso 3: implementación**

```ts
import type { PlanId } from './plans';

/** Una fila de `public.suscripciones`, con lo que hace falta para decidir. */
export interface FilaSuscripcion {
  origen: 'stripe' | 'cortesia';
  plan_id: PlanId;
  estado: 'active' | 'past_due' | 'canceled' | 'inactive';
  cortesia_hasta: string | null;
  periodo_fin: string | null;
  cancela_al_final: boolean;
}

export interface EstadoSuscripcion {
  activa: boolean;
  planId: PlanId | null;
  origen: 'stripe' | 'cortesia' | null;
  motivoInactiva?: string;
}

/**
 * El mismo criterio que `fn_check_subscription_limit` (migración 041):
 * `past_due` cuenta como activa y una cortesía vale hasta su último día
 * incluido. Si cambia uno, cambia el otro.
 */
export function estadoEfectivo(fila: FilaSuscripcion | null, hoy: Date = new Date()): EstadoSuscripcion {
  if (!fila) return { activa: false, planId: null, origen: null };

  const { origen, plan_id: planId } = fila;
  if (fila.estado !== 'active' && fila.estado !== 'past_due') {
    return { activa: false, planId, origen, motivoInactiva: 'La suscripción está cancelada.' };
  }
  if (origen === 'cortesia' && fila.cortesia_hasta && fila.cortesia_hasta < hoy.toISOString().slice(0, 10)) {
    return { activa: false, planId, origen, motivoInactiva: `La cortesía terminó el ${fila.cortesia_hasta}.` };
  }
  return { activa: true, planId, origen };
}
```

**Paso 4:** `npm test -- suscripcion` → PASS (6 tests).

**Paso 5: commit** (`git add -- facturacion-app/src/lib/suscripcion.ts facturacion-app/src/lib/suscripcion.test.ts`, `feat(suscripciones): un solo criterio de «activa» para UI y base de datos`).

---

### Tarea 5: `getCompanySettings` deja de inventarse el plan

**Ficheros:**
- Modificar: `src/lib/storage.ts:2731-2741` (bloque del email) y `src/lib/storage.ts:2857-2859` (escritura de las columnas de plan)

**Paso 1:** sustituir el bloque `try { … email === 'volitancrooss@gmail.com' … } catch {}` por:

```ts
  // El plan lo deciden Stripe y la administradora, y vive en
  // `suscripciones`, que el usuario sólo puede leer (migración 040).
  // Antes aquí se forzaba 'inactive' a todo el que no fuera la propietaria:
  // un cliente que pagaba veía «Sin suscripción». Sin conexión se queda lo
  // que hubiera en caché.
  try {
    const [{ data: fila }, { data: esAdmin }] = await Promise.all([
      supabase()
        .from('suscripciones')
        .select('origen, plan_id, estado, cortesia_hasta, periodo_fin, cancela_al_final')
        .maybeSingle(),
      supabase().rpc('soy_admin'),
    ]);
    if (esAdmin) {
      settings.planId = 'sin_limite';
      settings.subscriptionStatus = 'active';
    } else {
      const estado = estadoEfectivo(fila as FilaSuscripcion | null);
      settings.planId = estado.planId ?? settings.planId;
      settings.subscriptionStatus = estado.activa ? 'active' : 'inactive';
    }
  } catch {}
```

y añadir arriba `import { estadoEfectivo, type FilaSuscripcion } from './suscripcion';`.

**Paso 2:** en `saveCompanySettings`, borrar las tres líneas `plan_id: …`, `subscription_plan: …`, `subscription_status: …` (2857-2859): el navegador ya no escribe el plan.

**Paso 3:** `npx tsc --noEmit -p .` → sin errores. `npm test` → todo PASS.

**Paso 4: commit** (`fix(suscripciones): la interfaz enseña el plan real y deja de escribirlo`).

---

### Tarea 6: portal de cliente de Stripe

**Ficheros:**
- Crear: `src/app/api/stripe/portal/route.ts`

**Paso 1: implementación**

```ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

/**
 * Abre el Customer Portal de Stripe: cambiar de plan, tarjeta o cancelar.
 * Lo que el cliente cambie allí vuelve por el webhook, que es quien
 * escribe `suscripciones`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 500 });

  const { data: fila } = await supabase
    .from('suscripciones')
    .select('stripe_customer_id')
    .maybeSingle();
  if (!fila?.stripe_customer_id) {
    return NextResponse.json({ error: 'Esta cuenta no tiene una suscripción de Stripe.' }, { status: 400 });
  }

  const session = await new Stripe(secretKey).billingPortal.sessions.create({
    customer: fila.stripe_customer_id,
    return_url: `${new URL(request.url).origin}/ajustes`,
  });
  return NextResponse.json({ url: session.url });
}
```

**Paso 2:** `npx tsc --noEmit -p .` → OK. **Paso 3: commit** (`feat(suscripciones): botón al portal de Stripe`).

---

### Tarea 7: Ajustes enseña el estado y no lo deja tocar

**Ficheros:**
- Crear: `src/components/ajustes/EstadoSuscripcion.tsx`
- Modificar: `src/app/(app)/ajustes/page.tsx:539-605` (sección «Plan de Suscripción y Membresía»)

**Paso 1: el componente**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getPlan } from '@/lib/plans';
import { estadoEfectivo, type FilaSuscripcion } from '@/lib/suscripcion';
import { formatDate } from '@/lib/utils';

/**
 * Sólo lectura. Aquí había tarjetas de plan y un interruptor que escribían
 * el plan en company_settings: cualquiera se ponía «Sin límite» gratis.
 */
export default function EstadoSuscripcion() {
  const [fila, setFila] = useState<FilaSuscripcion | null | undefined>(undefined);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    createClient()
      .from('suscripciones')
      .select('origen, plan_id, estado, cortesia_hasta, periodo_fin, cancela_al_final')
      .maybeSingle()
      .then(({ data }) => setFila((data as FilaSuscripcion | null) ?? null));
  }, []);

  const abrirPortal = async () => {
    setAbriendo(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo abrir el portal.');
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el portal.');
      setAbriendo(false);
    }
  };

  if (fila === undefined) return <p className="settings-section-subtitle">Cargando la suscripción…</p>;

  const estado = estadoEfectivo(fila);
  const plan = estado.planId ? getPlan(estado.planId) : null;

  return (
    <div className="status-panel" style={{ marginTop: 'var(--space-4)', alignItems: 'center' }}>
      <span className="status-panel-icon"><Crown size={19} /></span>
      <div className="status-panel-body">
        <div className="status-panel-title">
          {estado.activa && plan ? `Plan ${plan.name}` : 'Sin suscripción activa'}
        </div>
        <p className="status-panel-text">
          {!estado.activa && (estado.motivoInactiva ?? 'Elige un plan para emitir facturas.')}
          {estado.activa && fila?.origen === 'cortesia' && `Plan de cortesía hasta el ${formatDate(fila.cortesia_hasta!)}.`}
          {estado.activa && fila?.origen === 'stripe' && fila.periodo_fin &&
            (fila.cancela_al_final
              ? `Se cancela el ${formatDate(fila.periodo_fin)}.`
              : `Próxima renovación el ${formatDate(fila.periodo_fin)}.`)}
        </p>
        {error && <p className="field-message is-error" role="alert">{error}</p>}
      </div>
      {fila?.origen === 'stripe' ? (
        <button type="button" className="btn btn-secondary" onClick={abrirPortal} disabled={abriendo}>
          {abriendo ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />} Gestionar suscripción
        </button>
      ) : (
        <Link href="/precios" className="btn btn-primary">Ver planes</Link>
      )}
    </div>
  );
}
```

**Paso 2:** en `ajustes/page.tsx`, dentro de la sección, borrar el `<div style={{ display: 'grid' … }}>` con las tres tarjetas y el `<div className="status-panel">` del interruptor, y poner en su lugar `<EstadoSuscripcion />` (import `@/components/ajustes/EstadoSuscripcion`). Cambiar el subtítulo por «Tu plan, su estado y la próxima renovación». Quitar los imports que `eslint` marque como sin uso.

**Paso 3:** `npx eslint "src/app/(app)/ajustes/page.tsx" src/components/ajustes/EstadoSuscripcion.tsx` y `npx tsc --noEmit -p .` → limpios.

**Paso 4: verificar en el navegador** (`preview_start klima-dev`, iniciar sesión con una cuenta de prueba): `/ajustes` enseña el estado y ningún control cambia el plan.

**Paso 5: commit** (`fix(ajustes): el plan ya no se elige gratis desde Ajustes`).

---

### Tarea 8: de una suscripción de Stripe a una fila

**Ficheros:**
- Crear: `src/lib/stripe/suscripciones.ts`
- Test: `src/lib/stripe/suscripciones.test.ts`

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { estadoDesdeStripe, planDesdePrecio, filaDesdeSuscripcion } from './suscripciones';

const env = {
  STRIPE_PRICE_BASICO_MENSUAL: 'price_bm', STRIPE_PRICE_BASICO_ANUAL: 'price_ba',
  STRIPE_PRICE_PRO_MENSUAL: 'price_pm', STRIPE_PRICE_PRO_ANUAL: 'price_pa',
  STRIPE_PRICE_SINLIMITE_MENSUAL: 'price_sm', STRIPE_PRICE_SINLIMITE_ANUAL: 'price_sa',
};

function sub(parcial: Record<string, unknown>): Stripe.Subscription {
  return {
    id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: false,
    metadata: { userId: 'u1', planId: 'basico' },
    items: { data: [{ price: { id: 'price_pa', recurring: { interval: 'year' } }, current_period_end: 1790000000 }] },
    ...parcial,
  } as unknown as Stripe.Subscription;
}

describe('estadoDesdeStripe', () => {
  it.each([
    ['active', 'active'], ['trialing', 'active'], ['past_due', 'past_due'],
    ['canceled', 'canceled'], ['unpaid', 'canceled'], ['incomplete_expired', 'canceled'],
    ['incomplete', 'inactive'], ['paused', 'inactive'],
  ])('%s → %s', (stripe, local) => {
    expect(estadoDesdeStripe(stripe as Stripe.Subscription.Status)).toBe(local);
  });
});

describe('planDesdePrecio', () => {
  it('sale del precio, no de los metadatos (el portal cambia el precio)', () => {
    expect(planDesdePrecio('price_pa', env)).toEqual({ planId: 'pro', intervalo: 'year' });
    expect(planDesdePrecio('price_sm', env)).toEqual({ planId: 'sin_limite', intervalo: 'month' });
  });
  it('un precio desconocido no es un plan', () => {
    expect(planDesdePrecio('price_otro', env)).toBeNull();
  });
});

describe('filaDesdeSuscripcion', () => {
  it('toma usuario de metadatos, plan del precio y fin de periodo del elemento', () => {
    expect(filaDesdeSuscripcion(sub({}), env)).toMatchObject({
      user_id: 'u1', origen: 'stripe', plan_id: 'pro', intervalo: 'year', estado: 'active',
      stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
      periodo_fin: new Date(1790000000 * 1000).toISOString(), cancela_al_final: false,
      cortesia_hasta: null, motivo: null,
    });
  });
  it('sin userId no se puede asignar a nadie', () => {
    expect(filaDesdeSuscripcion(sub({ metadata: {} }), env)).toBeNull();
  });
});
```

**Paso 2:** `npm test -- stripe/suscripciones` → FAIL (módulo inexistente).

**Paso 3: implementación**

```ts
import type Stripe from 'stripe';
import { PLANS, type PlanId } from '@/lib/plans';
import type { FilaSuscripcion } from '@/lib/suscripcion';

export function estadoDesdeStripe(status: Stripe.Subscription.Status): FilaSuscripcion['estado'] {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'inactive';
  }
}

/**
 * El plan sale del PRECIO. Los metadatos se ponen al suscribirse, pero si
 * el cliente cambia de plan en el portal de Stripe, lo que cambia es el
 * precio y los metadatos se quedan con el plan viejo.
 */
export function planDesdePrecio(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): { planId: PlanId; intervalo: 'month' | 'year' } | null {
  for (const plan of PLANS) {
    if (env[plan.stripePriceEnvMonthly] === priceId) return { planId: plan.id, intervalo: 'month' };
    if (env[plan.stripePriceEnvAnnual] === priceId) return { planId: plan.id, intervalo: 'year' };
  }
  return null;
}

export function filaDesdeSuscripcion(sub: Stripe.Subscription, env: Record<string, string | undefined> = process.env) {
  const userId = sub.metadata?.userId;
  const elemento = sub.items.data[0];
  const plan = elemento ? planDesdePrecio(elemento.price.id, env) : null;
  if (!userId || !plan) return null;

  const finPeriodo = Math.max(...sub.items.data.map(i => i.current_period_end));
  return {
    user_id: userId,
    origen: 'stripe' as const,
    plan_id: plan.planId,
    intervalo: plan.intervalo,
    estado: estadoDesdeStripe(sub.status),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    periodo_fin: new Date(finPeriodo * 1000).toISOString(),
    cancela_al_final: sub.cancel_at_period_end,
    cortesia_hasta: null,
    motivo: null,
  };
}
```

**Paso 4:** `npm test -- stripe/suscripciones` → PASS. **Paso 5: commit** (`feat(stripe): traducir una suscripción de Stripe a una fila local`).

---

### Tarea 9: cliente de servicio y webhook con idempotencia

**Ficheros:**
- Instalar: `npm i server-only`
- Crear: `src/lib/supabase/servicio.ts`, `src/lib/stripe/procesarEvento.ts`
- Modificar: `src/app/api/stripe/webhook/route.ts` (reescritura del cuerpo del POST)

**Paso 1: cliente de servicio**

```ts
// src/lib/supabase/servicio.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Salta RLS. Sólo en el servidor, y sólo después de haber autorizado. */
export function supabaseServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

**Paso 2: el procesador** (`src/lib/stripe/procesarEvento.ts`). Recibe el evento ya verificado:

```ts
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { filaDesdeSuscripcion } from './suscripciones';

export async function procesarEvento(event: Stripe.Event, db: SupabaseClient): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const fila = filaDesdeSuscripcion(event.data.object);
      if (!fila) throw new Error(`REVISAR: la suscripción ${event.data.object.id} no trae userId o su precio no es de ningún plan.`);

      // Un evento viejo que llega tarde no pisa a uno nuevo.
      const { data: actual } = await db.from('suscripciones')
        .select('stripe_evento_creado').eq('user_id', fila.user_id).maybeSingle();
      if (actual?.stripe_evento_creado && actual.stripe_evento_creado > event.created) return;

      const { error } = await db.from('suscripciones').upsert({
        ...fila,
        estado: event.type === 'customer.subscription.deleted' ? 'canceled' : fila.estado,
        stripe_evento_creado: event.created,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return;
    }

    case 'checkout.session.completed': {
      const session = event.data.object;
      // Cobro de una factura de un inquilino (flujo /aprobar): lo de siempre.
      const invoiceId = session.client_reference_id && session.mode === 'payment' && session.metadata?.tipo !== 'tip_apoyo'
        ? session.client_reference_id
        : session.metadata?.invoiceId;
      if (session.mode === 'payment' && invoiceId && session.payment_status === 'paid') {
        const { error } = await db.from('invoices')
          .update({ status: 'pagada', paid_date: new Date().toISOString().split('T')[0] })
          .eq('id', invoiceId)
          .in('status', ['emitida', 'pendiente', 'vencida']);
        if (error) throw new Error(error.message);
      }
      // Propinas: fase 3. Suscripciones: las escribe customer.subscription.*.
      return;
    }

    default:
      return;
  }
}
```

**Paso 3: el route handler.** Conservar el comentario largo y la verificación de firma que ya hay. Sustituir desde `const stripe = new Stripe(…)` hasta el final por:

```ts
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (err) {
    console.error('Firma de webhook inválida:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  const db = supabaseServicio();

  // Cada evento, una vez: Stripe entrega «al menos una vez».
  const { error: yaEsta } = await db.from('stripe_eventos').insert({ id: event.id, tipo: event.type });
  if (yaEsta?.code === '23505') {
    const { data } = await db.from('stripe_eventos').select('procesado_en').eq('id', event.id).single();
    if (data?.procesado_en) return NextResponse.json({ received: true, duplicado: true });
  }

  try {
    await procesarEvento(event, db);
    await db.from('stripe_eventos').update({ procesado_en: new Date().toISOString(), error: null }).eq('id', event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    // «REVISAR:» es un caso que no se arregla reintentando: se apunta,
    // sale en el panel y se contesta 200 para que Stripe no insista.
    const revisar = mensaje.startsWith('REVISAR:');
    await db.from('stripe_eventos')
      .update({ error: mensaje, procesado_en: revisar ? new Date().toISOString() : null })
      .eq('id', event.id);
    console.error('Error procesando el webhook:', mensaje);
    return NextResponse.json({ received: !revisar ? false : true }, { status: revisar ? 200 : 500 });
  }
```

Borrar `STRIPE_API_VERSION` y el `createAdminClient` que quedan sin uso; añadir `import { supabaseServicio } from '@/lib/supabase/servicio';` e `import { procesarEvento } from '@/lib/stripe/procesarEvento';`. Actualizar la lista de eventos del checklist del comentario: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `credit_note.created`.

**Paso 4:** `npx tsc --noEmit -p .`, `npx eslint src/app/api/stripe/webhook/route.ts src/lib/stripe src/lib/supabase/servicio.ts` → limpios.

**Paso 5: probar contra Stripe en modo pruebas.** Sin Stripe CLI instalada: crear un endpoint temporal en el dashboard de pruebas apuntando a un despliegue de preview, suscribirse con la tarjeta `4242 4242 4242 4242` desde `/precios` y comprobar con `execute_sql` que aparece la fila en `suscripciones` y el evento en `stripe_eventos` con `procesado_en`. Reenviar el mismo evento desde el dashboard → respuesta `duplicado: true` y ninguna fila nueva.

**Paso 6: commit** (`feat(stripe): el webhook activa, cambia y cancela suscripciones, una vez por evento`).

---

### Tarea 10: `subscribe` exige datos fiscales

**Ficheros:**
- Modificar: `src/app/api/stripe/subscribe/route.ts:46-68`

**Paso 1:** sustituir la lectura de `stripe_customer_id` y el `create` por:

```ts
  // Los datos fiscales del cliente van en su factura, y el plan anual
  // supera los 400 € de la simplificada: sin NIF y dirección no hay factura.
  const { data: ajustes } = await supabase
    .from('company_settings')
    .select('nif, business_name, address, postal_code')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ajustes?.nif?.trim() || !ajustes.business_name?.trim() || !ajustes.address?.trim() || !ajustes.postal_code?.trim()) {
    return NextResponse.json({
      error: 'Antes de suscribirte, completa en Ajustes tu NIF, razón social y dirección: van en la factura de tu plan.',
      requiresSettings: true,
    }, { status: 400 });
  }

  const { data: sus } = await supabase.from('suscripciones').select('stripe_customer_id').maybeSingle();
  const customer = sus?.stripe_customer_id || undefined;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    customer_email: customer ? undefined : user.email,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    ...(customer ? { customer_update: { name: 'auto' as const, address: 'auto' as const } } : {}),
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    success_url: `${baseUrl}/dashboard?subscribed=true`,
    cancel_url: `${baseUrl}/precios?cancelled=true`,
  });
```

Conservar el comentario de `allow_promotion_codes`.

**Paso 2:** en `PricingContent.tsx`, `handleSelectPlan`: tras el 401, `if (res.status === 400 && data.requiresSettings) { router.push('/ajustes'); return; }`.

**Paso 3:** `npx tsc --noEmit -p .` → OK. **Paso 4: commit** (`fix(stripe): no se abre el pago sin los datos fiscales de la factura`).

---

### Cierre de la fase 1

- `npm test`, `npx tsc --noEmit -p .`, `npx eslint` de lo tocado → limpios.
- Revisión de código (`pedir-code-review`) antes de desplegar.
- **Desplegar** sólo con permiso de Elena: el push a `main` redespliega Vercel.

# FASE 2 — Panel `/admin`

### Tarea 11: capa de acceso de administración (DAL)

**Ficheros:**
- Crear: `src/lib/admin/dal.ts`

Sigue la guía de Next 16 («Creating a Data Access Layer»): la autorización vive cerca de los datos, no en `proxy.ts`. `getClaims()` verifica la firma del JWT, así que el `aal` que devuelve es de fiar (el `getSession()` del servidor no lo es).

**Paso 1: implementación**

```ts
import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

interface Comprobacion { user: User | null; esAdmin: boolean; aal2: boolean; }

const comprobar = cache(async (): Promise<Comprobacion> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, esAdmin: false, aal2: false };

  const [{ data: esAdmin }, { data: claims }] = await Promise.all([
    supabase.rpc('soy_admin'),
    supabase.auth.getClaims(),
  ]);
  return { user, esAdmin: esAdmin === true, aal2: claims?.claims?.aal === 'aal2' };
});

/** Páginas: sin sesión a /login; si no es admin, 404 (no se confirma que exista). */
export async function verificarAdmin() {
  const r = await comprobar();
  if (!r.user) redirect('/login');
  if (!r.esAdmin) notFound();
  return { user: r.user, aal2: r.aal2 };
}

/** Páginas con datos: además, el segundo factor. */
export async function exigirAdminCon2fa() {
  const r = await verificarAdmin();
  if (!r.aal2) redirect('/admin/2fa');
  return r;
}

/** Route handlers: responden en JSON en vez de redirigir. */
export async function adminParaApi():
  Promise<{ ok: true; user: User } | { ok: false; respuesta: NextResponse }> {
  const r = await comprobar();
  if (!r.user) return { ok: false, respuesta: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (!r.esAdmin || !r.aal2) return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  return { ok: true, user: r.user };
}
```

**Paso 2:** `npx tsc --noEmit -p .` → OK. **Paso 3: commit** (`feat(admin): comprobación de administradora y segundo factor en el servidor`).

---

### Tarea 12: segundo factor (TOTP)

**Ficheros:**
- Crear: `src/app/(app)/admin/2fa/page.tsx`, `src/components/admin/Verificacion2fa.tsx`

**Paso 1: la página**

```tsx
import { redirect } from 'next/navigation';
import { verificarAdmin } from '@/lib/admin/dal';
import Verificacion2fa from '@/components/admin/Verificacion2fa';

export default async function Pagina2fa() {
  const { aal2 } = await verificarAdmin();
  if (aal2) redirect('/admin');
  return <Verificacion2fa />;
}
```

**Paso 2: el componente**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Si ya hay un factor verificado, pide el código. Si no, da de alta uno
 * nuevo con su QR. Los factores a medio dar de alta de un intento anterior
 * se borran antes: si no, Supabase rechaza el alta nueva.
 */
export default function Verificacion2fa() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) { setError(e.message); return; }
      const verificado = data.totp.find(f => f.status === 'verified');
      if (verificado) { setFactorId(verificado.id); return; }

      for (const f of data.all.filter(f => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: alta, error: eAlta } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: `Klima admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (eAlta) { setError(eAlta.message); return; }
      setFactorId(alta.id);
      setQr(alta.totp.qr_code);
      setSecreto(alta.totp.secret);
    })();
  }, []);

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setEnviando(true);
    setError('');
    const { error: e2 } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
    if (e2) { setError('Código incorrecto o caducado. Prueba con el siguiente.'); setEnviando(false); return; }
    router.replace('/admin');
    router.refresh();
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: 'var(--space-8) auto' }}>
      <h1 className="card-title"><ShieldCheck size={18} /> Segundo factor</h1>
      {qr && (
        <>
          <p className="card-subtitle">Escanea el código con tu app de autenticación (Google Authenticator, 1Password…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR para la app de autenticación" width={200} height={200} />
          <p className="card-subtitle">¿No puedes escanearlo? Escribe esta clave: <code>{secreto}</code></p>
        </>
      )}
      <form onSubmit={verificar} className="form-group">
        <label className="form-label" htmlFor="codigo-2fa">Código de 6 cifras</label>
        <input id="codigo-2fa" className="form-input" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value)} required />
        {error && <p className="field-message is-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={enviando || !factorId}>
          {enviando ? <Loader2 size={16} className="spin" /> : null} Entrar al panel
        </button>
      </form>
    </div>
  );
}
```

**Paso 3:** `npx tsc --noEmit -p .` → OK (si algún campo de `mfa.*` no cuadra con la versión instalada, mirar `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts`).

**Paso 4: verificar** con la cuenta de Elena (tras la Tarea 1, paso 4): `/admin/2fa` enseña el QR; con el código entra y `/admin/2fa` redirige a `/admin`. Con otra cuenta, `/admin/2fa` da 404.

**Paso 5: commit** (`feat(admin): segundo factor obligatorio para el panel`).

---

### Tarea 13: cuentas y resumen (lógica pura)

**Ficheros:**
- Crear: `src/lib/admin/cuentas.ts`
- Test: `src/lib/admin/cuentas.test.ts`

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { combinarCuentas, resumen } from './cuentas';

const hoy = new Date('2026-09-11T10:00:00Z');
const usuarios = [
  { id: 'a', email: 'a@x.es', created_at: '2026-09-02T00:00:00Z', last_sign_in_at: '2026-09-10T00:00:00Z' },
  { id: 'b', email: 'b@x.es', created_at: '2026-05-01T00:00:00Z', last_sign_in_at: null },
  { id: 'c', email: 'c@x.es', created_at: '2026-04-01T00:00:00Z', last_sign_in_at: null },
];
const ajustes = [
  { user_id: 'a', business_name: 'Viejo', nif: 'X', updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'a', business_name: 'Nuevo SL', nif: 'B1', updated_at: '2026-09-01T00:00:00Z' },
];
const suscripciones = [
  { user_id: 'a', origen: 'stripe', plan_id: 'pro', estado: 'active', intervalo: 'year', cortesia_hasta: null,
    periodo_fin: '2027-09-02T00:00:00Z', cancela_al_final: false, actualizado_en: '2026-09-02T00:00:00Z' },
  { user_id: 'b', origen: 'cortesia', plan_id: 'basico', estado: 'active', intervalo: null, cortesia_hasta: '2026-09-30',
    periodo_fin: null, cancela_al_final: false, actualizado_en: '2026-09-01T00:00:00Z' },
  { user_id: 'c', origen: 'stripe', plan_id: 'basico', estado: 'canceled', intervalo: 'month', cortesia_hasta: null,
    periodo_fin: null, cancela_al_final: false, actualizado_en: '2026-09-05T00:00:00Z' },
] as const;

describe('combinarCuentas', () => {
  const cuentas = combinarCuentas({ usuarios, ajustes, suscripciones: [...suscripciones], facturasMes: [{ user_id: 'a', facturas: 7 }], admins: ['c'], hoy });
  it('usa los ajustes más recientes de cada cuenta', () => {
    expect(cuentas.find(c => c.id === 'a')).toMatchObject({ nombre: 'Nuevo SL', nif: 'B1', facturasMes: 7 });
  });
  it('una cuenta sin fila de ajustes ni facturas sale con valores vacíos', () => {
    expect(cuentas.find(c => c.id === 'b')).toMatchObject({ nombre: null, nif: null, facturasMes: 0 });
  });
  it('marca a las admins', () => {
    expect(cuentas.find(c => c.id === 'c')?.esAdmin).toBe(true);
  });
});

describe('resumen', () => {
  const r = resumen(combinarCuentas({ usuarios, ajustes, suscripciones: [...suscripciones], facturasMes: [], admins: [], hoy }), hoy);
  it('cuenta activas por plan, cortesías aparte', () => {
    expect(r.activasPorPlan).toEqual({ basico: 1, pro: 1, sin_limite: 0 });
    expect(r.cortesias).toBe(1);
  });
  it('ingresos mensuales sólo de Stripe, el anual prorrateado', () => {
    expect(r.ingresosMensuales).toBeCloseTo(790 / 12, 2);
  });
  it('altas y bajas del mes', () => {
    expect(r.altasMes).toBe(1);
    expect(r.bajasMes).toBe(1);
  });
});
```

**Paso 2:** `npm test -- admin/cuentas` → FAIL.

**Paso 3: implementación**

```ts
import { getPlan, type PlanId } from '@/lib/plans';
import { estadoEfectivo, type EstadoSuscripcion, type FilaSuscripcion } from '@/lib/suscripcion';

export interface UsuarioAuth { id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null; }
export interface AjustesCuenta { user_id: string; business_name: string | null; nif: string | null; updated_at: string | null; }
export interface FilaSuscripcionCompleta extends FilaSuscripcion {
  user_id: string; intervalo: 'month' | 'year' | null; actualizado_en: string;
}

export interface Cuenta {
  id: string; email: string; nombre: string | null; nif: string | null;
  alta: string; ultimaActividad: string | null; esAdmin: boolean; facturasMes: number;
  estado: EstadoSuscripcion; fila: FilaSuscripcionCompleta | null;
}

const mismoMes = (iso: string, hoy: Date) => iso.slice(0, 7) === hoy.toISOString().slice(0, 7);

export function combinarCuentas(d: {
  usuarios: UsuarioAuth[]; ajustes: AjustesCuenta[]; suscripciones: FilaSuscripcionCompleta[];
  facturasMes: { user_id: string; facturas: number }[]; admins: string[]; hoy: Date;
}): Cuenta[] {
  const ajustesPorCuenta = new Map<string, AjustesCuenta>();
  for (const a of d.ajustes) {
    const previo = ajustesPorCuenta.get(a.user_id);
    if (!previo || (a.updated_at ?? '') > (previo.updated_at ?? '')) ajustesPorCuenta.set(a.user_id, a);
  }
  const sus = new Map(d.suscripciones.map(s => [s.user_id, s]));
  const facturas = new Map(d.facturasMes.map(f => [f.user_id, Number(f.facturas)]));
  const admins = new Set(d.admins);

  return d.usuarios.map(u => {
    const fila = sus.get(u.id) ?? null;
    const a = ajustesPorCuenta.get(u.id);
    return {
      id: u.id, email: u.email ?? '', nombre: a?.business_name || null, nif: a?.nif || null,
      alta: u.created_at, ultimaActividad: u.last_sign_in_at ?? null,
      esAdmin: admins.has(u.id), facturasMes: facturas.get(u.id) ?? 0,
      estado: estadoEfectivo(fila, d.hoy), fila,
    };
  });
}

export function resumen(cuentas: Cuenta[], hoy: Date) {
  const activasPorPlan: Record<PlanId, number> = { basico: 0, pro: 0, sin_limite: 0 };
  let cortesias = 0, ingresosMensuales = 0, cobrosFallidos = 0, bajasMes = 0;

  for (const c of cuentas) {
    if (c.fila?.estado === 'past_due') cobrosFallidos++;
    if (c.fila?.estado === 'canceled' && mismoMes(c.fila.actualizado_en, hoy)) bajasMes++;
    if (!c.estado.activa || !c.estado.planId) continue;
    if (c.estado.origen === 'cortesia') { cortesias++; continue; }
    activasPorPlan[c.estado.planId]++;
    const plan = getPlan(c.estado.planId);
    if (plan) ingresosMensuales += c.fila?.intervalo === 'year' ? plan.priceAnnual / 12 : plan.priceMonthly;
  }
  return {
    activasPorPlan, cortesias, cobrosFallidos, bajasMes,
    ingresosMensuales: Math.round(ingresosMensuales * 100) / 100,
    altasMes: cuentas.filter(c => mismoMes(c.alta, hoy)).length,
  };
}
```

**Paso 4:** `npm test -- admin/cuentas` → PASS. **Paso 5: commit** (`feat(admin): cuentas y resumen a partir de auth, ajustes y suscripciones`).

---

### Tarea 14: lectura de datos del panel (servidor)

**Ficheros:**
- Crear: `src/lib/admin/datos.ts`

```ts
import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { combinarCuentas, type FilaSuscripcionCompleta } from './cuentas';

/** Sólo metadatos de las cuentas: ni facturas, ni clientes, ni productos. */
export async function listarCuentas() {
  const db = supabaseServicio();
  const [usuarios, ajustes, suscripciones, facturasMes, admins] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from('company_settings').select('user_id, business_name, nif, updated_at'),
    db.from('suscripciones').select('*'),
    db.rpc('admin_facturas_mes'),
    db.from('administradores').select('user_id'),
  ]);
  for (const r of [ajustes, suscripciones, facturasMes, admins]) if (r.error) throw new Error(r.error.message);
  if (usuarios.error) throw new Error(usuarios.error.message);

  return combinarCuentas({
    usuarios: usuarios.data.users,
    ajustes: ajustes.data ?? [],
    suscripciones: (suscripciones.data ?? []) as FilaSuscripcionCompleta[],
    facturasMes: facturasMes.data ?? [],
    admins: (admins.data ?? []).map(a => a.user_id),
    hoy: new Date(),
  });
}

export async function registroDeAdmin(cuentaId?: string) {
  let q = supabaseServicio().from('admin_registro').select('*').order('creado_en', { ascending: false }).limit(200);
  if (cuentaId) q = q.eq('cuenta_id', cuentaId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Eventos de Stripe que necesitan a una persona: fallidos o marcados REVISAR. */
export async function eventosPendientes() {
  const { data, error } = await supabaseServicio().from('stripe_eventos')
    .select('*').not('error', 'is', null).order('recibido_en', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

`npx tsc --noEmit -p .` → OK. Commit (`feat(admin): lectura de cuentas con la service role`).

---

### Tarea 15: acciones sobre una cuenta

**Ficheros:**
- Crear: `src/lib/admin/acciones.ts`, `src/lib/admin/acciones.test.ts`, `src/app/api/admin/cuentas/[id]/route.ts`

**Paso 1: test que falla** (`acciones.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { validarAccion } from './acciones';

const hoy = new Date('2026-09-11T10:00:00Z');

describe('validarAccion', () => {
  it('toda acción exige motivo', () => {
    expect(validarAccion({ tipo: 'cancelar', inmediato: false }, hoy)).toEqual({ ok: false, error: 'Escribe el motivo (queda registrado).' });
  });
  it('cortesía con fecha futura y plan válido', () => {
    const r = validarAccion({ tipo: 'cortesia', planId: 'pro', hasta: '2026-10-11', motivo: 'Prueba para gestoría' }, hoy);
    expect(r).toEqual({ ok: true, accion: { tipo: 'cortesia', planId: 'pro', hasta: '2026-10-11', motivo: 'Prueba para gestoría' } });
  });
  it('cortesía con fecha pasada no', () => {
    expect(validarAccion({ tipo: 'cortesia', planId: 'pro', hasta: '2026-09-10', motivo: 'xxxxx' }, hoy).ok).toBe(false);
  });
  it('cambiar plan exige plan e intervalo válidos', () => {
    expect(validarAccion({ tipo: 'cambiar_plan', planId: 'oro', intervalo: 'month', motivo: 'xxxxx' }, hoy).ok).toBe(false);
    expect(validarAccion({ tipo: 'cambiar_plan', planId: 'pro', intervalo: 'year', motivo: 'Lo pidió' }, hoy).ok).toBe(true);
  });
  it('rechaza lo desconocido', () => {
    expect(validarAccion({ tipo: 'borrar_todo', motivo: 'xxxxx' }, hoy).ok).toBe(false);
    expect(validarAccion(null, hoy).ok).toBe(false);
  });
});
```

**Paso 2:** `npm test -- admin/acciones` → FAIL.

**Paso 3: implementación** (`acciones.ts`)

```ts
import { getPlan, type PlanId } from '@/lib/plans';

export type AccionAdmin =
  | { tipo: 'cortesia'; planId: PlanId; hasta: string; motivo: string }
  | { tipo: 'quitar_cortesia'; motivo: string }
  | { tipo: 'cambiar_plan'; planId: PlanId; intervalo: 'month' | 'year'; motivo: string }
  | { tipo: 'cancelar'; inmediato: boolean; motivo: string }
  | { tipo: 'reembolsar'; motivo: string };

export function validarAccion(cuerpo: unknown, hoy: Date):
  { ok: true; accion: AccionAdmin } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Petición vacía.' };
  const b = cuerpo as Record<string, unknown>;
  const motivo = typeof b.motivo === 'string' ? b.motivo.trim() : '';
  const planValido = typeof b.planId === 'string' && !!getPlan(b.planId);

  switch (b.tipo) {
    case 'cortesia':
    case 'quitar_cortesia':
    case 'cambiar_plan':
    case 'cancelar':
    case 'reembolsar':
      break;
    default:
      return { ok: false, error: 'Acción desconocida.' };
  }
  if (motivo.length < 5) return { ok: false, error: 'Escribe el motivo (queda registrado).' };

  switch (b.tipo) {
    case 'cortesia': {
      const hasta = typeof b.hasta === 'string' ? b.hasta : '';
      if (!planValido) return { ok: false, error: 'Plan no válido.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta <= hoy.toISOString().slice(0, 10)) {
        return { ok: false, error: 'La cortesía necesita una fecha de fin posterior a hoy.' };
      }
      return { ok: true, accion: { tipo: 'cortesia', planId: b.planId as PlanId, hasta, motivo } };
    }
    case 'cambiar_plan':
      if (!planValido || (b.intervalo !== 'month' && b.intervalo !== 'year')) return { ok: false, error: 'Plan o periodicidad no válidos.' };
      return { ok: true, accion: { tipo: 'cambiar_plan', planId: b.planId as PlanId, intervalo: b.intervalo, motivo } };
    case 'cancelar':
      return { ok: true, accion: { tipo: 'cancelar', inmediato: b.inmediato === true, motivo } };
    default:
      return { ok: true, accion: { tipo: b.tipo as 'quitar_cortesia' | 'reembolsar', motivo } };
  }
}
```

**Paso 4:** `npm test -- admin/acciones` → PASS.

**Paso 5: el route handler** (`src/app/api/admin/cuentas/[id]/route.ts`)

```ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminParaApi } from '@/lib/admin/dal';
import { validarAccion } from '@/lib/admin/acciones';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { getPlan } from '@/lib/plans';

/**
 * Lo que va por Stripe no toca `suscripciones`: Stripe avisa por webhook y
 * es el webhook quien escribe, así hay una sola fuente de verdad. Las
 * cortesías sí se escriben aquí, porque no hay Stripe detrás.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminParaApi();
  if (!auth.ok) return auth.respuesta;
  const { id } = await params;

  const v = validarAccion(await request.json().catch(() => null), new Date());
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const accion = v.accion;

  const db = supabaseServicio();
  const { data: sus } = await db.from('suscripciones').select('*').eq('user_id', id).maybeSingle();
  const pagaPorStripe = sus?.origen === 'stripe' && sus.estado !== 'canceled' && sus.stripe_subscription_id;

  try {
    if (accion.tipo === 'cortesia') {
      if (pagaPorStripe) return NextResponse.json({ error: 'Esta cuenta paga por Stripe: cambia el plan, no le des cortesía.' }, { status: 409 });
      const { error } = await db.from('suscripciones').upsert({
        user_id: id, origen: 'cortesia', plan_id: accion.planId, estado: 'active',
        cortesia_hasta: accion.hasta, motivo: accion.motivo, stripe_subscription_id: null,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    } else if (accion.tipo === 'quitar_cortesia') {
      if (sus?.origen !== 'cortesia') return NextResponse.json({ error: 'Esta cuenta no tiene cortesía.' }, { status: 409 });
      const { error } = await db.from('suscripciones').update({ estado: 'inactive', actualizado_en: new Date().toISOString() }).eq('user_id', id);
      if (error) throw new Error(error.message);
    } else {
      if (!pagaPorStripe) return NextResponse.json({ error: 'Esta cuenta no tiene una suscripción de Stripe en curso.' }, { status: 409 });
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const subId = sus.stripe_subscription_id as string;

      if (accion.tipo === 'cambiar_plan') {
        const plan = getPlan(accion.planId)!;
        const precio = process.env[accion.intervalo === 'month' ? plan.stripePriceEnvMonthly : plan.stripePriceEnvAnnual];
        if (!precio) throw new Error(`Falta el precio de Stripe de ${plan.name}.`);
        const actual = await stripe.subscriptions.retrieve(subId);
        await stripe.subscriptions.update(subId, {
          items: [{ id: actual.items.data[0].id, price: precio }],
          proration_behavior: 'create_prorations',
          metadata: { ...actual.metadata, planId: accion.planId },
        });
      } else if (accion.tipo === 'cancelar') {
        if (accion.inmediato) await stripe.subscriptions.cancel(subId);
        else await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
      } else {
        // Devolución del último cobro como nota de crédito: así llega por
        // webhook (credit_note.created) y la fase 3 saca la rectificativa.
        // Comprobar con tsc el nombre del campo de importe en la versión
        // instalada (`refund_amount` en versiones anteriores a dahlia).
        const { data: [ultima] } = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 1 });
        if (!ultima) return NextResponse.json({ error: 'No hay ningún cobro que devolver.' }, { status: 409 });
        await stripe.creditNotes.create({ invoice: ultima.id!, refund_amount: ultima.amount_paid, memo: accion.motivo });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se ha podido completar.' }, { status: 502 });
  }

  await db.from('admin_registro').insert({
    admin_id: auth.user.id, accion: accion.tipo, cuenta_id: id, detalle: accion, motivo: accion.motivo,
  });
  return NextResponse.json({ ok: true });
}
```

**Paso 6:** `npx tsc --noEmit -p .` → OK (arreglar el campo del reembolso si lo marca). **Paso 7: commit** (`feat(admin): cambiar plan, cancelar, devolver y dar cortesías, con registro`).

---

### Tarea 16: páginas del panel

**Ficheros:**
- Crear: `src/app/(app)/admin/layout.tsx`, `src/app/(app)/admin/page.tsx`, `src/app/(app)/admin/cuentas/page.tsx`, `src/app/(app)/admin/cuentas/[id]/page.tsx`, `src/app/(app)/admin/registro/page.tsx`, `src/components/admin/AccionesCuenta.tsx`
- Modificar: `src/components/layout/AccountMenu.tsx`

**Paso 1: layout** — sólo comprueba admin (no 2FA: `/admin/2fa` vive dentro).

```tsx
import Link from 'next/link';
import { verificarAdmin } from '@/lib/admin/dal';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verificarAdmin();
  return (
    <div>
      <nav className="tab-bar" aria-label="Administración">
        <Link href="/admin" className="btn btn-ghost">Resumen</Link>
        <Link href="/admin/cuentas" className="btn btn-ghost">Cuentas</Link>
        <Link href="/admin/registro" className="btn btn-ghost">Registro</Link>
      </nav>
      {children}
    </div>
  );
}
```

**Paso 2: resumen** (`admin/page.tsx`)

```tsx
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas, eventosPendientes } from '@/lib/admin/datos';
import { resumen } from '@/lib/admin/cuentas';
import { formatCurrency } from '@/lib/utils';

export default async function AdminResumen() {
  await exigirAdminCon2fa();
  const [cuentas, pendientes] = await Promise.all([listarCuentas(), eventosPendientes()]);
  const r = resumen(cuentas, new Date());
  const cifras: [string, string][] = [
    ['Ingresos recurrentes / mes (a precio de tarifa)', formatCurrency(r.ingresosMensuales)],
    ['Básico · Pro · Sin límite', `${r.activasPorPlan.basico} · ${r.activasPorPlan.pro} · ${r.activasPorPlan.sin_limite}`],
    ['Cortesías activas', String(r.cortesias)],
    ['Altas / bajas este mes', `${r.altasMes} / ${r.bajasMes}`],
    ['Cobros fallidos', String(r.cobrosFallidos)],
    ['Eventos de Stripe por revisar', String(pendientes.length)],
  ];
  return (
    <>
      <div className="page-header"><h1 className="page-title">Administración</h1></div>
      <div className="kpi-grid">
        {cifras.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="card">
            <div className="card-subtitle">{etiqueta}</div>
            <div className="page-meta-value">{valor}</div>
          </div>
        ))}
      </div>
    </>
  );
}
```

**Paso 3: cuentas** (`admin/cuentas/page.tsx`) — tabla con buscador por `?q=` (en Next 16 `searchParams` es una Promise):

```tsx
import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas } from '@/lib/admin/datos';
import { getPlan } from '@/lib/plans';
import { formatDate } from '@/lib/utils';

export default async function AdminCuentas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigirAdminCon2fa();
  const q = ((await searchParams).q ?? '').trim().toLowerCase();
  const cuentas = (await listarCuentas())
    .filter(c => !q || [c.email, c.nombre, c.nif].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Cuentas</h1>
        <form><input className="form-input" name="q" defaultValue={q} placeholder="Email, nombre o NIF" aria-label="Buscar cuenta" /></form>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Cuenta</th><th>Plan</th><th>Estado</th><th>Renueva / fin</th><th>Facturas mes</th><th>Última entrada</th></tr></thead>
          <tbody>
            {cuentas.map(c => (
              <tr key={c.id}>
                <td><Link href={`/admin/cuentas/${c.id}`}>{c.nombre || c.email}</Link><div className="card-subtitle">{c.email} · {c.nif ?? 'sin NIF'}</div></td>
                <td>{c.esAdmin ? 'Admin' : c.estado.planId ? getPlan(c.estado.planId)?.name : '—'}</td>
                <td>{c.esAdmin ? '—' : c.estado.activa ? (c.estado.origen === 'cortesia' ? 'Cortesía' : c.fila?.estado === 'past_due' ? 'Cobro fallido' : 'Activa') : 'Inactiva'}</td>
                <td>{c.fila?.cortesia_hasta ? formatDate(c.fila.cortesia_hasta) : c.fila?.periodo_fin ? formatDate(c.fila.periodo_fin) : '—'}</td>
                <td>{c.facturasMes}</td>
                <td>{c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

**Paso 4: ficha** (`admin/cuentas/[id]/page.tsx`): `exigirAdminCon2fa()`, `listarCuentas()` y buscar por `id` (`notFound()` si no está); datos de la cuenta arriba, `registroDeAdmin(id)` abajo, y `<AccionesCuenta cuentaId={id} origen={c.fila?.origen ?? null} activa={c.estado.activa} />` en medio.

**Paso 5: `AccionesCuenta`** (cliente): un `<select>` de acción según `origen` (Stripe: cambiar plan / cancelar al final del periodo / cancelar ya / devolver el último cobro; sin Stripe o cortesía: dar cortesía / quitar cortesía), los campos que pida cada una (plan, periodicidad, fecha fin), un `<textarea>` de motivo obligatorio, `confirm()` sólo para «cancelar ya» y «devolver» (las irreversibles), `fetch('/api/admin/cuentas/' + cuentaId, { method: 'POST', body })`, error en `role="alert"` y `router.refresh()` al terminar. Recordar en la interfaz que los cambios por Stripe tardan unos segundos (llegan por webhook).

**Paso 6: registro** (`admin/registro/page.tsx`): `exigirAdminCon2fa()`, `registroDeAdmin()`, tabla fecha · acción · cuenta · motivo.

**Paso 7: enlace en el menú** (`AccountMenu.tsx`): añadir `const [esAdmin, setEsAdmin] = useState(false);`, meter `createClient().rpc('soy_admin')` en el `Promise.all` del primer `useEffect` (`setEsAdmin(esAdminRes.data === true)`) y, antes de «Ajustes de la empresa»:

```tsx
{esAdmin && (
  <Link href="/admin" className="account-dropdown-item" onClick={() => setOpen(false)}>
    <Shield size={16} /> Administración
  </Link>
)}
```

(`Shield` de `lucide-react`.) El enlace es comodidad: la seguridad está en el servidor.

**Paso 8: verificar**
- `npx tsc --noEmit -p .`, `npm test`, `npx eslint src/app/(app)/admin src/components/admin src/lib/admin src/components/layout/AccountMenu.tsx`.
- En el navegador (`klima-dev`): con la cuenta de Elena, `/admin` pide 2FA y luego enseña resumen y cuentas; dar una cortesía de prueba a una cuenta de test aparece en su ficha y en `/admin/registro`.
- Con otra cuenta: `/admin` → 404; `curl -X POST localhost:3000/api/admin/cuentas/<id>` sin sesión → 401; con sesión normal → 403.
- En móvil (375 px) la tabla de cuentas se desplaza dentro de su contenedor, no la página.

**Paso 9: commit** (`feat(admin): panel de cuentas, resumen y registro`).

### Cierre de la fase 2

Revisión de código (`pedir-code-review`) centrada en: que ninguna página ni ruta lea datos antes de `exigirAdminCon2fa`/`adminParaApi`, y que la service role no llegue nunca a un componente cliente.

# FASE 3 — Facturación automática y Hacienda

**Regla de oro de esta fase:** el total de cada factura es exactamente lo que Stripe cobró (`amount_paid`). El impuesto se saca de dentro, no se suma encima. Así la factura cuadra con el cobro tanto si Stripe ya suma el IGIC (`cobrar_impuesto = true`) como si todavía no.

### Tarea 17: configuración de la plataforma y emisión en SQL

**Ficheros:**
- Crear: `supabase/migration_042_facturas_plataforma.sql`

**Paso 1: averiguar dos cosas antes de escribir SQL**
- Valor de la forma de pago «tarjeta»: `grep -n "PAYMENT_METHODS" -A 12 src/lib/constants.ts`. Usar ese valor donde abajo pone `'tarjeta'`.
- Cómo emite hoy la app una rectificativa, porque `fn_invoice_seal` rechaza importes `<= 0`: `grep -rn "rectificativa" src/lib/storage.ts "src/app/(app)/facturas"`. Anotar si las rectificativas llevan líneas negativas y cómo pasan el sellado. La Tarea 21 depende de esto.

**Paso 2: migración**

```sql
-- ============================================================
-- MIGRACIÓN 042: facturas de la propia plataforma
--
-- Cada cobro de Stripe (suscripción o propina) se convierte en una factura
-- de la cuenta emisora (Elena), sellada por el trigger de siempre. La
-- función numera, inserta y emite en UNA transacción: si algo falla no
-- queda un borrador a medias, y un cobro repetido devuelve la factura que
-- ya existía (origen_externo es único).
-- ============================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS origen_externo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_origen_externo_unico
  ON public.invoices (origen_externo) WHERE origen_externo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.plataforma_config (
  id                   BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  emisor_user_id       UUID NOT NULL REFERENCES auth.users(id),
  serie_suscripciones  TEXT NOT NULL DEFAULT 'SUS',
  serie_propinas       TEXT NOT NULL DEFAULT 'PROP',
  regimen_igic         TEXT NOT NULL DEFAULT 'general' CHECK (regimen_igic IN ('general', 'pequeno_empresario')),
  -- Stripe suma el IGIC a clientes canarios. Apagado hasta que el gestor
  -- confirme el régimen: mientras tanto el IGIC sale de dentro del cobro.
  cobrar_impuesto      BOOLEAN NOT NULL DEFAULT false,
  stripe_tax_rate_igic TEXT
);
ALTER TABLE public.plataforma_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_config FROM anon, authenticated;

INSERT INTO public.plataforma_config (emisor_user_id)
SELECT id FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_emitir_factura_plataforma(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id     UUID;
  v_cfg    public.plataforma_config%ROWTYPE;
  v_serie  TEXT := p->>'serie';
  v_fecha  DATE := (p->>'fecha')::date;
  v_anio   INT  := extract(year FROM (p->>'fecha')::date);
  v_max    BIGINT;
  v_numero TEXT;
  l        JSONB;
  v_orden  INT := 0;
BEGIN
  SELECT id INTO v_id FROM public.invoices WHERE origen_externo = p->>'origen_externo';
  IF FOUND THEN RETURN v_id; END IF;

  SELECT * INTO v_cfg FROM public.plataforma_config WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLATAFORMA: falta la fila de plataforma_config.'; END IF;

  -- Mismo cerrojo por (usuario, serie) que fn_invoice_offline_renumber.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cfg.emisor_user_id::text || v_serie, 0));
  SELECT COALESCE(MAX((regexp_match(number, '^' || v_serie || '-' || v_anio || '-([0-9]+)$'))[1]::BIGINT), 0)
    INTO v_max FROM public.invoices WHERE user_id = v_cfg.emisor_user_id AND series = v_serie;
  v_numero := v_serie || '-' || v_anio || '-' || lpad((v_max + 1)::text, 4, '0');
  v_id := gen_random_uuid();

  INSERT INTO public.invoices (
    id, user_id, number, series, client_name, client_nif, client_address,
    issue_date, due_date, paid_date, status, subtotal, total_discount, total_tax, total,
    payment_method, notes, tipo, sentido, tipo_factura_fiscal,
    documento_origen_id, documento_origen_number, datos_extras, origen_externo
  ) VALUES (
    v_id, v_cfg.emisor_user_id, v_numero, v_serie, p->>'cliente_nombre',
    NULLIF(p->>'cliente_nif', ''), NULLIF(p->>'cliente_direccion', ''),
    v_fecha, v_fecha, v_fecha, 'borrador', 0, 0, 0, 0,
    'tarjeta', NULLIF(p->>'notas', ''), p->>'tipo', 'venta', p->>'tipo_factura_fiscal',
    NULLIF(p->>'documento_origen_id', '')::uuid, NULLIF(p->>'documento_origen_number', ''),
    COALESCE(p->'datos_extras', '{}'::jsonb), p->>'origen_externo'
  );

  FOR l IN SELECT value FROM jsonb_array_elements(p->'lineas') LOOP
    INSERT INTO public.invoice_line_items
      (invoice_id, product_name, quantity, unit_price, unit, tax_rate, discount_percent, subtotal, tax_amount, total, sort_order)
    VALUES (
      v_id, l->>'concepto', (l->>'cantidad')::numeric, (l->>'precio')::numeric, 'ud', (l->>'tipo')::int, 0,
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2),
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric * (l->>'tipo')::int / 100.0, 2),
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2)
        + round((l->>'cantidad')::numeric * (l->>'precio')::numeric * (l->>'tipo')::int / 100.0, 2),
      v_orden
    );
    v_orden := v_orden + 1;
  END LOOP;

  INSERT INTO public.invoice_tax_breakdown (invoice_id, rate, base_amount, tax_amount)
  SELECT v_id, tax_rate, sum(subtotal), sum(tax_amount)
  FROM public.invoice_line_items WHERE invoice_id = v_id GROUP BY tax_rate;

  -- Ya está cobrada: se emite directamente como pagada. `pagada` es un
  -- estado sellado (is_sealed_status), así que aquí sella fn_invoice_seal.
  UPDATE public.invoices SET status = 'pagada' WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_emitir_factura_plataforma(JSONB) FROM PUBLIC, anon, authenticated;
```

**Paso 3: aplicar** (`plataforma_042_facturas`).

**Paso 4: prueba en una transacción que se deshace** (`execute_sql`):

```sql
BEGIN;
SELECT public.fn_emitir_factura_plataforma('{
  "origen_externo":"prueba:1","serie":"PRUEBA","fecha":"2026-09-11","cliente_nombre":"Cliente Canario SL",
  "cliente_nif":"B35000000","cliente_direccion":"Calle Mayor 1, 35001 Las Palmas","tipo":"factura",
  "tipo_factura_fiscal":"F1","lineas":[{"concepto":"Plan Pro · mensual","cantidad":1,"precio":73.83,"tipo":7}]
}'::jsonb) AS id;
SELECT number, status, sealed_at IS NOT NULL AS sellada, subtotal, total_tax, total FROM public.invoices WHERE origen_externo = 'prueba:1';
-- Esperado: PRUEBA-2026-0001 · pagada · true · 73.83 · 5.17 · 79.00
SELECT public.fn_emitir_factura_plataforma('{"origen_externo":"prueba:1"}'::jsonb) AS mismo_id; -- mismo id, sin fila nueva
SELECT tipo_factura, estado FROM public.verifactu_registros WHERE num_serie = 'PRUEBA-2026-0001'; -- F1 · pendiente
ROLLBACK;
```

**Paso 5: commit** (`feat(plataforma): emitir en una transacción las facturas de los cobros`).

---

### Tarea 18: impuestos por zona (lógica pura)

**Ficheros:**
- Crear: `src/lib/plataforma/impuestos.ts`, `src/lib/plataforma/impuestos.test.ts`

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { zonaFiscal, tratamiento, baseQueCuadra } from './impuestos';

describe('zonaFiscal', () => {
  it.each([
    ['35001', 'canarias'], ['38400', 'canarias'], ['41001', 'peninsula_baleares'], ['07001', 'peninsula_baleares'],
    ['51001', 'ceuta_melilla'], ['52001', 'ceuta_melilla'], ['', 'desconocida'], ['1234', 'desconocida'], ['99000', 'desconocida'],
  ])('%s → %s', (cp, zona) => expect(zonaFiscal(cp)).toBe(zona));
});

describe('tratamiento', () => {
  it('Canarias en régimen general: IGIC 7 %', () => {
    expect(tratamiento('canarias', 'general')).toMatchObject({ tipo: 7, calificacion: null });
  });
  it('península: sin impuesto, no sujeta por localización (N2) y con mención', () => {
    const t = tratamiento('peninsula_baleares', 'general')!;
    expect(t).toMatchObject({ tipo: 0, calificacion: 'N2' });
    expect(t.mencion).toContain('inversión del sujeto pasivo');
  });
  it('pequeño empresario: exenta en Canarias', () => {
    expect(tratamiento('canarias', 'pequeno_empresario')).toMatchObject({ tipo: 0, calificacion: null });
  });
  it('Ceuta, Melilla y desconocida no se facturan solas', () => {
    expect(tratamiento('ceuta_melilla', 'general')).toBeNull();
    expect(tratamiento('desconocida', 'general')).toBeNull();
  });
});

describe('baseQueCuadra', () => {
  it('5 € al 7 %', () => expect(baseQueCuadra(5, 7)).toEqual({ base: 4.67, cuota: 0.33 }));
  it('79 € al 7 %', () => expect(baseQueCuadra(79, 7)).toEqual({ base: 73.83, cuota: 5.17 }));
  it('siempre cuadra al céntimo, de 1 € a 1.500 €', () => {
    for (let c = 100; c <= 150000; c++) {
      const total = c / 100;
      const { base, cuota } = baseQueCuadra(total, 7);
      expect(Math.round((base + cuota) * 100)).toBe(c);
    }
  });
});
```

**Paso 2:** `npm test -- plataforma/impuestos` → FAIL.

**Paso 3: implementación**

```ts
export type ZonaFiscal = 'canarias' | 'peninsula_baleares' | 'ceuta_melilla' | 'desconocida';
export type RegimenIgic = 'general' | 'pequeno_empresario';

export interface Tratamiento {
  tipo: number;
  /** Para Veri*Factu cuando el tipo es 0 y no es una exención. */
  calificacion: 'N2' | null;
  mencion: string | null;
}

export const IGIC_GENERAL = 7;

export function zonaFiscal(cp: string | null | undefined): ZonaFiscal {
  const c = (cp ?? '').trim();
  if (!/^\d{5}$/.test(c)) return 'desconocida';
  const provincia = Number(c.slice(0, 2));
  if (provincia === 35 || provincia === 38) return 'canarias';
  if (provincia === 51 || provincia === 52) return 'ceuta_melilla';
  if (provincia >= 1 && provincia <= 50) return 'peninsula_baleares';
  return 'desconocida';
}

/**
 * El impuesto de un servicio de la plataforma (emisora en Canarias) según
 * dónde esté el cliente. PENDIENTE DE CONFIRMAR POR EL GESTOR: está en el
 * diseño y no se cobra en Stripe hasta que lo haga (plataforma_config).
 */
export function tratamiento(zona: ZonaFiscal, regimen: RegimenIgic): Tratamiento | null {
  if (zona === 'canarias') {
    return regimen === 'general'
      ? { tipo: IGIC_GENERAL, calificacion: null, mencion: null }
      : { tipo: 0, calificacion: null, mencion: 'Operación exenta del IGIC por el régimen especial del pequeño empresario o profesional.' };
  }
  if (zona === 'peninsula_baleares') {
    return {
      tipo: 0,
      calificacion: 'N2',
      mencion: 'Operación no sujeta al IGIC por reglas de localización. Inversión del sujeto pasivo: el destinatario autoliquida el IVA (art. 84.Uno.2º de la Ley 37/1992).',
    };
  }
  return null;
}

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * La base que, con su cuota redondeada como la redondea la base de datos
 * (fn_invoice_seal), da exactamente el total cobrado. Dividir entre 1,07 y
 * redondear no basta: a veces sale un céntimo de más o de menos.
 */
export function baseQueCuadra(total: number, tipo: number): { base: number; cuota: number } {
  const aprox = cent(total / (1 + tipo / 100));
  for (const base of [aprox, cent(aprox - 0.01), cent(aprox + 0.01)]) {
    const cuota = cent((base * tipo) / 100);
    if (cent(base + cuota) === cent(total)) return { base, cuota };
  }
  throw new Error(`Ninguna base cuadra ${total} € al ${tipo} %.`);
}
```

**Paso 4:** `npm test -- plataforma/impuestos` → PASS. **Paso 5: commit** (`feat(plataforma): el impuesto según dónde esté el cliente`).

---

### Tarea 19: Veri*Factu sabe decir «no sujeta por localización» (N2)

**Ficheros:**
- Modificar: `src/lib/verifactu/mapeo.ts:124-160` (`desgloseDeFactura`) y `:232-237` (llamada en `registroAltaDesdeFila`)
- Test: `src/lib/verifactu/mapeo.test.ts`, `src/lib/verifactu/registroXml.test.ts`

**Paso 1: tests que fallan** (añadir a `mapeo.test.ts`)

```ts
it('un tramo al 0 % marcado N2 va como no sujeta, no como exenta', () => {
  const [d] = desgloseDeFactura([{ rate: 0, base_amount: 79, tax_amount: 0 }], { igic: true, calificacionSinCuota: 'N2' });
  expect(d).toEqual({ impuesto: '03', claveRegimen: '01', calificacionOperacion: 'N2', baseImponible: 79 });
});
it('registroAltaDesdeFila lee la calificación de datos_extras', () => {
  // Reutilizar el contexto de alta que ya monta este fichero, con
  // factura.datos_extras = { calificacion: 'N2' } y un tramo al 0 %.
  // Esperado: desglose[0].calificacionOperacion === 'N2' y sin operacionExenta.
});
```

y en `registroXml.test.ts`: un desglose `{ impuesto: '03', claveRegimen: '01', calificacionOperacion: 'N2', baseImponible: 79 }` produce `<sf:CalificacionOperacion>N2</sf:CalificacionOperacion>` y no contiene `TipoImpositivo` ni `CuotaRepercutida` (si ya lo hace, el test pasa a la primera y sólo documenta el caso).

**Paso 2:** `npm test -- verifactu` → FAIL en los nuevos.

**Paso 3:** en `desgloseDeFactura`, añadir a `opciones` `calificacionSinCuota?: 'N1' | 'N2'` y, dentro de `if (tipo === 0)`, antes de devolver la exención:

```ts
    if (tipo === 0) {
      // No sujeta (N1/N2) no es lo mismo que exenta (E1…E6): la
      // plataforma factura a la península sin IGIC por localización.
      if (opciones.calificacionSinCuota) {
        return { impuesto, claveRegimen, calificacionOperacion: opciones.calificacionSinCuota, baseImponible: base };
      }
      return { impuesto, claveRegimen, operacionExenta: exencion, baseImponible: base };
    }
```

y en `registroAltaDesdeFila`, en la llamada a `desgloseDeFactura`:

```ts
      calificacionSinCuota: (['N1', 'N2'] as const).find(c => c === factura.datos_extras?.calificacion),
```

**Paso 4:** `npm test -- verifactu` → todo PASS (incluidos los ejemplos oficiales de `huella.test.ts`: la huella no usa el desglose). **Paso 5: commit** (`feat(verifactu): operaciones no sujetas por localización`).

---

### Tarea 20: de un cobro a una factura (lógica pura)

**Ficheros:**
- Crear: `src/lib/plataforma/facturas.ts`, `src/lib/plataforma/facturas.test.ts`

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { facturaDeSuscripcion, facturaDePropina } from './facturas';

const cliente = (cp: string, nif = 'B12345678') => ({ nombre: 'Cliente SL', nif, direccion: `Calle 1, ${cp}`, cp });
const base = { stripeInvoiceId: 'in_1', fecha: '2026-09-11', plan: 'Pro', intervalo: 'month' as const,
  periodo: { inicio: '2026-09-11', fin: '2026-10-10' }, cobrado: 79, serie: 'SUS', regimen: 'general' as const };

describe('facturaDeSuscripcion', () => {
  it('cliente canario: IGIC 7 % dentro de lo cobrado', () => {
    const f = facturaDeSuscripcion({ ...base, cliente: cliente('35001') });
    expect(f).toMatchObject({ origen_externo: 'stripe:in_1', tipo: 'factura', tipo_factura_fiscal: 'F1', cliente_nif: 'B12345678' });
    if ('revisar' in f) throw new Error();
    expect(f.lineas).toEqual([{ concepto: 'Plan Pro · mensual · del 2026-09-11 al 2026-10-10', cantidad: 1, precio: 73.83, tipo: 7 }]);
  });
  it('cliente peninsular: sin impuesto, N2 y mención', () => {
    const f = facturaDeSuscripcion({ ...base, cliente: cliente('41001') });
    if ('revisar' in f) throw new Error();
    expect(f.lineas[0]).toMatchObject({ precio: 79, tipo: 0 });
    expect(f.datos_extras).toEqual({ calificacion: 'N2' });
    expect(f.notas).toContain('inversión del sujeto pasivo');
  });
  it('sin NIF o fuera de zona: a revisar', () => {
    expect(facturaDeSuscripcion({ ...base, cliente: cliente('35001', '') })).toHaveProperty('revisar');
    expect(facturaDeSuscripcion({ ...base, cliente: cliente('51001') })).toHaveProperty('revisar');
  });
});

describe('facturaDePropina', () => {
  it('simplificada, sin destinatario, IGIC dentro', () => {
    const f = facturaDePropina({ sessionId: 'cs_1', fecha: '2026-09-11', cobrado: 5, serie: 'PROP', regimen: 'general' });
    expect(f).toMatchObject({ origen_externo: 'stripe:cs_1', tipo_factura_fiscal: 'F2', cliente_nif: null });
    expect(f.lineas).toEqual([{ concepto: 'Propina / apoyo al desarrollo', cantidad: 1, precio: 4.67, tipo: 7 }]);
  });
});
```

**Paso 2:** `npm test -- plataforma/facturas` → FAIL.

**Paso 3: implementación**

```ts
import { baseQueCuadra, tratamiento, zonaFiscal, type RegimenIgic } from './impuestos';

export interface DatosCliente { nombre: string; nif: string; direccion: string; cp: string; }
export interface LineaPlataforma { concepto: string; cantidad: number; precio: number; tipo: number; }
export interface PayloadFactura {
  origen_externo: string; serie: string; fecha: string;
  cliente_nombre: string; cliente_nif: string | null; cliente_direccion: string | null;
  tipo: 'factura' | 'rectificativa'; tipo_factura_fiscal: 'F1' | 'F2' | 'R1' | 'R5';
  notas: string | null; datos_extras: Record<string, unknown>; lineas: LineaPlataforma[];
  documento_origen_id?: string; documento_origen_number?: string;
}

/** El total de la factura es lo cobrado; el impuesto sale de dentro. */
function lineaDesdeCobrado(concepto: string, cobrado: number, tipo: number): LineaPlataforma {
  const precio = tipo > 0 ? baseQueCuadra(cobrado, tipo).base : cobrado;
  return { concepto, cantidad: 1, precio, tipo };
}

export function facturaDeSuscripcion(a: {
  stripeInvoiceId: string; fecha: string; plan: string; intervalo: 'month' | 'year';
  periodo: { inicio: string; fin: string }; cobrado: number; cliente: DatosCliente;
  serie: string; regimen: RegimenIgic;
}): PayloadFactura | { revisar: string } {
  const zona = zonaFiscal(a.cliente.cp);
  const t = tratamiento(zona, a.regimen);
  if (!t) return { revisar: `${a.cliente.nombre} (CP ${a.cliente.cp || 'vacío'}): fuera de Canarias y península, hay que facturarlo a mano.` };
  if (!a.cliente.nif.trim()) return { revisar: `${a.cliente.nombre}: sin NIF, no se puede emitir la factura completa.` };

  const concepto = `Plan ${a.plan} · ${a.intervalo === 'month' ? 'mensual' : 'anual'} · del ${a.periodo.inicio} al ${a.periodo.fin}`;
  return {
    origen_externo: `stripe:${a.stripeInvoiceId}`, serie: a.serie, fecha: a.fecha,
    cliente_nombre: a.cliente.nombre, cliente_nif: a.cliente.nif, cliente_direccion: a.cliente.direccion,
    tipo: 'factura', tipo_factura_fiscal: 'F1', notas: t.mencion,
    datos_extras: t.calificacion ? { calificacion: t.calificacion } : {},
    lineas: [lineaDesdeCobrado(concepto, a.cobrado, t.tipo)],
  };
}

export function facturaDePropina(a: {
  sessionId: string; fecha: string; cobrado: number; serie: string; regimen: RegimenIgic;
}): PayloadFactura {
  // Quien deja la propina no se identifica: simplificada, con el tipo de
  // la emisora. PENDIENTE DE CONFIRMAR POR EL GESTOR (ver diseño).
  const t = tratamiento('canarias', a.regimen)!;
  return {
    origen_externo: `stripe:${a.sessionId}`, serie: a.serie, fecha: a.fecha,
    cliente_nombre: 'Cliente sin identificar', cliente_nif: null, cliente_direccion: null,
    tipo: 'factura', tipo_factura_fiscal: 'F2', notas: t.mencion, datos_extras: {},
    lineas: [lineaDesdeCobrado('Propina / apoyo al desarrollo', a.cobrado, t.tipo)],
  };
}
```

**Paso 4:** `npm test -- plataforma/facturas` → PASS. **Paso 5: commit** (`feat(plataforma): factura de suscripción y de propina a partir del cobro`).

---

### Tarea 21: el webhook factura, y Stripe cobra el IGIC

**Ficheros:**
- Modificar: `src/lib/stripe/procesarEvento.ts`, `src/app/api/stripe/webhook/route.ts` (el `catch`), `src/app/api/stripe/subscribe/route.ts`

**Paso 1: `invoice.paid`** — nuevo `case` en `procesarEvento`:

```ts
    case 'invoice.paid': {
      const inv = event.data.object;
      const ref = inv.parent?.subscription_details?.subscription;
      if (!ref || inv.amount_paid === 0) return; // sin suscripción, o cupón del 100 %
      const subId = typeof ref === 'string' ? ref : ref.id;

      const { data: sus } = await db.from('suscripciones')
        .select('user_id, plan_id, intervalo').eq('stripe_subscription_id', subId).maybeSingle();
      // customer.subscription.created puede llegar después: error normal,
      // Stripe reintenta y a la siguiente ya está.
      if (!sus) throw new Error(`La suscripción ${subId} todavía no tiene fila.`);

      const [{ data: aj }, cfg] = await Promise.all([
        db.from('company_settings').select('business_name, nif, address, postal_code, city, province')
          .eq('user_id', sus.user_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        configPlataforma(db),
      ]);
      const linea = inv.lines.data[0];
      const r = facturaDeSuscripcion({
        stripeInvoiceId: inv.id!, fecha: fechaIso(inv.status_transitions.paid_at ?? event.created),
        plan: getPlan(sus.plan_id)?.name ?? sus.plan_id, intervalo: sus.intervalo ?? 'month',
        periodo: { inicio: fechaIso(linea.period.start), fin: fechaIso(linea.period.end) },
        cobrado: inv.amount_paid / 100,
        cliente: {
          nombre: aj?.business_name ?? '', nif: aj?.nif ?? '', cp: aj?.postal_code ?? '',
          direccion: [aj?.address, aj?.postal_code, aj?.city, aj?.province].filter(Boolean).join(', '),
        },
        serie: cfg.serie_suscripciones, regimen: cfg.regimen_igic,
      });
      if ('revisar' in r) throw new Error(`REVISAR: ${r.revisar}`);
      const { error } = await db.rpc('fn_emitir_factura_plataforma', { p: r });
      if (error) throw new Error(error.message);
      return;
    }
```

con, arriba del fichero:

```ts
const fechaIso = (segundos: number) => new Date(segundos * 1000).toISOString().slice(0, 10);

async function configPlataforma(db: SupabaseClient) {
  const { data } = await db.from('plataforma_config').select('*').single();
  if (!data) throw new Error('REVISAR: falta la fila de plataforma_config (migración 042).');
  return data as { serie_suscripciones: string; serie_propinas: string; regimen_igic: RegimenIgic };
}
```

**Paso 2: propinas** — en el `case 'checkout.session.completed'`, antes del `return` final:

```ts
      if (session.mode === 'payment' && session.metadata?.tipo === 'tip_apoyo' && session.payment_status === 'paid') {
        const cfg = await configPlataforma(db);
        const { error } = await db.rpc('fn_emitir_factura_plataforma', {
          p: facturaDePropina({
            sessionId: session.id, fecha: fechaIso(event.created), cobrado: (session.amount_total ?? 0) / 100,
            serie: cfg.serie_propinas, regimen: cfg.regimen_igic,
          }),
        });
        if (error) throw new Error(error.message);
      }
```

y excluir las propinas de la rama de facturas de inquilinos (ya lo hace la condición `metadata?.tipo !== 'tip_apoyo'` de la Tarea 9).

**Paso 3: devoluciones (`credit_note.created`)** — según lo averiguado en la Tarea 17, paso 1:
- Si la app sella rectificativas con líneas negativas: construir con una función `facturaRectificativa({ creditNoteId, original, importe })` en `facturas.ts` (test primero, como la Tarea 20): `tipo: 'rectificativa'`, `tipo_factura_fiscal: 'R1'` (o `'R5'` si la original es F2), `documento_origen_id/number` de la factura con `origen_externo = 'stripe:' + cn.invoice`, una línea con `cantidad: -1` y el precio sacado de `cn.total / 100` con el mismo tratamiento que la original.
- Si el sellado rechaza importes negativos: NO forzarlo. La nota de crédito se marca `REVISAR: devolución de <factura> por <importe> €, emitir la rectificativa a mano` y se abre una tarea aparte para que el sellado admita rectificativas por diferencias negativas (cambio en `fn_invoice_seal`, que es la pieza más delicada del sistema).

**Paso 4: errores definitivos** — en el `catch` del route handler, tratar como `REVISAR` también los mensajes que empiezan por `ANTIFRAUDE:`, `SUSCRIPCION:` o `PLATAFORMA:` (no se arreglan reintentando): `const revisar = /^(REVISAR|ANTIFRAUDE|SUSCRIPCION|PLATAFORMA):/.test(mensaje);`.

**Paso 5: Stripe cobra el IGIC** — en `subscribe/route.ts`, tras leer `ajustes`:

```ts
  // El IGIC sólo se suma en Stripe cuando el gestor ha confirmado el
  // régimen (plataforma_config.cobrar_impuesto). Hasta entonces el cobro
  // es la base y la factura saca el IGIC de dentro.
  const { data: cfg } = await supabaseServicio().from('plataforma_config')
    .select('cobrar_impuesto, regimen_igic, stripe_tax_rate_igic').single();
  const sumarIgic = cfg?.cobrar_impuesto && cfg.regimen_igic === 'general' && cfg.stripe_tax_rate_igic
    && zonaFiscal(ajustes.postal_code) === 'canarias';
```

y en `subscription_data`: `...(sumarIgic ? { default_tax_rates: [cfg!.stripe_tax_rate_igic!] } : {})`.

**Paso 6:** `npx tsc --noEmit -p .`, `npm test` → PASS.

**Paso 7: prueba de punta a punta en modo pruebas:** cuenta de prueba con CP 35001 → suscribirse a Pro mensual → en `invoices` de Elena aparece `SUS-2026-0001`, pagada, sellada, total = lo cobrado, IGIC dentro; en `verifactu_registros`, su alta `pendiente`. Repetir con CP 41001 → sin IGIC, `datos_extras.calificacion = 'N2'`, mención en notas. Reenviar el `invoice.paid` → ninguna factura nueva. Una propina de 5 € → `PROP-2026-0001`, F2, 4,67 + 0,33.

**Paso 8: commit** (`feat(plataforma): cada cobro de Stripe sale facturado y sellado`).

---

### Tarea 22: envío a la AEAT programado

**Ficheros:**
- Crear: `src/lib/verifactu/enviarPendientes.ts`, `src/app/api/cron/verifactu/route.ts`, `vercel.json`
- Modificar: `src/app/api/verifactu/enviar/route.ts`

**Paso 1: extraer sin cambiar el comportamiento.** Mover a `enviarPendientes(db: SupabaseClient, userId: string): Promise<{ estado: number; cuerpo: Record<string, unknown> }>` todo el cuerpo del `POST` desde `// ---------- Configuración ----------` hasta el final, con estas sustituciones mecánicas y nada más:
- `user.id` → `userId`;
- `supabase` → `db`;
- cada `return error(msg, estado, extra)` → `return { estado, cuerpo: { ok: false, error: msg, ...extra } }`;
- cada `return NextResponse.json(obj, { status })` → `return { estado: status ?? 200, cuerpo: obj }`.
Conservar los comentarios (las tres reglas: orden, una vez, nada se da por hecho).

La ruta queda: autenticación y límite de frecuencia como están, y después `const r = await enviarPendientes(supabase, user.id); return NextResponse.json(r.cuerpo, { status: r.estado });`.

**Paso 2:** `npm test`, `npx tsc --noEmit -p .` → PASS. Probar en el navegador que el botón de envío de `/verifactu` responde lo mismo que antes (sin certificado: el mismo mensaje de error).

**Paso 3: la tarea programada**

```ts
// src/app/api/cron/verifactu/route.ts
import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { enviarPendientes } from '@/lib/verifactu/enviarPendientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Vercel Cron la llama con `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const db = supabaseServicio();
  const { data: cfg } = await db.from('plataforma_config').select('emisor_user_id').single();
  if (!cfg) return NextResponse.json({ ok: false, error: 'Falta plataforma_config' }, { status: 500 });

  const { data: vf } = await db.from('verifactu_config').select('envio_automatico').eq('user_id', cfg.emisor_user_id).maybeSingle();
  if (!vf?.envio_automatico) return NextResponse.json({ ok: true, omitido: 'envío automático desactivado' });

  const r = await enviarPendientes(db, cfg.emisor_user_id);
  return NextResponse.json(r.cuerpo, { status: r.estado });
}
```

```json
{
  "crons": [{ "path": "/api/cron/verifactu", "schedule": "0 7 * * *" }]
}
```

(`vercel.json` en la raíz de `facturacion-app`. Una vez al día cabe en cualquier plan de Vercel; el botón manual sigue ahí.)

**Paso 4:** `curl localhost:3000/api/cron/verifactu` → 401; con `-H "Authorization: Bearer $CRON_SECRET"` → la misma respuesta que el botón manual.

**Paso 5: commit** (`feat(verifactu): envío diario automático de la cuenta emisora`).

---

### Tarea 23: pestaña Hacienda

**Ficheros:**
- Crear: `src/lib/plataforma/plazos.ts`, `src/lib/plataforma/plazos.test.ts`, `src/app/(app)/admin/hacienda/page.tsx`
- Modificar: `src/app/(app)/admin/layout.tsx` (enlace «Hacienda»), `src/app/(app)/admin/page.tsx` (aviso)

**Paso 1: test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { proximoPlazo } from './plazos';

describe('proximoPlazo (420 y 130)', () => {
  it.each([
    ['2026-09-11', 2026, 3, '2026-10-20', 39],
    ['2026-10-20', 2026, 3, '2026-10-20', 0],
    ['2026-10-21', 2026, 4, '2027-01-30', 101],
    ['2027-01-15', 2026, 4, '2027-01-30', 15],
    ['2027-02-01', 2027, 1, '2027-04-20', 78],
  ])('%s → T%i de %i, vence %s', (hoy, anio, t, limite, dias) => {
    expect(proximoPlazo(new Date(`${hoy}T12:00:00Z`))).toEqual({ anio, trimestre: t, limite, dias });
  });
});
```

(Ojo con el orden de los argumentos del `it.each`: hoy, anio, trimestre, límite, días.)

**Paso 2:** `npm test -- plataforma/plazos` → FAIL.

**Paso 3: implementación**

```ts
/** Plazos del 420 (ATC) y del 130 (AEAT): del 1 al 20 del mes siguiente al trimestre; el 4T hasta el 30 de enero. */
export function proximoPlazo(hoy: Date): { anio: number; trimestre: 1 | 2 | 3 | 4; limite: string; dias: number } {
  const y = hoy.getUTCFullYear();
  const dia = hoy.toISOString().slice(0, 10);
  const candidatos: { anio: number; trimestre: 1 | 2 | 3 | 4; limite: string }[] = [
    { anio: y - 1, trimestre: 4, limite: `${y}-01-30` },
    { anio: y, trimestre: 1, limite: `${y}-04-20` },
    { anio: y, trimestre: 2, limite: `${y}-07-20` },
    { anio: y, trimestre: 3, limite: `${y}-10-20` },
    { anio: y, trimestre: 4, limite: `${y + 1}-01-30` },
  ];
  const p = candidatos.find(c => c.limite >= dia)!;
  const dias = Math.round((Date.parse(`${p.limite}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86400000);
  return { ...p, dias };
}
```

**Paso 4:** `npm test -- plataforma/plazos` → PASS.

**Paso 5: la página** (`admin/hacienda/page.tsx`): `exigirAdminCon2fa()`; con `supabaseServicio()` y `plataforma_config.emisor_user_id`, leer las facturas selladas del trimestre en curso de las series de suscripciones y propinas (`subtotal`, `total_tax`, `total`, `series`) y los `verifactu_registros` de la emisora en `pendiente`/`error_envio`/`rechazado`. Enseñar:
- el próximo plazo (`proximoPlazo`) con los días que quedan;
- nº de facturas, base, IGIC repercutido y total del trimestre, separando la base sin IGIC (clientes peninsulares);
- registros Veri*Factu pendientes de envío;
- `eventosPendientes()` (cobros sin factura);
- enlaces a `/listados-fiscales/420` y `/listados-fiscales/130`, que calculan el modelo con todas las facturas y gastos de la cuenta de Elena (su negocio entero), con el recordatorio: «El 420 se presenta en la sede de la Agencia Tributaria Canaria; el 130, importando el fichero en la sede de la AEAT. El programa no presenta nada».

**Paso 6: aviso** en `admin/page.tsx`: si `proximoPlazo(new Date()).dias <= 10`, un `status-panel` arriba: «Quedan N días para presentar el 420 y el 130 del T… (hasta el …)» con enlace a `/admin/hacienda`. Añadir «Hacienda» al `tab-bar` del layout.

**Paso 7:** `npx tsc --noEmit -p .`, `npm test`, verificación en el navegador. **Paso 8: commit** (`feat(admin): pestaña Hacienda con plazos, trimestre y enlaces al 420 y al 130`).

---

### Tarea 24: el texto de impuestos de `/precios`

**Solo cuando el gestor confirme el régimen** (si es el de pequeño empresario, el texto es otro).

**Ficheros:** `src/app/(public)/precios/PricingContent.tsx` (párrafo `pricing-iva-note`).

Sustituir «Todos los precios indicados son sin IVA. El IVA se añade según la legislación vigente.» por: «Precios sin impuestos. A empresas y autónomos de Canarias se les añade el IGIC; a los del resto de España la factura va sin IGIC ni IVA, por inversión del sujeto pasivo.» Commit (`fix(precios): el impuesto que se aplica de verdad`).

---

## Pasos manuales de Elena (no se pueden hacer desde el código)

1. **Alta de administradora** (Tarea 1, paso 4) y **2FA** la primera vez que entre en `/admin`.
2. **Stripe** (primero en modo pruebas, luego en real):
   - Developers → Webhooks → endpoint `https://<dominio>/api/stripe/webhook`, versión de API `2026-07-29.dahlia`, eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `credit_note.created`. Copiar el `whsec_…` a `STRIPE_WEBHOOK_SECRET` en Vercel.
   - Settings → Billing → Customer portal: activar cambio de plan (con los 6 precios) y cancelación.
   - «Sin límite»: la web dice 119/1.190 € y Stripe tiene 110/1.100 €. Recomendado: crear precios nuevos de 119 y 1.190 € y poner sus ids en `STRIPE_PRICE_SINLIMITE_*` en Vercel.
   - Cuando el gestor confirme: crear la tasa «IGIC 7 %» (exclusiva, España, Canarias), guardar su id en `plataforma_config.stripe_tax_rate_igic` y poner `cobrar_impuesto = true`.
3. **Vercel:** añadir `CRON_SECRET` (cualquier cadena larga aleatoria).
4. **Ajustes de su cuenta:** cambiar la dirección de Sevilla por su domicilio fiscal en Canarias antes de que se emita la primera factura (el NIF se bloquea con la primera sellada; la dirección no, pero sale en todas).
5. **Veri*Factu:** certificado real y `productor_nombre`/`productor_nif` en `verifactu_config`; sin eso el envío espera.
6. **Gestor:** régimen del IGIC (general o pequeño empresario → `plataforma_config.regimen_igic`), tratamiento de clientes peninsulares y de propinas, y cuotas de Stripe, Vercel y Supabase (servicios de fuera de Canarias).

## Orden y dependencias

Fase 1 → Fase 2 → Fase 3. Dentro de cada fase, las tareas de lógica pura (4, 8, 13, 15 paso 1-4, 18, 19, 20, 23 paso 1-4) no dependen entre sí y se pueden repartir; las migraciones (1 → 2 → 3, luego 17) van en orden; la Tarea 21 necesita la 17, 18, 19 y 20.
