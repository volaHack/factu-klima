-- ============================================================
-- 034 - Fabricación: escandallos
--
-- Qué componentes consume cada artículo fabricado y cuánto cuesta
-- producirlo. Fabricar una unidad descuenta los componentes del almacén y
-- da de alta el producto terminado con su coste real.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.escandallos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_ref text,
  product_name text,
  componentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  coste_adicional numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.escandallos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'escandallos' AND policyname = 'escandallos_own') THEN
    CREATE POLICY escandallos_own ON public.escandallos USING (auth.uid() = user_id);
  END IF;
END $$;

-- Un producto tiene como mucho un escandallo: no tendría sentido fabricarlo
-- con dos recetas distintas a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_escandallos_producto ON public.escandallos (user_id, product_id);

COMMENT ON TABLE public.escandallos IS 'Escandallos: la receta de componentes de un producto fabricado, y su coste.';
COMMENT ON COLUMN public.escandallos.componentes IS 'Array de {productId, productRef, productName, cantidad}, la cantidad necesaria de cada uno por unidad fabricada.';
