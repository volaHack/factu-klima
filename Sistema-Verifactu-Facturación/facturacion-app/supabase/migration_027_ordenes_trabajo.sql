-- ============================================================
-- 027 - Órdenes de trabajo
--
-- El parte de un servicio: qué se hizo, quién, cuántas horas y qué
-- materiales se gastaron. Para fontaneros, electricistas, talleres,
-- limpieza: quien no vende género sino intervenciones.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ordenes_trabajo (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  numero text NOT NULL,
  cliente_id uuid,
  cliente_nombre text,
  descripcion text NOT NULL,
  estado text NOT NULL DEFAULT 'abierta',
  fecha date NOT NULL,
  tecnico_id uuid,
  horas numeric,
  materiales text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  invoice_id uuid,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ordenes_trabajo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ordenes_estado' AND conrelid = 'public.ordenes_trabajo'::regclass) THEN
    ALTER TABLE public.ordenes_trabajo ADD CONSTRAINT chk_ordenes_estado CHECK (estado IN ('abierta', 'en_curso', 'cerrada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ordenes_trabajo' AND policyname = 'ordenes_trabajo_own') THEN
    CREATE POLICY ordenes_trabajo_own ON public.ordenes_trabajo USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON public.ordenes_trabajo (user_id, estado);

COMMENT ON TABLE public.ordenes_trabajo IS 'El parte de un servicio: qué se hizo, quién, horas y materiales.';
COMMENT ON COLUMN public.ordenes_trabajo.tecnico_id IS 'Referencia a vendedores: aquí hace de operario/técnico de campo, no de comercial.';
COMMENT ON COLUMN public.ordenes_trabajo.invoice_id IS 'La factura en la que se acabó facturando, si se facturó.';
