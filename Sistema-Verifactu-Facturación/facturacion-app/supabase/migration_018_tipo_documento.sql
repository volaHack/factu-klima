-- ============================================================
-- 018 - Documento único: tipo y sentido en `invoices`
-- Los triggers antifraude solo sellan factura/rectificativa de VENTA.
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'factura',
  ADD COLUMN IF NOT EXISTS sentido text NOT NULL DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS documento_origen_id uuid,
  ADD COLUMN IF NOT EXISTS documento_origen_number text,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_tipo' AND conrelid = 'public.invoices'::regclass) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT chk_invoices_tipo CHECK (tipo IN ('presupuesto','pedido','albaran','factura','rectificativa'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_sentido' AND conrelid = 'public.invoices'::regclass) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT chk_invoices_sentido CHECK (sentido IN ('venta','compra'));
  END IF;
END $$;

-- company_settings: series y contadores por (tipo, sentido) en JSONB
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS series_documentos jsonb NOT NULL DEFAULT '{}'::jsonb;

-- clients: proveedor y vendedor asignado
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS es_proveedor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid;

-- vendedores: entidad de vendedores con series propias por tipo
CREATE TABLE IF NOT EXISTS public.vendedores (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  series jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendedores' AND policyname = 'vendedores_own'
  ) THEN
    CREATE POLICY vendedores_own ON public.vendedores USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.tipo IS 'Tipo de documento único: presupuesto, pedido, albaran, factura o rectificativa';
COMMENT ON COLUMN public.invoices.sentido IS 'Sentido comercial: venta o compra';
COMMENT ON COLUMN public.invoices.documento_origen_id IS 'Documento del que procede (albarán→factura, pedido→albarán, ...)';
COMMENT ON COLUMN public.invoices.documento_origen_number IS 'Número legible del documento de origen';
COMMENT ON COLUMN public.invoices.vendedor_id IS 'Vendedor asociado (para series por vendedor)';
COMMENT ON COLUMN public.company_settings.series_documentos IS 'Series y contadores por (tipo, sentido) en JSONB';
COMMENT ON COLUMN public.clients.es_proveedor IS 'Indica si el registro actúa como proveedor para compras';
COMMENT ON COLUMN public.clients.vendedor_id IS 'Vendedor asignado al cliente';
COMMENT ON TABLE public.vendedores IS 'Vendedores del sistema con series propias de facturación';



-- ============================================================
-- Helper común: qué documentos son sellables.
-- Punto único de verdad usado por los triggers de sellado,
-- renumeración offline e inmutabilidad. Se califica como public.*
-- desde las funciones SECURITY DEFINER (search_path = '').
-- ============================================================

CREATE OR REPLACE FUNCTION public.es_documento_sellable(tipo text, sentido text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(tipo, 'factura') IN ('factura', 'rectificativa')
     AND COALESCE(sentido, 'venta') = 'venta';
$$;


-- ============================================================
-- 1. TRIGGER DE SELLADO (base: migration_011, vigente en BD)
--    Se mantienen la relajación de backdate offline y la limpieza
--    de number_temporary. Solo se sella factura/rectificativa de venta.
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
  -- Los documentos previos a factura y toda la compra NO se sellan.
  -- En UPDATE se clasifica por OLD (estado real de la fila): una factura
  -- ya sellada no puede entrar en esta rama ni siquiera cambiando
  -- tipo/sentido en el mismo UPDATE (la re-clasificación de una sellada
  -- es exactamente el vector que fn_invoice_immutable bloquea).
  -- Nota (asimetría de conversión en un solo UPDATE): si un UPDATE convierte
  -- un presupuesto en factura y la emite a la vez, OLD es presupuesto y esta
  -- rama lo deja sin sellar. La app convierte siempre creando un borrador y
  -- emitiendo después, así que no es alcanzable desde la aplicación.
  IF (TG_OP = 'INSERT'
        AND NOT public.es_documento_sellable(NEW.tipo, NEW.sentido))
     OR (TG_OP = 'UPDATE'
        AND OLD.sealed_at IS NULL
        AND NOT public.es_documento_sellable(OLD.tipo, OLD.sentido)) THEN
    NEW.record_hash := NULL;
    NEW.prev_hash   := NULL;
    NEW.chain_index := NULL;
    NEW.sealed_at   := NULL;
    NEW.verifactu_hash             := NULL;
    NEW.verifactu_timestamp        := NULL;
    NEW.verifactu_signature_status := 'PENDING';
    RETURN NEW;
  END IF;

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

    -- Antirretroactividad: no se puede emitir con fecha anterior a la última
    -- factura ya emitida — salvo tickets OFFLINE (number_temporary aún true),
    -- que conservan su fecha real de venta aunque lleguen tarde. En ese caso
    -- se registra en el log en vez de bloquear.
    IF v_prev_date IS NOT NULL AND NEW.issue_date < v_prev_date THEN
      IF NEW.number_temporary THEN
        PERFORM public.log_invoice_event(
          NEW.user_id, NEW.id, NEW.number, 'OFFLINE_BACKDATE_ALLOWED', 'warning',
          format('Ticket offline del %s sincronizado tras facturas del %s.',
                 NEW.issue_date, v_prev_date)
        );
      ELSE
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
    -- El ticket offline ya quedó renumerado y sellado: se limpia el flag.
    NEW.number_temporary := false;

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
-- 2. TRIGGER DE INMUTABILIDAD (base: migration_002)
--    Una factura emitida no se toca. Punto. El resto de documentos
--    (presupuestos, pedidos, albaranes, compras) quedan editables porque
--    nunca se sellan (OLD.sealed_at siempre NULL para ellos).
--    La clasificación se basa en OLD: una factura sellada es intocable
--    incluso si el UPDATE intenta re-clasificarla como presupuesto.
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
    RETURN NEW;  -- borrador (y todo documento no sellable): edición libre
  END IF;

  -- Campos con efectos fiscales o documentales: intocables tras el sellado.
  -- tipo/sentido/origen/vendedor se protegen aquí: re-clasificar una factura
  -- sellada como presupuesto (o traspasarla a otro vendedor/origen) sería la
  -- puerta para reescribir su contenido y sacarla de la cadena de verificación.
  -- sealed_at/record_hash/prev_hash/chain_index NO se listan a propósito:
  -- fn_invoice_seal los restaura desde OLD en todo UPDATE (defensa en
  -- profundidad). Si se refactoriza el seal, añadirlos aquí.
  IF NEW.number                  IS DISTINCT FROM OLD.number                  THEN v_changed := array_append(v_changed, 'number');                  END IF;
  IF NEW.series                  IS DISTINCT FROM OLD.series                  THEN v_changed := array_append(v_changed, 'series');                  END IF;
  IF NEW.issue_date              IS DISTINCT FROM OLD.issue_date              THEN v_changed := array_append(v_changed, 'issue_date');              END IF;
  IF NEW.subtotal                IS DISTINCT FROM OLD.subtotal                THEN v_changed := array_append(v_changed, 'subtotal');                END IF;
  IF NEW.total_tax               IS DISTINCT FROM OLD.total_tax               THEN v_changed := array_append(v_changed, 'total_tax');               END IF;
  IF NEW.total                   IS DISTINCT FROM OLD.total                   THEN v_changed := array_append(v_changed, 'total');                   END IF;
  IF NEW.total_discount          IS DISTINCT FROM OLD.total_discount          THEN v_changed := array_append(v_changed, 'total_discount');          END IF;
  IF NEW.client_nif              IS DISTINCT FROM OLD.client_nif              THEN v_changed := array_append(v_changed, 'client_nif');              END IF;
  IF NEW.client_name             IS DISTINCT FROM OLD.client_name             THEN v_changed := array_append(v_changed, 'client_name');             END IF;
  IF NEW.user_id                 IS DISTINCT FROM OLD.user_id                 THEN v_changed := array_append(v_changed, 'user_id');                 END IF;
  IF NEW.tipo                    IS DISTINCT FROM OLD.tipo                    THEN v_changed := array_append(v_changed, 'tipo');                    END IF;
  IF NEW.sentido                 IS DISTINCT FROM OLD.sentido                 THEN v_changed := array_append(v_changed, 'sentido');                 END IF;
  IF NEW.documento_origen_id     IS DISTINCT FROM OLD.documento_origen_id     THEN v_changed := array_append(v_changed, 'documento_origen_id');     END IF;
  IF NEW.documento_origen_number IS DISTINCT FROM OLD.documento_origen_number THEN v_changed := array_append(v_changed, 'documento_origen_number'); END IF;
  IF NEW.vendedor_id             IS DISTINCT FROM OLD.vendedor_id             THEN v_changed := array_append(v_changed, 'vendedor_id');             END IF;

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
-- 3. TRIGGER ANTIBORRADO (base: migration_002)
--    Una factura emitida no se borra jamás: se anula.
--    El resto de documentos (nunca sellados) se pueden borrar libremente.
--    No hace falta guarda de tipo: el check de OLD.sealed_at es suficiente.
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
-- 4. NUMERACIÓN TEMPORAL OFFLINE (base: migration_011)
--    Solo renumera tickets offline de factura/rectificativa de venta.
--    Se clasifica por OLD (estado real de la fila).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_invoice_offline_renumber()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_series    TEXT;
  v_year      INT;
  v_base      TEXT;
  v_max       BIGINT := 0;
  v_candidate TEXT;
  v_num       TEXT;
BEGIN
  -- Solo se renumera factura/rectificativa de venta.
  IF NOT public.es_documento_sellable(
       COALESCE(OLD.tipo, NEW.tipo, 'factura'),
       COALESCE(OLD.sentido, NEW.sentido, 'venta')) THEN
    RETURN NEW;
  END IF;

  -- Sólo tickets offline aún sin sellar. Ya sellado o número normal: nada.
  IF NOT NEW.number_temporary OR NEW.sealed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- El número tiene formato SERIE-AÑO-0000[-SUFIJO].
  v_series := split_part(NEW.number, '-', 1);
  IF v_series = '' THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_year := split_part(NEW.number, '-', 2)::INT;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- Idempotencia entre las dos pasadas del sync (borrador → emitida):
  -- si esta fila ya quedó renumerada con un correlativo limpio en esta
  -- serie+año, se reutiliza y no se vuelve a tocar (evita que el segundo
  -- upsert sume uno de más por llegar con el número original con sufijo).
  IF TG_OP = 'UPDATE' AND OLD.number_temporary
     AND OLD.number ~ ('^' || v_series || '-' || v_year || '-[0-9]+$') THEN
    NEW.number := OLD.number;
    RETURN NEW;
  END IF;

  -- Lock por (usuario, serie): dos syncs simultáneos de la misma serie no
  -- pueden asignar el mismo correlativo a la vez.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || v_series, 0));

  -- Máximo correlativo existente en serie+año (3er segmento, ignora sufijos).
  SELECT COALESCE(MAX((regexp_match(number,
    '^' || v_series || '-' || v_year || '-([0-9]+)'))[1]::BIGINT), 0)
  INTO v_max
  FROM public.invoices
  WHERE user_id = NEW.user_id
    AND series = v_series
    AND number ~ ('^' || v_series || '-' || v_year || '-[0-9]+');

  -- Siguiente correlativo libre (nunca se reutiliza un número ya asignado).
  LOOP
    v_max := v_max + 1;
    v_num := lpad(v_max::text, 4, '0');
    v_candidate := v_series || '-' || v_year || '-' || v_num;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE user_id = NEW.user_id AND series = v_series AND number = v_candidate
    );
  END LOOP;

  -- Siempre se deja el correlativo limpio (sin sufijo): si no hay colisión
  -- es el mismo número que llegó, y si la hay, el siguiente libre.
  v_base := v_series || '-' || v_year || '-' || split_part(NEW.number, '-', 3);
  IF v_candidate <> v_base THEN
    PERFORM public.log_invoice_event(
      NEW.user_id, NEW.id, NEW.number, 'OFFLINE_RENUMBERED', 'info',
      format('Ticket offline renumerado de %s a %s', NEW.number, v_candidate)
    );
  END IF;
  NEW.number := v_candidate;

  -- Se MANTIENE number_temporary a true: fn_invoice_seal (que corre después
  -- por orden alfabético de trigger) la usa para relajar el control de fecha
  -- retroactiva sólo para tickets offline y la limpia al sellar.
  RETURN NEW;
END;
$$;
