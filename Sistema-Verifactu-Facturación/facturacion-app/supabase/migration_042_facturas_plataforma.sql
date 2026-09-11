-- ============================================================
-- MIGRACIÓN 042: facturas de la propia plataforma
--
-- Cada cobro de Stripe (suscripción o propina) se convierte en una factura
-- de la cuenta emisora (Elena), sellada por el trigger de siempre. La
-- función numera, inserta y emite en UNA transacción: si algo falla no
-- queda un borrador a medias, y un cobro repetido devuelve la factura que
-- ya existía (origen_externo es único).
-- ============================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS origen_externo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_origen_externo_unico
  ON public.invoices (origen_externo) WHERE origen_externo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.plataforma_config (
  id                   BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  emisor_user_id       UUID NOT NULL REFERENCES auth.users(id),
  serie_suscripciones  TEXT NOT NULL DEFAULT 'SUS',
  serie_propinas       TEXT NOT NULL DEFAULT 'PROP',
  regimen_igic         TEXT NOT NULL DEFAULT 'general' CHECK (regimen_igic IN ('general', 'pequeno_empresario')),
  -- Stripe suma el IGIC a clientes canarios. Apagado hasta que el gestor
  -- confirme el régimen: mientras tanto el IGIC sale de dentro del cobro.
  cobrar_impuesto      BOOLEAN NOT NULL DEFAULT false,
  stripe_tax_rate_igic TEXT
);
ALTER TABLE public.plataforma_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_config FROM anon, authenticated;

INSERT INTO public.plataforma_config (emisor_user_id)
SELECT id FROM auth.users WHERE lower(email) = 'volitancrooss@gmail.com'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_emitir_factura_plataforma(p JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id     UUID;
  v_cfg    public.plataforma_config%ROWTYPE;
  v_serie  TEXT := p->>'serie';
  v_fecha  DATE := (p->>'fecha')::date;
  v_anio   INT  := extract(year FROM (p->>'fecha')::date);
  v_max    BIGINT;
  v_numero TEXT;
  l        JSONB;
  v_orden  INT := 0;
BEGIN
  SELECT id INTO v_id FROM public.invoices WHERE origen_externo = p->>'origen_externo';
  IF FOUND THEN RETURN v_id; END IF;

  SELECT * INTO v_cfg FROM public.plataforma_config WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLATAFORMA: falta la fila de plataforma_config.'; END IF;

  -- Mismo cerrojo por (usuario, serie) que fn_invoice_offline_renumber.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cfg.emisor_user_id::text || v_serie, 0));
  SELECT COALESCE(MAX((regexp_match(number, '^' || v_serie || '-' || v_anio || '-([0-9]+)$'))[1]::BIGINT), 0)
    INTO v_max FROM public.invoices WHERE user_id = v_cfg.emisor_user_id AND series = v_serie;
  v_numero := v_serie || '-' || v_anio || '-' || lpad((v_max + 1)::text, 4, '0');
  v_id := gen_random_uuid();

  INSERT INTO public.invoices (
    id, user_id, number, series, client_name, client_nif, client_address,
    issue_date, due_date, paid_date, status, subtotal, total_discount, total_tax, total,
    payment_method, notes, tipo, sentido, tipo_factura_fiscal,
    documento_origen_id, documento_origen_number, datos_extras, origen_externo
  ) VALUES (
    v_id, v_cfg.emisor_user_id, v_numero, v_serie, p->>'cliente_nombre',
    NULLIF(p->>'cliente_nif', ''), NULLIF(p->>'cliente_direccion', ''),
    v_fecha, v_fecha, v_fecha, 'borrador', 0, 0, 0, 0,
    'tarjeta', NULLIF(p->>'notas', ''), p->>'tipo', 'venta', p->>'tipo_factura_fiscal',
    NULLIF(p->>'documento_origen_id', '')::uuid, NULLIF(p->>'documento_origen_number', ''),
    COALESCE(p->'datos_extras', '{}'::jsonb), p->>'origen_externo'
  );

  FOR l IN SELECT value FROM jsonb_array_elements(p->'lineas') LOOP
    INSERT INTO public.invoice_line_items
      (invoice_id, product_name, quantity, unit_price, unit, tax_rate, discount_percent, subtotal, tax_amount, total, sort_order)
    VALUES (
      v_id, l->>'concepto', (l->>'cantidad')::numeric, (l->>'precio')::numeric, 'ud', (l->>'tipo')::int, 0,
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2),
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric * (l->>'tipo')::int / 100.0, 2),
      round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2)
        + round((l->>'cantidad')::numeric * (l->>'precio')::numeric * (l->>'tipo')::int / 100.0, 2),
      v_orden
    );
    v_orden := v_orden + 1;
  END LOOP;

  INSERT INTO public.invoice_tax_breakdown (invoice_id, rate, base_amount, tax_amount)
  SELECT v_id, tax_rate, sum(subtotal), sum(tax_amount)
  FROM public.invoice_line_items WHERE invoice_id = v_id GROUP BY tax_rate;

  -- Ya está cobrada: se emite directamente como pagada. `pagada` es un
  -- estado sellado (is_sealed_status), así que aquí sella fn_invoice_seal.
  UPDATE public.invoices SET status = 'pagada' WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_emitir_factura_plataforma(JSONB) FROM PUBLIC, anon, authenticated;
