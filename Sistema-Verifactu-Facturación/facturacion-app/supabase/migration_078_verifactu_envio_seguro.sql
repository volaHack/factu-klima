-- ============================================================
-- 078 · ENVÍO A LA AEAT SEGURO
--
-- · Una sola remisión a la vez por cuenta: `envio_bloqueado_hasta`
--   (la reserva la coge enviarPendientes con un UPDATE atómico).
-- · Control de flujo de la AEAT: `siguiente_envio_en` guarda hasta cuándo
--   hay que esperar (TiempoEsperaEnvio de la última respuesta).
-- · Dos estados nuevos del registro:
--     · subsanar       — un alta rechazada, corregida, que sale como
--                        subsanación (Subsanacion=S) en el próximo envío;
--     · consta_en_aeat — la AEAT la rechazó por DUPLICADA (error 3000): ya
--                        la tenía. No se reenvía; no se da por «aceptada».
-- · El resultado del envío (estado) sólo lo anota el servidor. Una sesión
--   de usuario sólo puede pedir la subsanación de un alta rechazada: ya no
--   puede marcar nada como aceptado desde el navegador.
--
-- No borra ni reescribe nada de lo que hay. Se puede aplicar en caliente.
-- ============================================================

ALTER TABLE public.verifactu_config
  ADD COLUMN IF NOT EXISTS envio_bloqueado_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS siguiente_envio_en timestamptz;

COMMENT ON COLUMN public.verifactu_config.envio_bloqueado_hasta IS
  'Reserva del envío en curso a la AEAT (uno a la vez por cuenta). NULL = libre.';
COMMENT ON COLUMN public.verifactu_config.siguiente_envio_en IS
  'No enviar antes de esta hora: TiempoEsperaEnvio de la última respuesta de la AEAT.';

ALTER TABLE public.verifactu_registros DROP CONSTRAINT IF EXISTS verifactu_registros_estado_check;
ALTER TABLE public.verifactu_registros ADD CONSTRAINT verifactu_registros_estado_check
  CHECK (estado IN ('pendiente', 'enviando', 'aceptado', 'aceptado_con_errores', 'rechazado',
                    'error_envio', 'subsanar', 'consta_en_aeat'));

CREATE OR REPLACE FUNCTION public.fn_verifactu_registro_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rol text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'ANTIFRAUDE: un registro de facturación Veri*Factu no se borra. Si la factura no vale, anúlala: se generará un registro de anulación.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.huella           IS DISTINCT FROM OLD.huella
  OR NEW.huella_anterior  IS DISTINCT FROM OLD.huella_anterior
  OR NEW.indice           IS DISTINCT FROM OLD.indice
  OR NEW.primer_registro  IS DISTINCT FROM OLD.primer_registro
  OR NEW.user_id          IS DISTINCT FROM OLD.user_id
  OR NEW.invoice_id       IS DISTINCT FROM OLD.invoice_id
  OR NEW.tipo_registro    IS DISTINCT FROM OLD.tipo_registro
  OR NEW.id_emisor        IS DISTINCT FROM OLD.id_emisor
  OR NEW.num_serie        IS DISTINCT FROM OLD.num_serie
  OR NEW.fecha_expedicion IS DISTINCT FROM OLD.fecha_expedicion
  OR NEW.tipo_factura     IS DISTINCT FROM OLD.tipo_factura
  OR NEW.cuota_total      IS DISTINCT FROM OLD.cuota_total
  OR NEW.importe_total    IS DISTINCT FROM OLD.importe_total
  OR NEW.fecha_hora_huso  IS DISTINCT FROM OLD.fecha_hora_huso THEN
    RAISE EXCEPTION
      'ANTIFRAUDE: los datos firmados del registro % no se pueden modificar. Sólo se puede anotar el resultado del envío.', OLD.num_serie
      USING ERRCODE = 'check_violation';
  END IF;

  -- Desde el navegador (sesión de usuario o anónima) sólo se puede pedir la
  -- subsanación de un alta rechazada. Lo demás —sobre todo «aceptado»— lo
  -- anota el servidor con la respuesta real de la AEAT.
  IF v_rol IN ('authenticated', 'anon') THEN
    IF NOT (OLD.estado = 'rechazado' AND NEW.estado = 'subsanar' AND OLD.tipo_registro = 'alta')
       AND (NEW.estado         IS DISTINCT FROM OLD.estado
         OR NEW.csv_aeat       IS DISTINCT FROM OLD.csv_aeat
         OR NEW.respuesta_cruda IS DISTINCT FROM OLD.respuesta_cruda
         OR NEW.entorno        IS DISTINCT FROM OLD.entorno
         OR NEW.codigo_error   IS DISTINCT FROM OLD.codigo_error
         OR NEW.respondido_en  IS DISTINCT FROM OLD.respondido_en) THEN
      RAISE EXCEPTION
        'ANTIFRAUDE: el resultado del envío a la AEAT del registro % sólo lo anota el servidor.', OLD.num_serie
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
