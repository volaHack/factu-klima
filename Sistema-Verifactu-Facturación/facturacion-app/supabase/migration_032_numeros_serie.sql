-- ============================================================
-- 032 - Números de serie
--
-- Una unidad concreta de principio a fin: de qué proveedor entró, a qué
-- cliente se vendió, hasta cuándo cubre la garantía.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.numeros_serie (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_ref text,
  product_name text,
  numero_serie text NOT NULL,
  estado text NOT NULL DEFAULT 'en_stock',
  fecha_entrada date NOT NULL,
  proveedor_id uuid,
  proveedor_nombre text,
  fecha_venta date,
  cliente_id uuid,
  cliente_nombre text,
  invoice_id uuid,
  garantia_meses numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.numeros_serie ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_numeros_serie_estado' AND conrelid = 'public.numeros_serie'::regclass) THEN
    ALTER TABLE public.numeros_serie ADD CONSTRAINT chk_numeros_serie_estado CHECK (estado IN ('en_stock', 'vendido', 'baja'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'numeros_serie' AND policyname = 'numeros_serie_own') THEN
    CREATE POLICY numeros_serie_own ON public.numeros_serie USING (auth.uid() = user_id);
  END IF;
END $$;

-- Un número de serie no se repite dentro de la misma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_numeros_serie_unico ON public.numeros_serie (user_id, numero_serie);
CREATE INDEX IF NOT EXISTS idx_numeros_serie_producto ON public.numeros_serie (product_id);

ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS numero_serie_id uuid REFERENCES public.numeros_serie(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS numero_serie text;

COMMENT ON TABLE public.numeros_serie IS 'Unidades con número de serie: de qué proveedor entró, a qué cliente se vendió, garantía.';
