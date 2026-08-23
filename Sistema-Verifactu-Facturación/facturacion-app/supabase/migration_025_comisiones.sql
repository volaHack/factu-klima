-- ============================================================
-- 025 - Comisiones de vendedores
--
-- No hace falta tabla nueva: la comisión es un porcentaje del vendedor y una
-- preferencia de la empresa (sobre lo facturado o sobre lo cobrado). Lo que
-- se lleva cada uno se CALCULA sobre las facturas ya existentes, no se
-- guarda por duplicado —guardarlo aparte es la manera segura de que se
-- desincronice si una factura se corrige o se anula después.
-- ============================================================

ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS comision_pct numeric;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS comision_base text NOT NULL DEFAULT 'facturado';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_comision_base' AND conrelid = 'public.company_settings'::regclass) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT chk_comision_base CHECK (comision_base IN ('facturado', 'cobrado'));
  END IF;
END $$;

COMMENT ON COLUMN public.vendedores.comision_pct IS 'Porcentaje que se lleva el vendedor de lo que vende. Nulo = sin comisión.';
COMMENT ON COLUMN public.company_settings.comision_base IS 'facturado: cuenta en cuanto se emite. cobrado: sólo cuando la factura está pagada.';
