-- ============================================================
-- 020 - Multi-almacén, existencias por almacén, traspasos, regularizaciones y PMP
-- ============================================================

-- almacenes
CREATE TABLE IF NOT EXISTS public.almacenes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  direccion text,
  principal boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'almacenes' AND policyname = 'almacenes_own'
  ) THEN
    CREATE POLICY almacenes_own ON public.almacenes USING (auth.uid() = user_id);
  END IF;
END $$;

-- traspasos entre almacenes
CREATE TABLE IF NOT EXISTS public.traspasos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  number text NOT NULL,
  origen_almacen_id uuid NOT NULL,
  origen_almacen_nombre text NOT NULL,
  destino_almacen_id uuid NOT NULL,
  destino_almacen_nombre text NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.traspasos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'traspasos' AND policyname = 'traspasos_own'
  ) THEN
    CREATE POLICY traspasos_own ON public.traspasos USING (auth.uid() = user_id);
  END IF;
END $$;

-- traspaso_line_items
CREATE TABLE IF NOT EXISTS public.traspaso_line_items (
  id uuid PRIMARY KEY,
  traspaso_id uuid NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  product_ref text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'ud',
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.traspaso_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'traspaso_line_items' AND policyname = 'traspaso_line_items_own'
  ) THEN
    CREATE POLICY traspaso_line_items_own ON public.traspaso_line_items USING (
      EXISTS (SELECT 1 FROM public.traspasos t WHERE t.id = traspaso_id AND t.user_id = auth.uid())
    );
  END IF;
END $$;

-- regularizaciones_stock
CREATE TABLE IF NOT EXISTS public.regularizaciones_stock (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  almacen_id uuid NOT NULL,
  almacen_nombre text NOT NULL,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  product_ref text NOT NULL,
  stock_teorico numeric NOT NULL,
  stock_real numeric NOT NULL,
  diferencia numeric NOT NULL,
  motivo text NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regularizaciones_stock ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'regularizaciones_stock' AND policyname = 'regularizaciones_stock_own'
  ) THEN
    CREATE POLICY regularizaciones_stock_own ON public.regularizaciones_stock USING (auth.uid() = user_id);
  END IF;
END $$;

-- products: PMP, coste de última compra y existencias por almacén
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coste_pmp numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coste_ultima_compra numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stocks_by_almacen jsonb NOT NULL DEFAULT '{}'::jsonb;

-- invoices: almacén asociado
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS almacen_id uuid;

-- invoice_line_items: coste unitario histórico al momento de la venta
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;

COMMENT ON TABLE public.almacenes IS 'Almacenes y ubicaciones físicas o móviles de la empresa';
COMMENT ON TABLE public.traspasos IS 'Movimientos y traspasos de mercancía entre almacenes';
COMMENT ON TABLE public.regularizaciones_stock IS 'Ajustes y regularizaciones de inventario por recuento';
COMMENT ON COLUMN public.products.coste_pmp IS 'Precio Medio Ponderado calculado sobre las compras acumuladas';
COMMENT ON COLUMN public.products.coste_ultima_compra IS 'Precio unitario neto de la última compra';
COMMENT ON COLUMN public.products.stocks_by_almacen IS 'Existencias por almacén: { [almacenId]: stock }';
COMMENT ON COLUMN public.invoices.almacen_id IS 'Almacén de origen (en ventas) o destino (en compras)';
COMMENT ON COLUMN public.invoice_line_items.cost_price IS 'Coste unitario en el momento de la venta para cálculo de rentabilidad';
