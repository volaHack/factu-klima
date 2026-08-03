-- ============================================================
-- MIGRACIÓN 004: Seguridad Tier 0
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Trae bajo control de versiones: user_profiles, order_approvals,
-- order_approval_items (ya usadas en producción sin migración) +
-- añade rate limiting server-side + verificación de propiedad
-- cross-tenant en invoices/invoice_line_items.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

DROP POLICY IF EXISTS "user_profiles_owner_policy" ON user_profiles;
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

-- No se crea un índice adicional para `token`: la columna ya es UNIQUE
-- en la definición de la tabla, lo que Postgres respalda con su propio
-- índice único implícito.
CREATE INDEX IF NOT EXISTS idx_order_approvals_invoice ON order_approvals(invoice_id);

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

DROP POLICY IF EXISTS "order_approvals_owner_policy" ON order_approvals;
CREATE POLICY "order_approvals_owner_policy" ON order_approvals
  FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "order_approval_items_owner_policy" ON order_approval_items;
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
  -- sin necesitar un cron job dedicado). El umbral se basa en la propia
  -- ventana solicitada (con un mínimo de 1h) para no borrar nunca el
  -- bucket de la ventana en curso si algún caller usa p_window_seconds
  -- superior a una hora (p.ej. un límite "N por día").
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits
    WHERE window_start < now() - make_interval(secs => GREATEST(p_window_seconds, 3600));
  END IF;

  RETURN v_count <= p_max_hits;
END;
$$ LANGUAGE plpgsql;

-- Solo el servidor (service role) invoca esta función, desde
-- src/lib/rateLimit.ts. Conceder EXECUTE a anon/authenticated permitiría
-- a cualquiera invocar el RPC directamente con la clave pública y
-- agotar a propósito la cuota de otra clave (p.ej. la IP de un cliente
-- legítimo), sin necesidad de pasar por las API routes.
GRANT EXECUTE ON FUNCTION fn_check_rate_limit(TEXT, INT, INT) TO service_role;

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
