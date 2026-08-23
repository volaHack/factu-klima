-- ============================================================
-- 029 - Rappels por volumen
--
-- El premio por comprar mucho a lo largo de un periodo. Se guardan las
-- REGLAS (tramos); lo que se debe se calcula en vivo sobre las facturas,
-- igual que las comisiones.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rappels (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  cliente_id uuid,
  cliente_nombre text,
  tramos jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rappels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rappels' AND policyname = 'rappels_own') THEN
    CREATE POLICY rappels_own ON public.rappels USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.rappels IS 'Reglas de rappel por volumen: tramos de importe facturado y el % que se devuelve en cada uno.';
COMMENT ON COLUMN public.rappels.tramos IS 'Array de {desde, porcentaje}, ordenado de menor a mayor umbral.';
