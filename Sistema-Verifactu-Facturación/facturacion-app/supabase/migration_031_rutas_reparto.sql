-- ============================================================
-- 031 - Rutas de reparto
--
-- Agrupa clientes por zona o por día, para sacar la hoja de la jornada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rutas_reparto (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  dia_semana smallint,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rutas_reparto ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rutas_dia' AND conrelid = 'public.rutas_reparto'::regclass) THEN
    ALTER TABLE public.rutas_reparto ADD CONSTRAINT chk_rutas_dia CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rutas_reparto' AND policyname = 'rutas_reparto_own') THEN
    CREATE POLICY rutas_reparto_own ON public.rutas_reparto USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ruta_id uuid REFERENCES public.rutas_reparto(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_ruta ON public.clients (ruta_id) WHERE ruta_id IS NOT NULL;

COMMENT ON TABLE public.rutas_reparto IS 'Rutas de reparto: agrupan clientes por zona o día para la hoja de la jornada.';
