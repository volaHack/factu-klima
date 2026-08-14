-- ============================================================
-- 019 - Tarifas de precios, referencia de proveedor y descuentos en cascada
-- ============================================================

-- company_settings: tarifas de precios definidas en la empresa
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS tarifas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- products: referencia del proveedor y matriz de precios por tarifa
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_ref text,
  ADD COLUMN IF NOT EXISTS tarifa_prices jsonb NOT NULL DEFAULT '{}'::jsonb;

-- clients: tarifa asignada y descuentos por defecto (hasta 3 en cascada)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tarifa_id text,
  ADD COLUMN IF NOT EXISTS default_discounts numeric[] NOT NULL DEFAULT '{0,0,0}';

-- invoices: tarifa usada y descuentos globales al pie de documento
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tarifa_id text,
  ADD COLUMN IF NOT EXISTS global_discount_percent_1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_discount_percent_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_discount_percent_3 numeric DEFAULT 0;

COMMENT ON COLUMN public.company_settings.tarifas IS 'Listado de tarifas comerciales (id, nombre, activa, porcentajeDefecto)';
COMMENT ON COLUMN public.products.supplier_ref IS 'Referencia interna del proveedor para compras y cotejo';
COMMENT ON COLUMN public.products.tarifa_prices IS 'Precios unitarios por tarifa: { [tarifaId]: precio }';
COMMENT ON COLUMN public.clients.tarifa_id IS 'Tarifa de precios asociada al cliente';
COMMENT ON COLUMN public.clients.default_discounts IS 'Descuentos por defecto en cascada (hasta 3 en línea)';
COMMENT ON COLUMN public.invoices.tarifa_id IS 'Tarifa aplicada en este documento';
COMMENT ON COLUMN public.invoices.global_discount_percent_1 IS 'Descuento global 1 al pie del documento (ej. descuento comercial)';
COMMENT ON COLUMN public.invoices.global_discount_percent_2 IS 'Descuento global 2 al pie del documento (ej. pronto pago)';
COMMENT ON COLUMN public.invoices.global_discount_percent_3 IS 'Descuento global 3 al pie del documento (ej. especial)';
