-- ============================================================
-- 026 - Obras y expedientes
--
-- El cajón donde caen las facturas, los albaranes y los gastos de un
-- proyecto, para saber al final si ha dejado dinero o lo ha costado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.obras (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  numero text NOT NULL,
  nombre text NOT NULL,
  cliente_id uuid,
  cliente_nombre text,
  estado text NOT NULL DEFAULT 'abierta',
  fecha_apertura date NOT NULL,
  fecha_cierre date,
  presupuesto numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obras_estado' AND conrelid = 'public.obras'::regclass) THEN
    ALTER TABLE public.obras ADD CONSTRAINT chk_obras_estado CHECK (estado IN ('abierta', 'cerrada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'obras' AND policyname = 'obras_own') THEN
    CREATE POLICY obras_own ON public.obras USING (auth.uid() = user_id);
  END IF;
END $$;

-- A qué obra pertenece cada documento y cada gasto.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;
ALTER TABLE public.gastos   ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_obra ON public.invoices (obra_id) WHERE obra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_obra ON public.gastos (obra_id) WHERE obra_id IS NOT NULL;

COMMENT ON TABLE public.obras IS 'Obras y expedientes: agrupan documentos y gastos de un proyecto para ver su rentabilidad.';
