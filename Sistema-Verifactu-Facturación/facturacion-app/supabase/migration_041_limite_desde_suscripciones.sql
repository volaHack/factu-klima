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
