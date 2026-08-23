-- ============================================================
-- 028 - Lotes y trazabilidad
--
-- Qué lote se vendió a quién y con qué caducidad. Obligación legal en
-- distribución alimentaria: sin esto no se puede responder a una alerta
-- sanitaria retirando exactamente lo que hay que retirar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lotes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_ref text,
  product_name text,
  codigo text NOT NULL,
  fecha_entrada date NOT NULL,
  fecha_caducidad date,
  cantidad_entrada numeric NOT NULL DEFAULT 0,
  cantidad_disponible numeric NOT NULL DEFAULT 0,
  proveedor_id uuid,
  proveedor_nombre text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lotes' AND policyname = 'lotes_own') THEN
    CREATE POLICY lotes_own ON public.lotes USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lotes_producto ON public.lotes (product_id);
CREATE INDEX IF NOT EXISTS idx_lotes_caducidad ON public.lotes (fecha_caducidad) WHERE fecha_caducidad IS NOT NULL;

-- De qué lote sale cada línea vendida. Es la mitad que hace posible la
-- trazabilidad hacia delante: dado un lote, encontrar todas las facturas
-- (y sus clientes) que se sirvieron de él.
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS lote_codigo text;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_lote ON public.invoice_line_items (lote_id) WHERE lote_id IS NOT NULL;

COMMENT ON TABLE public.lotes IS 'Lotes de producto, para trazabilidad alimentaria: qué lote se vendió a quién.';
COMMENT ON COLUMN public.invoice_line_items.lote_id IS 'De qué lote sale esta línea. Se descuenta cantidad_disponible al expedir el albarán.';
