-- ============================================================
-- 030 - Grupos y cadenas de clientes
--
-- Sucursales que facturan por separado pero cuyo volumen conjunto es lo que
-- importa para negociar condiciones o ver quién pesa más en la cartera.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.grupos_clientes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grupos_clientes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grupos_clientes' AND policyname = 'grupos_clientes_own') THEN
    CREATE POLICY grupos_clientes_own ON public.grupos_clientes USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.grupos_clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_grupo ON public.clients (grupo_id) WHERE grupo_id IS NOT NULL;

COMMENT ON TABLE public.grupos_clientes IS 'Grupos y cadenas: clientes que se analizan y a veces se facturan en conjunto.';
