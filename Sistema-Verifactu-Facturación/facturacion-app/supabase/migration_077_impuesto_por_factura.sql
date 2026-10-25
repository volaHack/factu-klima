-- ============================================================
-- 077 · CADA FACTURA GUARDA SU IMPUESTO (IVA O IGIC)
--
-- Hasta ahora el rótulo «IVA» o «IGIC» de una factura salía del ajuste de la
-- empresa en el momento de mirarla. Si ese ajuste cambia (o se marcó mal al
-- empezar), las facturas ya emitidas cambiaban de impuesto en pantalla, en
-- el PDF y en el registro que se manda a Veri*Factu. Una factura sellada no
-- puede cambiar de aspecto: el impuesto se fija al crearla.
--
-- · Columna nueva `impuesto` ('IVA' | 'IGIC').
-- · Se rellena sola al insertar (y en los borradores, al guardarlos o
--   emitirlos), con el régimen que tenga entonces la empresa: también las
--   que suben desde un equipo sin conexión o desde una versión vieja de la
--   app que no la manda.
-- · Las facturas que ya existen se quedan sin valor (NULL) a propósito: no
--   se reescriben facturas selladas en bloque. Con NULL la app hace lo de
--   siempre, mirar el ajuste de la empresa.
-- · Sellada la factura con su impuesto, no se puede cambiar (antifraude).
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS impuesto text
  CHECK (impuesto IN ('IVA', 'IGIC'));

COMMENT ON COLUMN public.invoices.impuesto IS
  'Impuesto indirecto con el que se emitió (IVA o IGIC). NULL en facturas anteriores a la migración 077: entonces manda el ajuste igic_enabled de la empresa.';

CREATE OR REPLACE FUNCTION public.fn_invoice_impuesto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- En las ya selladas no se toca nada: lo suyo es lo que tenían.
  IF NEW.impuesto IS NULL AND (TG_OP = 'INSERT' OR OLD.sealed_at IS NULL) THEN
    -- El ajuste más reciente de la empresa (puede haber filas duplicadas de
    -- guardados sin conexión antiguos). Sin ajustes, se deja sin valor y la
    -- app sigue mirando el de la empresa.
    SELECT CASE WHEN cs.igic_enabled THEN 'IGIC' ELSE 'IVA' END
      INTO NEW.impuesto
      FROM public.company_settings cs
     WHERE cs.user_id = NEW.user_id
     ORDER BY cs.updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_invoice_impuesto() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tr_invoice_impuesto
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_impuesto();

-- El antifraude: igual que estaba, más el impuesto. Sólo cuando ya tenía
-- uno: una factura antigua sin valor sigue pudiendo marcarse como cobrada
-- sin que nadie le invente el impuesto.
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
  IF OLD.impuesto IS NOT NULL AND NEW.impuesto IS DISTINCT FROM OLD.impuesto THEN v_changed := array_append(v_changed, 'impuesto');               END IF;

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
