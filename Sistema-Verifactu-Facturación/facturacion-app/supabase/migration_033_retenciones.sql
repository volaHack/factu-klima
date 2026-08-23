-- ============================================================
-- 033 - Retención de IRPF
--
-- No cambia el total de la factura: la retención es un descuento en el
-- COBRO, no en la factura. `total` sigue siendo base + IVA, que es lo que
-- el disparador de sellado ya recalcula por su cuenta desde las líneas.
-- ============================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS retencion_pct numeric;

COMMENT ON COLUMN public.invoices.retencion_pct IS 'Porcentaje de retención de IRPF. No afecta a total, subtotal ni total_tax: es informativo, para el cobro real y el modelo 111.';
