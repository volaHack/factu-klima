-- ============================================================
-- 021 - Módulo de Tesorería, Cobros, Pagos y Gestión de Vencimientos (Fase 4)
-- ============================================================

-- 1. Tabla de Cobros y Pagos
CREATE TABLE IF NOT EXISTS public.cobros_pagos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('cobro', 'pago')),
  series text NOT NULL,
  number text NOT NULL,
  fecha date NOT NULL,
  contraparte_id text NOT NULL,
  contraparte_nombre text NOT NULL,
  contraparte_nif text,
  payment_method text NOT NULL,
  cuenta_bancaria text,
  importe_total numeric NOT NULL,
  desglose jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobros_pagos_user_id ON public.cobros_pagos(user_id);
CREATE INDEX IF NOT EXISTS idx_cobros_pagos_tipo ON public.cobros_pagos(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cobros_pagos_contraparte ON public.cobros_pagos(user_id, contraparte_id);
CREATE INDEX IF NOT EXISTS idx_cobros_pagos_fecha ON public.cobros_pagos(user_id, fecha);

ALTER TABLE public.cobros_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobros_pagos_owner_all" ON public.cobros_pagos;
CREATE POLICY "cobros_pagos_owner_all" ON public.cobros_pagos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Columnas en invoices para control de importe pagado y vinculaciones
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_record_ids jsonb DEFAULT '[]'::jsonb;

-- 3. Configuración de series de cobros y pagos en company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS cobro_series text DEFAULT 'COB',
  ADD COLUMN IF NOT EXISTS next_cobro_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pago_series text DEFAULT 'PAG',
  ADD COLUMN IF NOT EXISTS next_pago_number integer DEFAULT 1;
