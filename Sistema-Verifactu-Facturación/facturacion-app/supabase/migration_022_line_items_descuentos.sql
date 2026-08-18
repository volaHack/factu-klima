-- ============================================================
-- 022 - Descuentos en cascada en líneas de factura
-- ============================================================
-- Complementa la migración 019 añadiendo descuentos 2 y 3 a líneas

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS discount_percent_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;

COMMENT ON COLUMN public.invoice_line_items.discount_percent_2 IS 'Segundo descuento en cascada sobre el artículo (ej. pronto pago)';
COMMENT ON COLUMN public.invoice_line_items.discount_percent_3 IS 'Tercer descuento en cascada sobre el artículo (ej. especial)';
COMMENT ON COLUMN public.invoice_line_items.cost_price IS 'Precio de coste del artículo para márgenes';
