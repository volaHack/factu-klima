-- ============================================================
-- MIGRACIÓN 016: Corrección del trigger de suscripción
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Qué arregla (dos bugs encadenados que bloqueaban la emisión):
--
-- 1) El trigger leía `company_settings.subscription_plan`, pero la
--    aplicación (saveCompanySettings) escribe el plan en `plan_id`.
--    Con `subscription_plan` a NULL, fn_plan_invoice_limit(NULL) = 0
--    y toda emisión quedaba bloqueada aunque hubiera plan activo.
--    Ahora se usa COALESCE(subscription_plan, plan_id).
--
-- 2) El estado de la BD podía quedar desincronizado (fila vieja o
--    reescrita con 'inactive' desde la caché offline) y el SELECT
--    del trigger no acotaba a una sola fila, así que con filas
--    duplicadas podía leer cualquiera. Ahora lee la fila más
--    reciente (ORDER BY updated_at DESC NULLS LAST LIMIT 1) y, para
--    la cuenta de desarrollo del propietario, aplica el mismo
--    criterio que la UI (getCompanySettings): plan 'sin_limite'
--    activo. Así el servidor no vuelve a bloquear lo que la UI
--    ya concede.
--
-- La UI nunca fue el problema: ya forzaba 'sin_limite'/'active' para
-- el propietario. El trigger vivía en otra fuente de verdad distinta.
-- ============================================================

-- 0. Garantizar que las columnas de plan y suscripción existen en company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT;

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_already_sealed BOOLEAN;
  v_plan TEXT;
  v_status TEXT;
  v_email TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  SELECT sealed_at IS NOT NULL INTO v_already_sealed
    FROM public.invoices WHERE id = NEW.id;

  IF v_already_sealed THEN
    RETURN NEW; -- re-guardado de una factura ya sellada, no una emisión nueva
  END IF;

  -- Una sola fila y la más reciente: si existen duplicados históricos de
  -- company_settings (guardados offline antiguos), no se lee cualquiera.
  -- COALESCE: la app escribe plan_id; el webhook de Stripe, subscription_plan.
  SELECT COALESCE(cs.subscription_plan, cs.plan_id),
         cs.subscription_status,
         u.email
    INTO v_plan, v_status, v_email
    FROM public.company_settings cs
    JOIN auth.users u ON u.id = cs.user_id
   WHERE cs.user_id = NEW.user_id
   ORDER BY cs.updated_at DESC NULLS LAST
   LIMIT 1;

  -- Cuenta de desarrollo del propietario: la UI le concede siempre
  -- 'sin_limite' con estado activo (getCompanySettings). Mantener el
  -- mismo criterio en el servidor evita que un estado viejo de la BD
  -- bloquee una emisión legítima. Mismo email que la migración 005_reset.
  IF v_email = 'volitancrooss@gmail.com' THEN
    v_plan := 'sin_limite';
    v_status := 'active';
  END IF;

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

-- Saneado de la fila del propietario: si en algún momento quedó
-- reescrita con 'inactive' o con subscription_plan NULL, se repara
-- para que el resto del sistema (y no sólo el trigger) la vea bien.
UPDATE public.company_settings cs
SET subscription_plan = 'sin_limite',
    subscription_status = 'active',
    plan_id = 'sin_limite'
WHERE cs.user_id IN (
    SELECT id FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com'
  )
  AND (cs.subscription_plan IS DISTINCT FROM 'sin_limite'
       OR cs.subscription_status IS DISTINCT FROM 'active'
       OR cs.plan_id IS DISTINCT FROM 'sin_limite');

-- CREATE OR REPLACE conserva los privilegios revocados en la 005, pero
-- se repiten por si la función no existiera todavía en algún entorno.
REVOKE EXECUTE ON FUNCTION fn_monthly_invoice_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_plan_invoice_limit(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_subscription_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_monthly_invoice_count(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_plan_invoice_limit(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_check_subscription_limit() FROM anon, authenticated;
