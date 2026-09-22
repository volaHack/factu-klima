-- ============================================================
-- MIGRACIÓN 043: el plan TPV, y el límite que de verdad se aplica
--
-- TRES COSAS, Y LAS TRES HACEN FALTA PARA QUE EL PLAN SEA HONESTO:
--
-- 1) El plan 'tpv' existe. `suscripciones.plan_id` sólo admitía tres
--    valores; sin esto no se puede ni vender.
--
-- 2) Los TICKETS NO SON FACTURAS COMPLETAS. El mostrador emite
--    simplificadas y viven en la misma tabla que las demás. Un plan TPV
--    con «10 facturas al mes» a secas bloquearía la caja en el décimo
--    ticket, que es lo contrario de lo que se vende. Por eso el plan
--    'tpv' tiene tickets ilimitados (pos_session_id no nulo) y un tope
--    de 10 facturas COMPLETAS al mes.
--
-- 3) El trigger vigilaba sólo el INSERT de documentos que ya nacían
--    emitidos. La aplicación guarda SIEMPRE un borrador y lo emite
--    después con un UPDATE, así que por el camino normal no se
--    comprobaba nada: el límite de plan no se aplicaba. Ahora también
--    se comprueba al pasar de borrador a emitida.
--
-- Orden de los triggers: 'tr_check_subscription_limit' va antes que
-- 'tr_invoice_seal' por orden alfabético, así que se decide si puede
-- emitir ANTES de sellar. No hay sellado a medias.
-- ============================================================

ALTER TABLE public.suscripciones DROP CONSTRAINT IF EXISTS suscripciones_plan_id_check;
ALTER TABLE public.suscripciones ADD CONSTRAINT suscripciones_plan_id_check
  CHECK (plan_id IN ('tpv', 'basico', 'pro', 'sin_limite'));

-- El tope de facturas COMPLETAS por plan. Debe cuadrar con src/lib/plans.ts.
CREATE OR REPLACE FUNCTION public.fn_plan_invoice_limit(p_plan text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_plan
    WHEN 'tpv' THEN 10
    WHEN 'basico' THEN 25
    WHEN 'pro' THEN 100
    WHEN 'sin_limite' THEN NULL
    ELSE 0  -- sin plan (o plan desconocido) = 0 facturas permitidas
  END;
$$;

-- Facturas completas del mes: las del mostrador no cuentan.
CREATE OR REPLACE FUNCTION public.fn_monthly_full_invoice_count(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COUNT(*)::INT FROM public.invoices
  WHERE user_id = p_user_id
    AND pos_session_id IS NULL
    AND sealed_at IS NOT NULL
    AND sealed_at >= date_trunc('month', CURRENT_DATE)
    AND sealed_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
$$;
REVOKE EXECUTE ON FUNCTION public.fn_monthly_full_invoice_count(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_check_subscription_limit()
RETURNS TRIGGER SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s       public.suscripciones%ROWTYPE;
  v_limit INT;
  v_count INT;
BEGIN
  -- Un documento ya sellado no vuelve a pasar por aquí.
  IF TG_OP = 'UPDATE' AND OLD.sealed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sólo se comprueba lo que va a quedar emitido.
  IF NOT public.is_sealed_status(NEW.status) THEN
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

  -- El mostrador no tiene tope en el plan TPV: es lo que se vende.
  IF s.plan_id = 'tpv' AND NEW.pos_session_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.fn_plan_invoice_limit(s.plan_id);
  IF v_limit IS NOT NULL THEN
    v_count := CASE
      WHEN s.plan_id = 'tpv' THEN public.fn_monthly_full_invoice_count(NEW.user_id)
      ELSE public.fn_monthly_invoice_count(NEW.user_id)
    END;
    IF v_count >= v_limit THEN
      IF s.plan_id = 'tpv' THEN
        RAISE EXCEPTION 'SUSCRIPCION: el plan TPV incluye % facturas completas al mes (los tickets no cuentan). Ve a /precios.', v_limit;
      END IF;
      RAISE EXCEPTION 'SUSCRIPCION: límite de % facturas/mes alcanzado para el plan %.', v_limit, s.plan_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
REVOKE EXECUTE ON FUNCTION public.fn_check_subscription_limit() FROM PUBLIC, anon, authenticated;

-- El trigger, ahora también en la emisión (borrador → emitida).
DROP TRIGGER IF EXISTS tr_check_subscription_limit ON public.invoices;
CREATE TRIGGER tr_check_subscription_limit
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_subscription_limit();
