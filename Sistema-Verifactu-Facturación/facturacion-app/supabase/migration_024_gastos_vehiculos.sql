-- ============================================================
-- 024 - Gastos y vehículos
--
-- Lo que se paga y no es mercancía: alquiler, suministros, dietas. No es un
-- documento fiscal sellado como una factura de venta —no entra en la cadena
-- de huellas de Veri*Factu— porque no se emite, se registra: el número lo
-- puso el proveedor en SU factura, y aquí sólo se apunta.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vehiculos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  matricula text NOT NULL,
  nombre text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehiculos' AND policyname = 'vehiculos_own') THEN
    CREATE POLICY vehiculos_own ON public.vehiculos USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  fecha date NOT NULL,
  concepto text NOT NULL,
  categoria text NOT NULL DEFAULT 'otros',
  proveedor_id uuid,
  proveedor_nombre text,
  base_imponible numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 21,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  vehiculo_id uuid REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gastos' AND policyname = 'gastos_own') THEN
    CREATE POLICY gastos_own ON public.gastos USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos (user_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_vehiculo ON public.gastos (vehiculo_id) WHERE vehiculo_id IS NOT NULL;

COMMENT ON TABLE public.vehiculos IS 'Vehículos de la empresa, para imputarles gastos de combustible, mantenimiento y seguro.';
COMMENT ON TABLE public.gastos IS 'Gastos que no son mercancía: alquiler, suministros, dietas. No sellado ni encadenado: es registro interno, no factura emitida.';
