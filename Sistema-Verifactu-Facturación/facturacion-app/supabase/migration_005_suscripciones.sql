-- ============================================================
-- MIGRACIÓN 005: Suscripciones (planes de precio)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Ya aplicada en la base de datos remota (2026-08-08). Este archivo la
-- trae bajo control de versiones — documenta el estado final, tras
-- aplicar también las dos correcciones que siguieron en la misma sesión
-- (search_path/PUBLIC y el bug de re-guardado por upsert, ver abajo).
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

-- 2. Cuántas facturas ha emitido el usuario este mes natural. Cuenta por
-- sealed_at (fecha real e inmutable del sellado fiscal), no por
-- issue_date, que el usuario puede fijar libremente antes de sellar y
-- así saltarse el límite mensual.
CREATE OR REPLACE FUNCTION fn_monthly_invoice_count(p_user_id UUID)
RETURNS INT
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COUNT(*)::INT FROM public.invoices
  WHERE user_id = p_user_id
    AND sealed_at IS NOT NULL
    AND sealed_at >= date_trunc('month', CURRENT_DATE)
    AND sealed_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
$$;

-- 3. Límite por plan. Los números están duplicados a propósito en
-- src/lib/plans.ts (fuente de verdad para la UI) — si cambias un límite
-- de plan, cámbialo en los dos sitios. NULL = sin límite.
CREATE OR REPLACE FUNCTION fn_plan_invoice_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
SET search_path = ''
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
--
-- Guarda de re-guardado: saveInvoice() en src/lib/storage.ts usa
-- .upsert() (INSERT ... ON CONFLICT DO UPDATE), y la mitad "insert" de
-- un upsert dispara igual el trigger BEFORE INSERT aunque el conflicto
-- acabe resolviéndose como UPDATE. Sin esta guarda, una suscripción
-- caducada o al límite bloquearía marcar como pagada una factura ya
-- emitida hace semanas, que no es una emisión nueva y no debería
-- consumir cupo ni exigir suscripción activa. Replica la idea de
-- OLD.sealed_at IS NULL en fn_invoice_immutable (migration_002).
CREATE OR REPLACE FUNCTION fn_check_subscription_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_already_sealed BOOLEAN;
  v_plan TEXT;
  v_status TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  SELECT sealed_at IS NOT NULL INTO v_already_sealed
    FROM public.invoices WHERE id = NEW.id;

  IF v_already_sealed THEN
    RETURN NEW; -- re-guardado de una factura ya sellada, no una emisión nueva
  END IF;

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
-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva, Y
-- ADEMÁS Supabase configura ALTER DEFAULT PRIVILEGES en el schema public
-- para conceder EXECUTE explícitamente a anon/authenticated/service_role
-- por su nombre — son dos mecanismos de grant independientes, hace falta
-- revocar los dos (ver nota de migration_004_seguridad_tier0.sql, donde
-- ya costó dos migraciones de más descubrir esto).
REVOKE EXECUTE ON FUNCTION fn_monthly_invoice_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_plan_invoice_limit(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_subscription_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_monthly_invoice_count(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_plan_invoice_limit(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_check_subscription_limit() FROM anon, authenticated;
