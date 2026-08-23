-- ============================================================
-- MIGRACIÓN 035 — SII (Suministro Inmediato de Información)
-- ============================================================
--
-- El SII obliga a las empresas con facturación >6M€ a enviar sus
-- libros de IVA a la AEAT en un plazo de 4 días naturales.
-- Esta migración crea las tablas de configuración, registro de envíos
-- y el estado SII por factura.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- 1. Configuración SII por empresa
CREATE TABLE IF NOT EXISTS public.sii_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT false,
  -- Modo: test usa el endpoint de pruebas de la AEAT
  modo TEXT NOT NULL DEFAULT 'test' CHECK (modo IN ('test', 'produccion')),
  -- Envío automático al emitir la factura, o manual desde el panel SII
  envio_automatico BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.sii_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sii_config_owner" ON public.sii_config
  FOR ALL USING (auth.uid() = user_id);

-- 2. Registro de envíos al SII
CREATE TABLE IF NOT EXISTS public.sii_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Puede contener una o varias facturas (envío por lote)
  invoice_ids UUID[] NOT NULL DEFAULT '{}',
  -- Tipo de libro: emitidas (ventas) o recibidas (compras)
  tipo_libro TEXT NOT NULL CHECK (tipo_libro IN ('emitidas', 'recibidas')),
  -- El XML SOAP enviado a la AEAT
  xml_payload TEXT,
  -- Respuesta
  aeat_csv TEXT,            -- Código Seguro de Verificación de la respuesta
  aeat_response_body TEXT,
  submission_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (submission_status IN ('pendiente', 'enviado', 'aceptado', 'aceptado_con_errores', 'rechazado')),
  submission_error TEXT,
  -- Fechas
  submitted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Reintentos
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ
);

ALTER TABLE public.sii_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sii_submissions_owner" ON public.sii_submissions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sii_submissions_user_status
  ON public.sii_submissions (user_id, submission_status);

-- 3. Estado SII en cada factura
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sii_status TEXT
    CHECK (sii_status IS NULL OR sii_status IN ('pendiente_sii', 'enviado_sii', 'aceptado_sii', 'rechazado_sii')),
  ADD COLUMN IF NOT EXISTS sii_submission_id UUID REFERENCES public.sii_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_factura_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS clave_regimen_iva TEXT,
  ADD COLUMN IF NOT EXISTS es_intracomunitaria BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_operacion_349 TEXT
    CHECK (tipo_operacion_349 IS NULL OR tipo_operacion_349 IN ('E', 'A', 'T', 'S', 'I')),
  ADD COLUMN IF NOT EXISTS client_vat_number TEXT;

-- 4. VAT Number en clientes
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS vat_number TEXT;

COMMENT ON COLUMN public.invoices.sii_status IS 'Estado del envío al SII: pendiente, enviado, aceptado o rechazado.';
COMMENT ON COLUMN public.invoices.tipo_factura_fiscal IS 'F1/F2/F3/R1-R5 según el tipo de factura para la AEAT.';
COMMENT ON COLUMN public.invoices.clave_regimen_iva IS 'Clave 01-17 del régimen especial de IVA (obligatoria en Verifactu y SII).';
COMMENT ON COLUMN public.invoices.es_intracomunitaria IS 'true si la operación es intracomunitaria (cliente con VAT de otro país UE).';
COMMENT ON COLUMN public.invoices.tipo_operacion_349 IS 'Clave de operación para el Modelo 349: E/A/T/S/I.';
COMMENT ON COLUMN public.invoices.client_vat_number IS 'NIF-IVA del destinatario, copiado del cliente al emitir.';
COMMENT ON COLUMN public.clients.vat_number IS 'NIF-IVA intracomunitario (VAT Number). Formato: código país + número.';
