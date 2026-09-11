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
