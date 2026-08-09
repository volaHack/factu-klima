-- ============================================================
-- Migración 006: TPV (punto de venta)
-- ============================================================
-- Añade lo mínimo para un TPV profesional sin romper nada existente:
-- código de barras + stock en productos, cliente genérico para ventas
-- al público sin NIF (factura simplificada), y turnos de caja (arqueo).

-- --- 1. Productos: código de barras y stock -------------------------
ALTER TABLE products
  ADD COLUMN barcode TEXT,
  ADD COLUMN stock_quantity NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN low_stock_threshold NUMERIC;

-- No UNIQUE: dos productos distintos con el mismo EAN mal etiquetado
-- no debe poder tumbar un alta; el buscador del TPV ya desambigua por
-- fecha de creación si hay duplicados.
CREATE INDEX idx_products_barcode ON products (user_id, barcode) WHERE barcode IS NOT NULL;

-- --- 2. Clientes: marca de "venta al público" ------------------------
-- Se crea una sola vez por empresa (ver fn_ensure_walk_in_client) y se
-- usa como client_id por defecto en el TPV para no exigir NIF real en
-- cada ticket — es la factura simplificada del comercio de barrio.
ALTER TABLE clients
  ADD COLUMN is_walk_in BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_clients_one_walk_in ON clients (user_id) WHERE is_walk_in;

-- --- 3. Turnos de caja (arqueo) ---------------------------------------
CREATE TABLE pos_sessions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  starting_cash NUMERIC NOT NULL DEFAULT 0,
  counted_cash NUMERIC,
  expected_cash NUMERIC,
  cash_difference NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un usuario no puede tener dos turnos abiertos a la vez.
CREATE UNIQUE INDEX idx_pos_sessions_one_open ON pos_sessions (user_id) WHERE status = 'open';
CREATE INDEX idx_pos_sessions_user ON pos_sessions (user_id, opened_at DESC);

ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_sessions_user_policy" ON pos_sessions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON pos_sessions FROM anon;
REVOKE ALL ON pos_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_sessions TO authenticated;

-- --- 4. Facturas: qué turno generó cada venta de TPV ------------------
ALTER TABLE invoices
  ADD COLUMN pos_session_id UUID REFERENCES pos_sessions(id);

CREATE INDEX idx_invoices_pos_session ON invoices (pos_session_id) WHERE pos_session_id IS NOT NULL;

-- --- 5. Ajuste atómico de stock ---------------------------------------
-- UPDATE con expresión (stock = stock + delta) en el propio servidor,
-- no lectura-modificación-escritura desde el cliente: dos ventas
-- simultáneas del mismo producto no deben poder pisarse el descuento
-- de stock. delta negativo en una venta, positivo al reponer.
CREATE OR REPLACE FUNCTION fn_pos_adjust_stock(p_product_id UUID, p_delta NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock NUMERIC;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity + p_delta,
      updated_at = now()
  WHERE id = p_product_id AND user_id = (SELECT auth.uid())
  RETURNING stock_quantity INTO v_new_stock;

  IF v_new_stock IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado o no pertenece al usuario actual';
  END IF;

  RETURN v_new_stock;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_pos_adjust_stock(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_pos_adjust_stock(UUID, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION fn_pos_adjust_stock(UUID, NUMERIC) TO authenticated;
