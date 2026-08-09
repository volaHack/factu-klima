-- ============================================================
-- MIGRACIÓN 002 — CAPA ANTIFRAUDE / INTEGRIDAD VERIFACTU
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- QUÉ HACE Y POR QUÉ
-- ------------------
-- La app escribe DIRECTAMENTE contra Supabase con la clave pública.
-- Eso significa que cualquiera con las DevTools abiertas puede llamar a
-- la API REST y cambiar importes, fechas, numeración o la huella hash.
-- Las validaciones en React NO protegen: sólo son sugerencias.
--
-- Esta migración mueve TODA la integridad fiscal a Postgres, donde el
-- cliente no puede saltársela:
--
--   1. Huella SHA-256 encadenada calculada POR EL SERVIDOR (no por el cliente)
--   2. Inmutabilidad de facturas emitidas (no se editan ni se borran)
--   3. Registro de eventos append-only (quién intentó qué y cuándo)
--   4. Numeración única, correlativa y sin retroactividad de fechas
--   5. Totales recalculados en servidor desde las líneas
--   6. Detección de anomalías + función de verificación de la cadena
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================


-- ============================================================
-- 0. TIPOS Y HELPERS
-- ============================================================

-- Estados que significan "factura fiscalmente emitida" (sellada).
-- A partir de aquí la factura es inmutable.
CREATE OR REPLACE FUNCTION public.is_sealed_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_status IN ('emitida', 'pendiente', 'pagada', 'vencida', 'anulada');
$$;


-- ============================================================
-- 1. COLUMNAS DE INTEGRIDAD EN INVOICES
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS chain_index      BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash        TEXT,
  ADD COLUMN IF NOT EXISTS record_hash      TEXT,
  ADD COLUMN IF NOT EXISTS sealed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason    TEXT,
  ADD COLUMN IF NOT EXISTS rectifies_id     UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS issuer_nif       TEXT;

COMMENT ON COLUMN public.invoices.chain_index   IS 'Posición en la cadena de facturas selladas del usuario. Correlativo sin huecos.';
COMMENT ON COLUMN public.invoices.prev_hash     IS 'Huella del registro anterior de la cadena (encadenamiento VeriFactu).';
COMMENT ON COLUMN public.invoices.record_hash   IS 'Huella SHA-256 de este registro. Calculada por el servidor, NUNCA por el cliente.';
COMMENT ON COLUMN public.invoices.sealed_at     IS 'Momento del sellado fiscal. A partir de aquí la factura es inmutable.';


-- ============================================================
-- 2. UNICIDAD Y COHERENCIA DE NUMERACIÓN
-- ============================================================

-- Una factura no puede repetir número dentro de la misma serie y usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_user_series_number
  ON public.invoices (user_id, series, number);

-- La cadena es estrictamente correlativa por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_user_chain_index
  ON public.invoices (user_id, chain_index)
  WHERE chain_index IS NOT NULL;

-- Cada eslabón apunta a un anterior distinto: impide bifurcar la cadena.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_user_prev_hash
  ON public.invoices (user_id, prev_hash)
  WHERE prev_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_sealed
  ON public.invoices (user_id, sealed_at DESC)
  WHERE sealed_at IS NOT NULL;


-- ============================================================
-- 3. REGISTRO DE EVENTOS (APPEND-ONLY)
--    Registro inalterable de todo lo que pasa con las facturas,
--    incluidos los INTENTOS BLOQUEADOS de manipulación.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL,
  invoice_id    UUID,
  invoice_number TEXT,
  event_type    TEXT        NOT NULL,
  severity      TEXT        NOT NULL DEFAULT 'info',
  detail        TEXT,
  old_data      JSONB,
  new_data      JSONB,
  db_user       TEXT        NOT NULL DEFAULT current_user,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invoice_events IS
  'Registro de eventos append-only. Nadie (ni el propietario) puede modificarlo ni borrarlo.';

CREATE INDEX IF NOT EXISTS idx_events_user_time
  ON public.invoice_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity
  ON public.invoice_events (user_id, severity, occurred_at DESC)
  WHERE severity <> 'info';
CREATE INDEX IF NOT EXISTS idx_events_invoice
  ON public.invoice_events (invoice_id);


-- Escritor del log. SECURITY DEFINER para poder escribir aunque el
-- usuario no tenga permiso de INSERT sobre la tabla de eventos.
CREATE OR REPLACE FUNCTION public.log_invoice_event(
  p_user_id    UUID,
  p_invoice_id UUID,
  p_number     TEXT,
  p_type       TEXT,
  p_severity   TEXT,
  p_detail     TEXT,
  p_old        JSONB DEFAULT NULL,
  p_new        JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.invoice_events
    (user_id, invoice_id, invoice_number, event_type, severity, detail, old_data, new_data)
  VALUES
    (p_user_id, p_invoice_id, p_number, p_type, p_severity, p_detail, p_old, p_new);
END;
$$;


-- ============================================================
-- 4. CÁLCULO DE LA HUELLA (SERVIDOR)
--    sha256() es nativo de Postgres: no depende de pgcrypto ni de
--    en qué esquema esté instalado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_invoice_hash(
  p_issuer_nif TEXT,
  p_number     TEXT,
  p_issue_date DATE,
  p_total      NUMERIC,
  p_prev_hash  TEXT,
  p_sealed_at  TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(
    sha256(
      convert_to(
        COALESCE(p_issuer_nif, '')                                   || '|' ||
        COALESCE(p_number, '')                                       || '|' ||
        COALESCE(to_char(p_issue_date, 'YYYY-MM-DD'), '')             || '|' ||
        COALESCE(to_char(p_total, 'FM9999999999990.00'), '0.00')      || '|' ||
        COALESCE(p_prev_hash, 'GENESIS')                              || '|' ||
        COALESCE(to_char(p_sealed_at AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
        'UTF8'
      )
    ),
    'hex'
  );
$$;


-- ============================================================
-- 5. TRIGGER DE SELLADO
--    Al pasar a estado emitido: asigna posición en la cadena,
--    engancha con el hash anterior y calcula la huella.
--    Cualquier hash que mande el cliente se DESCARTA.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_invoice_seal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_hash  TEXT;
  v_prev_index BIGINT;
  v_prev_date  DATE;
  v_nif        TEXT;
  v_subtotal   NUMERIC(12,2);
  v_tax        NUMERIC(12,2);
  v_discount   NUMERIC(12,2);
  v_now        TIMESTAMPTZ := NOW();
BEGIN
  -- El cliente NUNCA decide la huella ni la posición en la cadena.
  IF TG_OP = 'INSERT' THEN
    NEW.record_hash := NULL;
    NEW.prev_hash   := NULL;
    NEW.chain_index := NULL;
    NEW.sealed_at   := NULL;
  ELSE
    NEW.record_hash := OLD.record_hash;
    NEW.prev_hash   := OLD.prev_hash;
    NEW.chain_index := OLD.chain_index;
    NEW.sealed_at   := OLD.sealed_at;
  END IF;

  -- ¿Toca sellar? Sólo la primera vez que alcanza un estado emitido.
  IF public.is_sealed_status(NEW.status) AND NEW.sealed_at IS NULL THEN

    -- Los importes que se sellan se recalculan AQUÍ desde las líneas.
    -- Aceptar el total que manda el cliente dejaría abierta la vía más
    -- obvia: emitir una factura cuyo total no cuadra con su detalle y
    -- que además queda firmada por el sistema.
    SELECT
      COALESCE(SUM(ROUND(quantity * unit_price * (1 - discount_percent / 100.0), 2)), 0),
      COALESCE(SUM(ROUND(quantity * unit_price * (1 - discount_percent / 100.0) * tax_rate / 100.0, 2)), 0),
      COALESCE(SUM(ROUND(quantity * unit_price * (discount_percent / 100.0), 2)), 0)
    INTO v_subtotal, v_tax, v_discount
    FROM public.invoice_line_items
    WHERE invoice_id = NEW.id;

    IF v_subtotal + v_tax <= 0 THEN
      RAISE EXCEPTION
        'ANTIFRAUDE: no se puede emitir la factura % sin líneas o con importe cero.', NEW.number
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.total IS DISTINCT FROM (v_subtotal + v_tax) THEN
      PERFORM public.log_invoice_event(
        NEW.user_id, NEW.id, NEW.number, 'TOTAL_CORRECTED', 'warning',
        format('El total enviado (%s) no coincidía con la suma de las líneas (%s). Se ha sellado el importe correcto.',
               NEW.total, v_subtotal + v_tax)
      );
    END IF;

    NEW.subtotal       := v_subtotal;
    NEW.total_tax      := v_tax;
    NEW.total_discount := v_discount;
    NEW.total          := v_subtotal + v_tax;

    SELECT nif INTO v_nif
    FROM public.company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Bloquea la cadena del usuario para evitar dos sellados simultáneos
    -- que compartirían prev_hash (condición de carrera).
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

    SELECT record_hash, chain_index, issue_date
      INTO v_prev_hash, v_prev_index, v_prev_date
    FROM public.invoices
    WHERE user_id = NEW.user_id
      AND sealed_at IS NOT NULL
    ORDER BY chain_index DESC
    LIMIT 1;

    -- Antirretroactividad: no se puede emitir con fecha anterior a la
    -- última factura ya emitida. Es el truco de fraude más común.
    IF v_prev_date IS NOT NULL AND NEW.issue_date < v_prev_date THEN
      PERFORM public.log_invoice_event(
        NEW.user_id, NEW.id, NEW.number, 'BACKDATE_BLOCKED', 'critical',
        format('Intento de emitir con fecha %s, anterior a la última emitida %s',
               NEW.issue_date, v_prev_date)
      );
      RAISE EXCEPTION
        'ANTIFRAUDE: no se puede emitir una factura con fecha % anterior a la última factura emitida (%). La numeración y las fechas deben ser correlativas.',
        NEW.issue_date, v_prev_date
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.issuer_nif  := COALESCE(NEW.issuer_nif, v_nif);
    NEW.chain_index := COALESCE(v_prev_index, 0) + 1;
    NEW.prev_hash   := v_prev_hash;
    NEW.sealed_at   := v_now;
    NEW.record_hash := public.compute_invoice_hash(
      NEW.issuer_nif, NEW.number, NEW.issue_date, NEW.total, v_prev_hash, v_now
    );
    NEW.verifactu_hash             := NEW.record_hash;
    NEW.verifactu_timestamp        := v_now;
    NEW.verifactu_signature_status := 'VALID';

    PERFORM public.log_invoice_event(
      NEW.user_id, NEW.id, NEW.number, 'INVOICE_SEALED', 'info',
      format('Factura sellada en posición %s de la cadena. Huella %s',
             NEW.chain_index, left(NEW.record_hash, 16)),
      NULL,
      jsonb_build_object('total', NEW.total, 'issue_date', NEW.issue_date,
                         'record_hash', NEW.record_hash, 'prev_hash', v_prev_hash)
    );

  ELSIF NEW.sealed_at IS NOT NULL THEN
    -- Ya sellada: la huella es la que es. El estado verifactu se mantiene.
    NEW.verifactu_hash             := NEW.record_hash;
    NEW.verifactu_timestamp        := NEW.sealed_at;
    NEW.verifactu_signature_status := 'VALID';
  ELSE
    -- Borrador: sin valor fiscal todavía.
    NEW.verifactu_hash             := NULL;
    NEW.verifactu_timestamp        := NULL;
    NEW.verifactu_signature_status := 'PENDING';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 6. TRIGGER DE INMUTABILIDAD
--    Una factura emitida no se toca. Punto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_invoice_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF OLD.sealed_at IS NULL THEN
    RETURN NEW;  -- borrador: edición libre
  END IF;

  -- Campos con efectos fiscales: intocables tras el sellado.
  IF NEW.number         IS DISTINCT FROM OLD.number         THEN v_changed := v_changed || 'number';         END IF;
  IF NEW.series         IS DISTINCT FROM OLD.series         THEN v_changed := v_changed || 'series';         END IF;
  IF NEW.issue_date     IS DISTINCT FROM OLD.issue_date     THEN v_changed := v_changed || 'issue_date';     END IF;
  IF NEW.subtotal       IS DISTINCT FROM OLD.subtotal       THEN v_changed := v_changed || 'subtotal';       END IF;
  IF NEW.total_tax      IS DISTINCT FROM OLD.total_tax      THEN v_changed := v_changed || 'total_tax';      END IF;
  IF NEW.total          IS DISTINCT FROM OLD.total          THEN v_changed := v_changed || 'total';          END IF;
  IF NEW.total_discount IS DISTINCT FROM OLD.total_discount THEN v_changed := v_changed || 'total_discount'; END IF;
  IF NEW.client_nif     IS DISTINCT FROM OLD.client_nif     THEN v_changed := v_changed || 'client_nif';     END IF;
  IF NEW.client_name    IS DISTINCT FROM OLD.client_name    THEN v_changed := v_changed || 'client_name';    END IF;
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id        THEN v_changed := v_changed || 'user_id';        END IF;

  IF array_length(v_changed, 1) > 0 THEN
    PERFORM public.log_invoice_event(
      OLD.user_id, OLD.id, OLD.number, 'TAMPER_BLOCKED', 'critical',
      format('Intento de modificar campos fiscales de una factura emitida: %s',
             array_to_string(v_changed, ', ')),
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: la factura % ya está emitida y sellada. No se pueden modificar los campos fiscales (%). Emite una factura rectificativa.',
      OLD.number, array_to_string(v_changed, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Transiciones de estado permitidas.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_sealed_status(NEW.status) THEN
      PERFORM public.log_invoice_event(
        OLD.user_id, OLD.id, OLD.number, 'STATUS_REVERT_BLOCKED', 'critical',
        format('Intento de devolver una factura emitida al estado "%s"', NEW.status),
        to_jsonb(OLD), to_jsonb(NEW)
      );
      RAISE EXCEPTION
        'ANTIFRAUDE: la factura % está emitida y no puede volver al estado "%".',
        OLD.number, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'anulada' THEN
      RAISE EXCEPTION
        'ANTIFRAUDE: la factura % está anulada. Es un estado final.', OLD.number
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'anulada' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
      PERFORM public.log_invoice_event(
        OLD.user_id, OLD.id, OLD.number, 'INVOICE_CANCELLED', 'warning',
        COALESCE(NEW.cancel_reason, 'Anulación sin motivo indicado')
      );
    ELSE
      PERFORM public.log_invoice_event(
        OLD.user_id, OLD.id, OLD.number, 'STATUS_CHANGED', 'info',
        format('%s → %s', OLD.status, NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 7. TRIGGER ANTIBORRADO
--    Una factura emitida no se borra jamás: se anula.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_invoice_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.sealed_at IS NOT NULL THEN
    PERFORM public.log_invoice_event(
      OLD.user_id, OLD.id, OLD.number, 'DELETE_BLOCKED', 'critical',
      format('Intento de BORRAR la factura emitida %s (total %s)', OLD.number, OLD.total),
      to_jsonb(OLD), NULL
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: la factura % está emitida y no se puede borrar. Anúlala o emite una rectificativa.',
      OLD.number
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.log_invoice_event(
    OLD.user_id, OLD.id, OLD.number, 'DRAFT_DELETED', 'info',
    'Borrador eliminado (sin efectos fiscales)'
  );
  RETURN OLD;
END;
$$;


-- ============================================================
-- 8. LÍNEAS DE FACTURA: BLOQUEO + RECÁLCULO DE TOTALES
--    Los totales los calcula el servidor desde las líneas, así el
--    cliente no puede mandar un total que no cuadre con el detalle.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_line_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_id      UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);  -- borrado en cascada de la factura
  END IF;

  IF v_invoice.sealed_at IS NOT NULL THEN
    PERFORM public.log_invoice_event(
      v_invoice.user_id, v_invoice.id, v_invoice.number, 'LINE_TAMPER_BLOCKED', 'critical',
      format('Intento de %s una línea de la factura emitida %s', TG_OP, v_invoice.number),
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: no se pueden alterar las líneas de la factura %, ya emitida.',
      v_invoice.number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id       UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_subtotal NUMERIC(12,2);
  v_tax      NUMERIC(12,2);
  v_discount NUMERIC(12,2);
BEGIN
  -- Nunca recalcular una factura sellada: sus importes son definitivos.
  IF EXISTS (SELECT 1 FROM public.invoices WHERE id = v_id AND sealed_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(ROUND(quantity * unit_price * (1 - discount_percent / 100.0), 2)), 0),
    COALESCE(SUM(ROUND(quantity * unit_price * (1 - discount_percent / 100.0) * tax_rate / 100.0, 2)), 0),
    COALESCE(SUM(ROUND(quantity * unit_price * (discount_percent / 100.0), 2)), 0)
  INTO v_subtotal, v_tax, v_discount
  FROM public.invoice_line_items
  WHERE invoice_id = v_id;

  UPDATE public.invoices
  SET subtotal       = v_subtotal,
      total_tax      = v_tax,
      total_discount = v_discount,
      total          = v_subtotal + v_tax
  WHERE id = v_id
    AND sealed_at IS NULL
    AND (subtotal, total_tax, total_discount, total)
        IS DISTINCT FROM (v_subtotal, v_tax, v_discount, v_subtotal + v_tax);

  RETURN NULL;
END;
$$;


-- ============================================================
-- 9. DESGLOSE DE IVA: MISMO BLOQUEO
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_tax_breakdown_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_id      UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  IF v_invoice.sealed_at IS NOT NULL THEN
    PERFORM public.log_invoice_event(
      v_invoice.user_id, v_invoice.id, v_invoice.number, 'TAX_TAMPER_BLOCKED', 'critical',
      format('Intento de %s el desglose de IVA de la factura emitida %s', TG_OP, v_invoice.number),
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: no se puede alterar el desglose de IVA de la factura %, ya emitida.',
      v_invoice.number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ============================================================
-- 10. REGISTRO DE EVENTOS: INALTERABLE PARA TODOS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'ANTIFRAUDE: el registro de eventos es inalterable. No se puede % ningún evento.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;


-- ============================================================
-- 11. AJUSTES DE EMPRESA: PROTEGER NIF Y CONTADOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_settings_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sealed_count INT;
BEGIN
  SELECT COUNT(*) INTO v_sealed_count
  FROM public.invoices
  WHERE user_id = NEW.user_id AND sealed_at IS NOT NULL;

  IF v_sealed_count = 0 THEN
    RETURN NEW;  -- todavía no hay historial fiscal: libre
  END IF;

  -- El NIF emisor entra en el cálculo de todas las huellas ya emitidas.
  IF NEW.nif IS DISTINCT FROM OLD.nif THEN
    PERFORM public.log_invoice_event(
      NEW.user_id, NULL, NULL, 'NIF_CHANGE_BLOCKED', 'critical',
      format('Intento de cambiar el NIF emisor de %s a %s con %s facturas ya emitidas',
             OLD.nif, NEW.nif, v_sealed_count)
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: no se puede cambiar el NIF emisor: ya hay % facturas emitidas cuya huella depende de él.',
      v_sealed_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- El contador de numeración nunca retrocede: reutilizar un número
  -- ya emitido es la vía directa a duplicar facturas.
  IF NEW.next_invoice_number < OLD.next_invoice_number THEN
    PERFORM public.log_invoice_event(
      NEW.user_id, NULL, NULL, 'COUNTER_ROLLBACK_BLOCKED', 'critical',
      format('Intento de retroceder el contador de facturas de %s a %s',
             OLD.next_invoice_number, NEW.next_invoice_number)
    );
    RAISE EXCEPTION
      'ANTIFRAUDE: el contador de facturación no puede retroceder (% → %).',
      OLD.next_invoice_number, NEW.next_invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 12. ALTA DE TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS tr_invoice_seal          ON public.invoices;
DROP TRIGGER IF EXISTS tr_invoice_immutable     ON public.invoices;
DROP TRIGGER IF EXISTS tr_invoice_no_delete     ON public.invoices;
DROP TRIGGER IF EXISTS tr_line_items_guard      ON public.invoice_line_items;
DROP TRIGGER IF EXISTS tr_line_items_recalc     ON public.invoice_line_items;
DROP TRIGGER IF EXISTS tr_tax_breakdown_guard   ON public.invoice_tax_breakdown;
DROP TRIGGER IF EXISTS tr_events_append_only    ON public.invoice_events;
DROP TRIGGER IF EXISTS tr_settings_guard        ON public.company_settings;

-- Inmutabilidad ANTES que sellado, para que un intento de manipular
-- una factura ya emitida se rechace antes de tocar la cadena.
CREATE TRIGGER tr_invoice_immutable
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_immutable();

CREATE TRIGGER tr_invoice_seal
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_seal();

CREATE TRIGGER tr_invoice_no_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_no_delete();

CREATE TRIGGER tr_line_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_line_items_guard();

CREATE TRIGGER tr_line_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_invoice_totals();

CREATE TRIGGER tr_tax_breakdown_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_tax_breakdown
  FOR EACH ROW EXECUTE FUNCTION public.fn_tax_breakdown_guard();

CREATE TRIGGER tr_events_append_only
  BEFORE UPDATE OR DELETE ON public.invoice_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_append_only();

CREATE TRIGGER tr_settings_guard
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_settings_guard();


-- ============================================================
-- 13. VERIFICACIÓN DE LA CADENA
--     Recalcula todas las huellas y detecta el primer eslabón roto.
--     Si alguien ha tocado la base de datos por fuera, sale aquí.
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_invoice_chain()
RETURNS TABLE (
  chain_index    BIGINT,
  invoice_id     UUID,
  invoice_number TEXT,
  issue_date     DATE,
  total          NUMERIC,
  status         TEXT,
  expected_hash  TEXT,
  stored_hash    TEXT,
  problem        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  r            RECORD;
  v_prev_hash  TEXT := NULL;
  v_expected   TEXT;
  v_prev_index BIGINT := 0;
  v_prev_date  DATE := NULL;
  v_problem    TEXT;
BEGIN
  FOR r IN
    SELECT i.* FROM public.invoices i
    WHERE i.user_id = (SELECT auth.uid())
      AND i.sealed_at IS NOT NULL
    ORDER BY i.chain_index ASC
  LOOP
    v_problem := NULL;

    v_expected := public.compute_invoice_hash(
      r.issuer_nif, r.number, r.issue_date, r.total, v_prev_hash, r.sealed_at
    );

    IF r.record_hash IS DISTINCT FROM v_expected THEN
      v_problem := 'HUELLA ALTERADA: los datos de la factura no corresponden a su huella. '
                || 'Alguien ha modificado la fila directamente en la base de datos.';
    ELSIF r.prev_hash IS DISTINCT FROM v_prev_hash THEN
      v_problem := 'CADENA ROTA: el enlace con la factura anterior no coincide.';
    ELSIF r.chain_index <> v_prev_index + 1 THEN
      v_problem := format('HUECO EN LA CADENA: se esperaba la posición %s y se encontró %s. '
                       || 'Falta una factura o ha sido eliminada.', v_prev_index + 1, r.chain_index);
    ELSIF v_prev_date IS NOT NULL AND r.issue_date < v_prev_date THEN
      v_problem := format('FECHA RETROACTIVA: emitida el %s, después de una factura del %s.',
                          r.issue_date, v_prev_date);
    END IF;

    IF v_problem IS NOT NULL THEN
      chain_index := r.chain_index; invoice_id := r.id; invoice_number := r.number;
      issue_date := r.issue_date;   total := r.total;   status := r.status;
      expected_hash := v_expected;  stored_hash := r.record_hash; problem := v_problem;
      RETURN NEXT;
    END IF;

    v_prev_hash  := r.record_hash;
    v_prev_index := r.chain_index;
    v_prev_date  := r.issue_date;
  END LOOP;
END;
$$;


-- Resumen compacto para el panel de integridad de la app.
CREATE OR REPLACE FUNCTION public.invoice_chain_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_total    INT;
  v_broken   INT;
  v_last     TIMESTAMPTZ;
  v_alerts   INT;
BEGIN
  SELECT COUNT(*), MAX(sealed_at) INTO v_total, v_last
  FROM public.invoices
  WHERE user_id = (SELECT auth.uid()) AND sealed_at IS NOT NULL;

  SELECT COUNT(*) INTO v_broken FROM public.verify_invoice_chain();

  SELECT COUNT(*) INTO v_alerts
  FROM public.invoice_events
  WHERE user_id = (SELECT auth.uid())
    AND severity = 'critical'
    AND occurred_at > NOW() - INTERVAL '90 days';

  RETURN jsonb_build_object(
    'sealed_invoices',  v_total,
    'broken_links',     v_broken,
    'last_sealed_at',   v_last,
    'critical_alerts',  v_alerts,
    'chain_valid',      (v_broken = 0),
    'checked_at',       NOW()
  );
END;
$$;


-- ============================================================
-- 14. RLS Y PERMISOS
-- ============================================================

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_read_own" ON public.invoice_events;
CREATE POLICY "events_read_own" ON public.invoice_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Sólo lectura: el log lo escriben los triggers (SECURITY DEFINER).
REVOKE ALL     ON public.invoice_events FROM authenticated;
GRANT  SELECT  ON public.invoice_events TO   authenticated;

-- El borrado se controla en el trigger fn_invoice_no_delete, NO quitando
-- el permiso de la tabla: hay que poder borrar borradores y bloquear sólo
-- las facturas selladas, y un REVOKE no distingue entre ambos casos.
GRANT DELETE ON public.invoices TO authenticated;

GRANT EXECUTE ON FUNCTION public.verify_invoice_chain()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_chain_status()  TO authenticated;

-- Estas no las llama nunca el cliente: sólo los triggers.
REVOKE ALL ON FUNCTION public.log_invoice_event(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, authenticated, anon;


-- ============================================================
-- 15. SELLADO DE LAS FACTURAS YA EXISTENTES
--     Enlaza el historial actual en una cadena válida por orden de
--     emisión. A partir de aquí, todo queda protegido.
-- ============================================================

-- Se sellan una a una y EN ORDEN CRONOLÓGICO, dejando que sea el propio
-- trigger tr_invoice_seal quien calcule el enlace y la huella. Así el
-- histórico queda encadenado exactamente igual que las facturas nuevas.
DO $$
DECLARE
  v_id       UUID;
  v_number   TEXT;
  v_sealed   INT := 0;
  v_skipped  INT := 0;
  v_err      TEXT;
BEGIN
  FOR v_id, v_number IN
    SELECT id, number FROM public.invoices
    WHERE public.is_sealed_status(status)
      AND sealed_at IS NULL
    ORDER BY user_id, issue_date ASC, created_at ASC, number ASC
  LOOP
    BEGIN
      -- UPDATE inocuo: dispara el trigger de sellado sin tocar datos fiscales.
      UPDATE public.invoices SET updated_at = updated_at WHERE id = v_id;
      v_sealed := v_sealed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Una factura antigua sin líneas, o con numeración incoherente, no
      -- debe abortar la migración entera: se deja sin sellar y se avisa.
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_skipped := v_skipped + 1;
      RAISE WARNING 'No se pudo sellar la factura % : %', v_number, v_err;
    END;
  END LOOP;

  RAISE NOTICE '== ANTIFRAUDE INSTALADO ==';
  RAISE NOTICE 'Facturas del histórico selladas y encadenadas: %', v_sealed;
  IF v_skipped > 0 THEN
    RAISE NOTICE 'Facturas que NO se han podido sellar: % (ver los WARNING de arriba).', v_skipped;
    RAISE NOTICE 'Revísalas a mano: normalmente les faltan líneas de detalle.';
  END IF;
END;
$$;


-- ============================================================
-- 16. COMPROBACIÓN FINAL
--     Debe devolver 0 filas. Si devuelve algo, la cadena ya venía rota.
-- ============================================================

-- SELECT * FROM public.verify_invoice_chain();
-- SELECT public.invoice_chain_status();
