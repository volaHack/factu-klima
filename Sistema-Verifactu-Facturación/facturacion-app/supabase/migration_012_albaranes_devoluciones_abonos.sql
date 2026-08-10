-- ============================================================
-- MIGRACIÓN 012 — ALBARANES, DEVOLUCIONES Y ABONOS
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- 1. Columnas de company_settings que faltaban: tpv_enabled,
--    igic_enabled y stripe_enabled se guardaban SÓLO en IndexedDB y un
--    refresh en segundo plano las perdía (el toggle del TPV no persistía).
--    Además, series y contadores para albaranes, devoluciones y abonos.
-- 2. Tablas nuevas: albaranes, albaran_line_items, devoluciones,
--    devolucion_line_items, abonos, abono_aplicaciones — con RLS por
--    usuario idéntica al resto de la app.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ============================================================
-- 1. COMPANY_SETTINGS — columnas pendientes
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS tpv_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS igic_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS albaran_series TEXT NOT NULL DEFAULT 'ALB',
  ADD COLUMN IF NOT EXISTS next_albaran_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS devolucion_series TEXT NOT NULL DEFAULT 'DEV',
  ADD COLUMN IF NOT EXISTS next_devolucion_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS abono_series TEXT NOT NULL DEFAULT 'ABO',
  ADD COLUMN IF NOT EXISTS next_abono_number INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- 2. ALBARANES (documento de entrega / preparación)
-- ============================================================

CREATE TABLE IF NOT EXISTS albaranes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT 'ALB',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_nif TEXT,
  client_address TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'expedido', 'facturado', 'anulado')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un albarán no puede repetir número dentro de la misma serie y usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_albaranes_user_series_number
  ON albaranes (user_id, series, number);

CREATE INDEX IF NOT EXISTS idx_albaranes_user_date ON albaranes (user_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_albaranes_user_status ON albaranes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_albaranes_client ON albaranes (client_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_invoice ON albaranes (invoice_id);

CREATE TABLE IF NOT EXISTS albaran_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  albaran_id UUID NOT NULL REFERENCES albaranes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ud',
  tax_rate INT NOT NULL DEFAULT 21,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_albaran_line_items_albaran
  ON albaran_line_items (albaran_id, sort_order);

-- ============================================================
-- 3. DEVOLUCIONES (mercancía devuelta: roturas, defectos…)
-- ============================================================

CREATE TABLE IF NOT EXISTS devoluciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT 'DEV',
  origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('albaran', 'factura', 'manual')),
  origin_id UUID,
  origin_number TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_nif TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL DEFAULT 'otro'
    CHECK (reason IN ('rotura', 'defecto', 'error', 'vencido', 'otro')),
  reason_note TEXT,
  status TEXT NOT NULL DEFAULT 'registrada'
    CHECK (status IN ('registrada', 'abonada')),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  abono_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_user_series_number
  ON devoluciones (user_id, series, number);

CREATE INDEX IF NOT EXISTS idx_devoluciones_user_date ON devoluciones (user_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_client ON devoluciones (client_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_origin ON devoluciones (origin, origin_id);

CREATE TABLE IF NOT EXISTS devolucion_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id UUID NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ud',
  tax_rate INT NOT NULL DEFAULT 21,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  restock BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_devolucion_line_items_devolucion
  ON devolucion_line_items (devolucion_id, sort_order);

-- ============================================================
-- 4. ABONOS (nota de crédito a favor del cliente)
-- ============================================================

CREATE TABLE IF NOT EXISTS abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT 'ABO',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_nif TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  used_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'emitido'
    CHECK (status IN ('emitido', 'parcial', 'usado', 'anulado')),
  devolucion_id UUID REFERENCES devoluciones(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_abonos_user_series_number
  ON abonos (user_id, series, number);

CREATE INDEX IF NOT EXISTS idx_abonos_user_date ON abonos (user_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_abonos_client ON abonos (client_id);
CREATE INDEX IF NOT EXISTS idx_abonos_status ON abonos (user_id, status);

CREATE TABLE IF NOT EXISTS abono_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abono_id UUID NOT NULL REFERENCES abonos(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abono_aplicaciones_abono ON abono_aplicaciones (abono_id);
CREATE INDEX IF NOT EXISTS idx_abono_aplicaciones_invoice ON abono_aplicaciones (invoice_id);

-- ============================================================
-- 5. RLS — misma política por usuario que el resto de la app
-- ============================================================

ALTER TABLE albaranes ENABLE ROW LEVEL SECURITY;
ALTER TABLE albaran_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE devolucion_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos ENABLE ROW LEVEL SECURITY;
ALTER TABLE abono_aplicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "albaranes_user_policy" ON albaranes;
CREATE POLICY "albaranes_user_policy" ON albaranes
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "albaran_line_items_user_policy" ON albaran_line_items;
CREATE POLICY "albaran_line_items_user_policy" ON albaran_line_items
  FOR ALL TO authenticated
  USING (albaran_id IN (SELECT id FROM albaranes WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (albaran_id IN (SELECT id FROM albaranes WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "devoluciones_user_policy" ON devoluciones;
CREATE POLICY "devoluciones_user_policy" ON devoluciones
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "devolucion_line_items_user_policy" ON devolucion_line_items;
CREATE POLICY "devolucion_line_items_user_policy" ON devolucion_line_items
  FOR ALL TO authenticated
  USING (devolucion_id IN (SELECT id FROM devoluciones WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (devolucion_id IN (SELECT id FROM devoluciones WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "abonos_user_policy" ON abonos;
CREATE POLICY "abonos_user_policy" ON abonos
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "abono_aplicaciones_user_policy" ON abono_aplicaciones;
CREATE POLICY "abono_aplicaciones_user_policy" ON abono_aplicaciones
  FOR ALL TO authenticated
  USING (abono_id IN (SELECT id FROM abonos WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (abono_id IN (SELECT id FROM abonos WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- 6. GRANTS — anon no toca nada; authenticated gestiona lo suyo
-- ============================================================

REVOKE ALL ON albaranes, albaran_line_items,
  devoluciones, devolucion_line_items,
  abonos, abono_aplicaciones FROM anon;
REVOKE ALL ON albaranes, albaran_line_items,
  devoluciones, devolucion_line_items,
  abonos, abono_aplicaciones FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON albaranes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON albaran_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON devoluciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON devolucion_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON abonos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON abono_aplicaciones TO authenticated;

-- ============================================================
-- 7. TRIGGERS updated_at
-- ============================================================

DROP TRIGGER IF EXISTS tr_albaranes_updated ON public.albaranes;
CREATE TRIGGER tr_albaranes_updated BEFORE UPDATE ON public.albaranes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS tr_devoluciones_updated ON public.devoluciones;
CREATE TRIGGER tr_devoluciones_updated BEFORE UPDATE ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS tr_abonos_updated ON public.abonos;
CREATE TRIGGER tr_abonos_updated BEFORE UPDATE ON public.abonos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
