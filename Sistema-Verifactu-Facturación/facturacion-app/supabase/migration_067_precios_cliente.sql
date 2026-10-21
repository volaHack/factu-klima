-- ============================================================
-- 067 - Código de cliente y precios especiales por cliente
--
-- Un distribuidor no le vende a todos igual. Además de la tarifa (que
-- agrupa a muchos clientes), cada cliente puede tener lo suyo:
--
--   · Un precio fijo para un artículo («a este bar las papas a 1,49 €»).
--   · Un descuento para un artículo («a este, un 5 % en el café»).
--   · Un descuento para toda una familia («un 5 % en fregonas, bayetas y
--     estropajos»).
--
-- Es como lo llevan ISECAN, Factusol y casi todos los programas de
-- distribución, y lo que hace falta para pasar sus datos sin perder nada.
-- Cada condición tiene su «activo»: se puede dejar apuntada y apagada.
--
-- El código es el número con el que el almacén conoce al cliente (el 260,
-- o la cuenta 4300000260): se busca por él y se imprime en el albarán.
--
-- Se guardan en la propia ficha (jsonb) igual que los precios por tarifa
-- de cada producto (migración 019): se leen siempre junto al cliente y
-- heredan su RLS.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS precios_especiales jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS descuentos_familia jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_precios_especiales_lista') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_precios_especiales_lista
      CHECK (jsonb_typeof(precios_especiales) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_descuentos_familia_lista') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_descuentos_familia_lista
      CHECK (jsonb_typeof(descuentos_familia) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.clients.codigo IS 'Código del cliente en la empresa (p. ej. el de su programa anterior)';
COMMENT ON COLUMN public.clients.precios_especiales IS 'Por artículo: [{ productId, precio?, descuento?, activo }]. precio = precio fijo sin impuesto; descuento = % en la línea';
COMMENT ON COLUMN public.clients.descuentos_familia IS 'Por familia: [{ categoria, descuento, activo }]. categoria = id de la categoría del producto';
