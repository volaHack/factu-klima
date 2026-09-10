-- ============================================================
-- MIGRACIÓN 038 — EL ENVÍO A LA AGENCIA TRIBUTARIA, DE VERDAD
-- ============================================================
--
-- Hasta aquí el sistema sellaba las facturas con una huella propia
-- (compute_invoice_hash: NIF|número|fecha|total|anterior|sellado) que
-- servía para detectar manipulaciones internas y no servía para nada
-- ante la AEAT. El generador de XML que había inventaba el espacio de
-- nombres y la mitad de los nombres de campo. Nada de eso se podía
-- enviar.
--
-- Esta migración instala lo que sí se puede enviar:
--
--   1. La huella OFICIAL, calculada según «Detalle de las
--      especificaciones técnicas para generación de la huella o hash de
--      los registros de facturación», AEAT, v0.1.2 del 27/08/2024. Los
--      tres ejemplos resueltos de su apartado 6 se comprueban al final
--      de este fichero: si la instalación no los reproduce, la migración
--      falla y no deja el sistema a medias.
--
--   2. La tabla verifactu_registros: la cadena de registros de
--      facturación. Ojo con esto, que es el detalle que más se malentiende
--      de Veri*Factu: la cadena NO es una cadena de facturas, es una
--      cadena de REGISTROS. Una factura emitida aporta un registro de
--      alta; anularla aporta otro de anulación, que va detrás del último
--      registro que hubiera —sea de quien sea— y se encadena con él.
--
--   3. La cola de envío con su estado real: pendiente, enviando,
--      aceptado, aceptado con errores, rechazado o error de envío. Sin
--      inventarse un «enviado correctamente» que no ha ocurrido.
--
-- QUÉ NO CAMBIA
-- record_hash y prev_hash se quedan como estaban. Son la cadena interna
-- y sellan cosas que la huella oficial no sella (los importes y el
-- instante exacto), así que siguen valiendo para detectar manipulación
-- de la base de datos. Lo que cambia es verifactu_hash, que pasa a ser
-- la huella oficial: es la que tiene sentido enseñar y exportar, porque
-- es la única que la AEAT puede recalcular.
--
-- NOTA SOBRE LA MIGRACIÓN 003
-- El fichero migration_003_verifactu_certs.sql existe en el repositorio
-- desde hace tiempo pero nunca llegó a aplicarse a la base de datos: la
-- tabla verifactu_certificates no existía, así que la pantalla de subida
-- de certificado fallaba contra una tabla ausente. Esta migración crea
-- lo que hacía falta de aquélla, con IF NOT EXISTS para que aplicar las
-- dos en cualquier orden sea inofensivo.

-- ============================================================
-- 1. FORMATO DE LOS VALORES
--    Tres reglas pequeñas que, mal puestas, cambian la huella entera.
-- ============================================================

-- Importes: dos decimales y punto. El documento admite también una sola
-- posición decimal, pero admitir no es elegir: emitir siempre igual evita
-- que dos ejecuciones den huellas distintas para el mismo importe.
CREATE OR REPLACE FUNCTION public.verifactu_importe(p_valor NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(ROUND(COALESCE(p_valor, 0), 2), 'FM9999999999990.00');
$$;

-- Fechas: dd-mm-aaaa, al revés que el ISO que usa la aplicación por
-- dentro. Lo fija el XSD (simpleType «fecha», longitud 10, patrón
-- \d{2}-\d{2}-\d{4}) y es el error más fácil de cometer aquí, porque
-- «01-01-2024» y «2024-01-01» tienen las dos pinta de fecha correcta.
CREATE OR REPLACE FUNCTION public.verifactu_fecha(p_fecha DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(p_fecha, 'DD-MM-YYYY');
$$;

-- Marca de tiempo con huso horario explícito, no en UTC con «Z». Las dos
-- son dateTime válidos, pero el registro documenta el huso del sistema
-- que lo generó, y en España eso cambia dos veces al año. El
-- desplazamiento se MIDE (hora local menos hora UTC del mismo instante)
-- en vez de suponerse, así el horario de verano sale solo.
CREATE OR REPLACE FUNCTION public.verifactu_marca_tiempo(
  p_momento TIMESTAMPTZ,
  p_zona    TEXT DEFAULT 'Europe/Madrid'
)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_local   TIMESTAMP;
  v_minutos INT;
BEGIN
  v_local   := p_momento AT TIME ZONE p_zona;
  v_minutos := ROUND(EXTRACT(EPOCH FROM (v_local - (p_momento AT TIME ZONE 'UTC'))) / 60);

  RETURN to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS')
      || CASE WHEN v_minutos < 0 THEN '-' ELSE '+' END
      || lpad((abs(v_minutos) / 60)::TEXT, 2, '0') || ':'
      || lpad((abs(v_minutos) % 60)::TEXT, 2, '0');
END;
$$;

-- ============================================================
-- 2. LA HUELLA OFICIAL
-- ============================================================

-- SHA-256 de la cadena en UTF-8, en hexadecimal y MAYÚSCULAS.
CREATE OR REPLACE FUNCTION public.verifactu_huella(p_cadena TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT upper(encode(sha256(convert_to(p_cadena, 'UTF8')), 'hex'));
$$;

-- La cadena de un registro de ALTA (apartado 3.a del documento).
--
-- Los valores se recortan por los extremos y NO se codifican. La
-- tentación de meter aquí un url_encode es fuerte porque esto tiene
-- pinta de query string, pero no lo es: el ejemplo oficial lleva un
-- número de factura «12345678/G33» con la barra tal cual, y escribirla
-- como %2F daría una huella distinta de la que calcula la AEAT.
--
-- Un campo sin valor se escribe igual, con su «=» y nada detrás. El
-- primer registro de la cadena es exactamente ese caso: «…&Huella=&…».
CREATE OR REPLACE FUNCTION public.verifactu_cadena_alta(
  p_id_emisor       TEXT,
  p_num_serie       TEXT,
  p_fecha           DATE,
  p_tipo_factura    TEXT,
  p_cuota_total     NUMERIC,
  p_importe_total   NUMERIC,
  p_huella_anterior TEXT,
  p_marca_tiempo    TEXT
)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'IDEmisorFactura='          || btrim(COALESCE(p_id_emisor, ''))
      || '&NumSerieFactura='         || btrim(COALESCE(p_num_serie, ''))
      || '&FechaExpedicionFactura='  || public.verifactu_fecha(p_fecha)
      || '&TipoFactura='             || btrim(COALESCE(p_tipo_factura, ''))
      || '&CuotaTotal='              || public.verifactu_importe(p_cuota_total)
      || '&ImporteTotal='            || public.verifactu_importe(p_importe_total)
      || '&Huella='                  || btrim(COALESCE(p_huella_anterior, ''))
      || '&FechaHoraHusoGenRegistro='|| btrim(COALESCE(p_marca_tiempo, ''));
$$;

-- La cadena de un registro de ANULACIÓN (apartado 3.b). Lleva otros
-- campos y otros nombres: no es el alta con menos cosas.
CREATE OR REPLACE FUNCTION public.verifactu_cadena_anulacion(
  p_id_emisor       TEXT,
  p_num_serie       TEXT,
  p_fecha           DATE,
  p_huella_anterior TEXT,
  p_marca_tiempo    TEXT
)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'IDEmisorFacturaAnulada='          || btrim(COALESCE(p_id_emisor, ''))
      || '&NumSerieFacturaAnulada='         || btrim(COALESCE(p_num_serie, ''))
      || '&FechaExpedicionFacturaAnulada='  || public.verifactu_fecha(p_fecha)
      || '&Huella='                         || btrim(COALESCE(p_huella_anterior, ''))
      || '&FechaHoraHusoGenRegistro='       || btrim(COALESCE(p_marca_tiempo, ''));
$$;

-- ============================================================
-- 3. EL TIPO DE FACTURA
--    Mismo criterio que resolverTipoFacturaFiscal en el cliente. Va en
--    la huella, así que no puede decidirlo el navegador: si el cliente
--    mandara un F1 donde el servidor calcula F2, la huella enviada no
--    coincidiría con la que la AEAT recalcula sobre el XML.
-- ============================================================
CREATE OR REPLACE FUNCTION public.verifactu_tipo_factura(
  p_tipo             TEXT,
  p_tipo_fiscal      TEXT,
  p_pos_session_id   UUID
)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_tipo_fiscal IS NOT NULL AND p_tipo_fiscal <> '' THEN p_tipo_fiscal
    -- Rectificativa de un ticket de TPV: R5 (rectificativa de
    -- simplificada). Rectificativa de una factura completa: R1.
    WHEN p_tipo = 'rectificativa' AND p_pos_session_id IS NOT NULL THEN 'R5'
    WHEN p_tipo = 'rectificativa' THEN 'R1'
    -- Ticket de TPV: factura simplificada.
    WHEN p_pos_session_id IS NOT NULL THEN 'F2'
    ELSE 'F1'
  END;
$$;

-- ============================================================
-- 4. LA CADENA DE REGISTROS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.verifactu_registros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,

  -- Sin clave ajena a propósito. El registro se crea desde un trigger
  -- BEFORE INSERT sobre invoices, cuando la fila de la factura todavía
  -- no existe y una clave ajena fallaría. No queda colgando: las
  -- facturas no se pueden borrar (fn_invoice_no_delete).
  invoice_id    UUID NOT NULL,
  tipo_registro TEXT NOT NULL CHECK (tipo_registro IN ('alta', 'anulacion')),

  -- Posición en la cadena de ESTE obligado tributario, empezando en 1.
  indice          BIGINT  NOT NULL,
  primer_registro BOOLEAN NOT NULL,
  huella          TEXT    NOT NULL CHECK (huella ~ '^[0-9A-F]{64}$'),
  huella_anterior TEXT,

  -- Los datos que viajan en el XML, congelados en el momento del
  -- sellado. Se guardan en vez de recalcularse al enviar porque la
  -- huella se calculó sobre ESTOS valores: si mañana cambiara la función
  -- que deduce el tipo de factura, el XML tiene que seguir diciendo lo
  -- que se firmó, no lo que diría hoy.
  id_emisor        TEXT NOT NULL,
  num_serie        TEXT NOT NULL,
  fecha_expedicion DATE NOT NULL,
  tipo_factura     TEXT,
  cuota_total      NUMERIC(12,2),
  importe_total    NUMERIC(12,2),
  fecha_hora_huso  TEXT NOT NULL,

  -- Estado del envío. «aceptado_con_errores» no es un fallo nuestro que
  -- se pueda reintentar: la AEAT lo ha registrado y avisa de algo. Se
  -- distingue de «rechazado», que sí hay que corregir y volver a mandar.
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviando', 'aceptado',
                      'aceptado_con_errores', 'rechazado', 'error_envio')),
  intentos          INT NOT NULL DEFAULT 0,
  enviado_en        TIMESTAMPTZ,
  respondido_en     TIMESTAMPTZ,
  entorno           TEXT CHECK (entorno IN ('pruebas', 'produccion')),
  csv_aeat          TEXT,
  codigo_error      TEXT,
  descripcion_error TEXT,
  respuesta_cruda   TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Dos veces el mismo registro para la misma factura sería un duplicado
  -- ante la AEAT. Esto lo hace imposible y, de paso, hace idempotente al
  -- trigger que los crea.
  CONSTRAINT verifactu_registros_unico_por_factura UNIQUE (invoice_id, tipo_registro),
  CONSTRAINT verifactu_registros_indice_unico      UNIQUE (user_id, indice)
);

CREATE INDEX IF NOT EXISTS idx_verifactu_registros_pendientes
  ON public.verifactu_registros (user_id, indice)
  WHERE estado IN ('pendiente', 'error_envio', 'rechazado');

CREATE INDEX IF NOT EXISTS idx_verifactu_registros_factura
  ON public.verifactu_registros (invoice_id);

ALTER TABLE public.verifactu_registros ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'verifactu_registros'
                   AND policyname = 'Cada uno ve sus registros') THEN
    CREATE POLICY "Cada uno ve sus registros" ON public.verifactu_registros
      FOR SELECT USING ((SELECT auth.uid()) = user_id);
  END IF;

  -- Actualizar sí (el resultado del envío), insertar no: los registros
  -- los crea el trigger, no el cliente.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'verifactu_registros'
                   AND policyname = 'Cada uno anota el resultado de sus envios') THEN
    CREATE POLICY "Cada uno anota el resultado de sus envios" ON public.verifactu_registros
      FOR UPDATE USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.verifactu_registros TO authenticated;

-- ------------------------------------------------------------
-- Un registro de facturación no se corrige ni se borra
-- ------------------------------------------------------------
-- La cola de envío necesita escribir el resultado, así que la fila no
-- puede ser de sólo lectura entera. Lo que se protege es lo que se
-- firmó: la huella, la posición en la cadena y los datos que se
-- hashearon. Sin esto, cualquiera podría reescribir su cadena entera
-- desde el navegador con la política de UPDATE de arriba.
CREATE OR REPLACE FUNCTION public.fn_verifactu_registro_inmutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'ANTIFRAUDE: un registro de facturación Veri*Factu no se borra. Si la factura no vale, anúlala: se generará un registro de anulación.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.huella          IS DISTINCT FROM OLD.huella
  OR NEW.huella_anterior IS DISTINCT FROM OLD.huella_anterior
  OR NEW.indice          IS DISTINCT FROM OLD.indice
  OR NEW.primer_registro IS DISTINCT FROM OLD.primer_registro
  OR NEW.user_id         IS DISTINCT FROM OLD.user_id
  OR NEW.invoice_id      IS DISTINCT FROM OLD.invoice_id
  OR NEW.tipo_registro   IS DISTINCT FROM OLD.tipo_registro
  OR NEW.id_emisor       IS DISTINCT FROM OLD.id_emisor
  OR NEW.num_serie       IS DISTINCT FROM OLD.num_serie
  OR NEW.fecha_expedicion IS DISTINCT FROM OLD.fecha_expedicion
  OR NEW.tipo_factura    IS DISTINCT FROM OLD.tipo_factura
  OR NEW.cuota_total     IS DISTINCT FROM OLD.cuota_total
  OR NEW.importe_total   IS DISTINCT FROM OLD.importe_total
  OR NEW.fecha_hora_huso IS DISTINCT FROM OLD.fecha_hora_huso THEN
    RAISE EXCEPTION
      'ANTIFRAUDE: los datos firmados del registro % no se pueden modificar. Sólo se puede anotar el resultado del envío.', OLD.num_serie
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_verifactu_registro_inmutable ON public.verifactu_registros;
CREATE TRIGGER tr_verifactu_registro_inmutable
  BEFORE UPDATE OR DELETE ON public.verifactu_registros
  FOR EACH ROW EXECUTE FUNCTION public.fn_verifactu_registro_inmutable();

-- ============================================================
-- 5. QUIÉN ENCADENA
-- ============================================================
--
-- Un solo sitio genera registros, y es el servidor. El trigger corre
-- DESPUÉS de fn_invoice_seal (orden alfabético de nombres de trigger:
-- tr_invoice_seal < tr_invoices_updated < tr_verifactu_registro), así
-- que ve la factura ya sellada, con sus importes recalculados desde las
-- líneas y su fecha de sellado puesta.
--
-- Es un trigger BEFORE, no AFTER, por una razón concreta: necesita
-- escribir la huella oficial en NEW.verifactu_hash. Desde un AFTER
-- habría que hacer un UPDATE sobre la propia factura, que volvería a
-- disparar toda la cadena de triggers antifraude.
CREATE OR REPLACE FUNCTION public.fn_verifactu_registro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_huella_anterior TEXT;
  v_indice          BIGINT;
  v_marca           TEXT;
  v_tipo_factura    TEXT;
  v_huella          TEXT;
  v_existente       TEXT;
  v_alta            RECORD;
BEGIN
  -- ¿Ya tiene registro de alta? Entonces la huella oficial es ésa y no
  -- se recalcula nunca más: cualquier UPDATE posterior sobre la factura
  -- (marcarla como cobrada, por ejemplo) pasa por aquí, y fn_invoice_seal
  -- acaba de dejar verifactu_hash apuntando a la cadena interna.
  SELECT huella INTO v_existente
  FROM public.verifactu_registros
  WHERE invoice_id = NEW.id AND tipo_registro = 'alta';

  IF v_existente IS NOT NULL THEN
    NEW.verifactu_hash := v_existente;
  END IF;

  -- ---------- Registro de ALTA ----------
  IF NEW.sealed_at IS NOT NULL AND v_existente IS NULL THEN
    -- Mismo cerrojo que usa fn_invoice_seal. Los bloqueos consultivos de
    -- transacción son reentrantes, así que volver a pedirlo en la misma
    -- transacción no cuesta nada y garantiza que dos sellados a la vez
    -- no se lleven el mismo hueco de la cadena.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

    SELECT r.huella, r.indice INTO v_huella_anterior, v_indice
    FROM public.verifactu_registros r
    WHERE r.user_id = NEW.user_id
    ORDER BY r.indice DESC
    LIMIT 1;

    v_marca        := public.verifactu_marca_tiempo(NEW.sealed_at);
    v_tipo_factura := public.verifactu_tipo_factura(NEW.tipo, NEW.tipo_factura_fiscal, NEW.pos_session_id);
    v_huella       := public.verifactu_huella(
      public.verifactu_cadena_alta(
        NEW.issuer_nif, NEW.number, NEW.issue_date, v_tipo_factura,
        NEW.total_tax, NEW.total, v_huella_anterior, v_marca
      )
    );

    INSERT INTO public.verifactu_registros (
      user_id, invoice_id, tipo_registro, indice, primer_registro,
      huella, huella_anterior, id_emisor, num_serie, fecha_expedicion,
      tipo_factura, cuota_total, importe_total, fecha_hora_huso
    ) VALUES (
      NEW.user_id, NEW.id, 'alta', COALESCE(v_indice, 0) + 1, v_huella_anterior IS NULL,
      v_huella, v_huella_anterior, NEW.issuer_nif, NEW.number, NEW.issue_date,
      v_tipo_factura, NEW.total_tax, NEW.total, v_marca
    );

    NEW.verifactu_hash := v_huella;
  END IF;

  -- ---------- Registro de ANULACIÓN ----------
  -- Anular una factura ya enviada no la borra de la AEAT: exige mandar
  -- otro registro que dice que aquélla queda sin efecto. Y ese registro
  -- también se encadena, detrás de lo último que hubiera.
  IF NEW.cancelled_at IS NOT NULL AND NEW.status = 'anulada' THEN
    SELECT * INTO v_alta
    FROM public.verifactu_registros
    WHERE invoice_id = NEW.id AND tipo_registro = 'alta';

    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.verifactu_registros
      WHERE invoice_id = NEW.id AND tipo_registro = 'anulacion'
    ) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

      SELECT r.huella, r.indice INTO v_huella_anterior, v_indice
      FROM public.verifactu_registros r
      WHERE r.user_id = NEW.user_id
      ORDER BY r.indice DESC
      LIMIT 1;

      v_marca  := public.verifactu_marca_tiempo(NEW.cancelled_at);
      v_huella := public.verifactu_huella(
        public.verifactu_cadena_anulacion(
          v_alta.id_emisor, v_alta.num_serie, v_alta.fecha_expedicion,
          v_huella_anterior, v_marca
        )
      );

      INSERT INTO public.verifactu_registros (
        user_id, invoice_id, tipo_registro, indice, primer_registro,
        huella, huella_anterior, id_emisor, num_serie, fecha_expedicion,
        fecha_hora_huso
      ) VALUES (
        NEW.user_id, NEW.id, 'anulacion', COALESCE(v_indice, 0) + 1, v_huella_anterior IS NULL,
        v_huella, v_huella_anterior, v_alta.id_emisor, v_alta.num_serie,
        v_alta.fecha_expedicion, v_marca
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_verifactu_registro ON public.invoices;
CREATE TRIGGER tr_verifactu_registro
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_verifactu_registro();

-- ============================================================
-- 6. CONFIGURACIÓN DEL ENVÍO
-- ============================================================
--
-- El bloque SistemaInformatico del XML identifica a QUIEN PRODUCE EL
-- SOFTWARE, no a quien lo usa. Son datos que no se pueden deducir de la
-- base de datos ni inventar: hay que preguntárselos a la persona que
-- explota el programa. Por eso productor_nif y productor_nombre nacen
-- vacíos y el envío se niega a salir mientras lo estén, en vez de
-- rellenarlos con cualquier cosa y que la AEAT rechace el lote entero.
CREATE TABLE IF NOT EXISTS public.verifactu_config (
  user_id          UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  activo           BOOLEAN NOT NULL DEFAULT false,
  entorno          TEXT NOT NULL DEFAULT 'pruebas' CHECK (entorno IN ('pruebas', 'produccion')),
  envio_automatico BOOLEAN NOT NULL DEFAULT true,

  productor_nombre   TEXT,
  productor_nif      TEXT,
  nombre_sistema     TEXT NOT NULL DEFAULT 'Klima',
  id_sistema         TEXT NOT NULL DEFAULT '01',
  version_sistema    TEXT NOT NULL DEFAULT '1.0',
  numero_instalacion TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.verifactu_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'verifactu_config'
                   AND policyname = 'Cada uno gestiona su configuracion Verifactu') THEN
    CREATE POLICY "Cada uno gestiona su configuracion Verifactu" ON public.verifactu_config
      FOR ALL USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.verifactu_config TO authenticated;

-- ============================================================
-- 7. CERTIFICADOS (lo que faltaba de la migración 003)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.verifactu_certificates (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,

  certificate_data          BYTEA NOT NULL,
  certificate_password_hash VARCHAR(255),
  certificate_thumbprint    VARCHAR(64),

  subject_name  VARCHAR(500),
  issuer_name   VARCHAR(500),
  serial_number VARCHAR(64),
  not_before    TIMESTAMP NOT NULL,
  not_after     TIMESTAMP NOT NULL,

  is_valid              BOOLEAN DEFAULT true,
  is_revoked            BOOLEAN DEFAULT false,
  revocation_checked_at TIMESTAMP,
  last_validation_error TEXT,
  validation_status     TEXT NOT NULL DEFAULT 'unverified'
    CHECK (validation_status IN ('unverified', 'verified', 'invalid')),

  is_aeat_connected     BOOLEAN DEFAULT false,
  last_connection_check TIMESTAMP,
  last_connection_error TEXT,
  aeat_status_code      VARCHAR(10),

  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  uploaded_ip INET,

  CONSTRAINT valid_dates CHECK (not_before < not_after),
  CONSTRAINT valid_thumbprint CHECK (length(certificate_thumbprint) = 64 OR certificate_thumbprint IS NULL)
);

-- La contraseña del .p12, cifrada igual que el propio certificado
-- (AES-256-GCM con la clave del servidor).
--
-- Por qué cifrada y no en hash: un hash sirve para comprobar que alguien
-- la sabe, y aquí no hay que comprobar nada — hay que ABRIR el
-- certificado para levantar el TLS mutuo contra la AEAT. Un hash no abre
-- nada. La alternativa sería pedírsela al usuario en cada envío, lo que
-- convierte «facturar» en «facturar y quedarse a mirar». La clave de
-- cifrado vive sólo en el servidor (CERTIFICATE_ENCRYPTION_KEY) y nunca
-- baja al navegador.
ALTER TABLE public.verifactu_certificates
  ADD COLUMN IF NOT EXISTS certificate_password_encrypted BYTEA;

CREATE INDEX IF NOT EXISTS idx_verifactu_certs_user_id ON public.verifactu_certificates(user_id);

ALTER TABLE public.verifactu_certificates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'verifactu_certificates'
                   AND policyname = 'Solo propietario puede ver su certificado') THEN
    CREATE POLICY "Solo propietario puede ver su certificado" ON public.verifactu_certificates
      FOR SELECT USING ((SELECT auth.uid()) = user_id);
    CREATE POLICY "Solo propietario puede insertar certificados" ON public.verifactu_certificates
      FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
    CREATE POLICY "Solo propietario puede actualizar su certificado" ON public.verifactu_certificates
      FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
    CREATE POLICY "Solo propietario puede borrar su certificado" ON public.verifactu_certificates
      FOR DELETE USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verifactu_certificates TO authenticated;

CREATE OR REPLACE FUNCTION public.check_certificate_validity()
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.verifactu_certificates
  SET is_valid = FALSE, last_validation_error = 'Certificado expirado'
  WHERE not_after < NOW() AND is_valid = true;
END;
$$;

DROP FUNCTION IF EXISTS public.get_active_certificate(UUID);
DROP FUNCTION IF EXISTS public.get_active_certificate();

CREATE OR REPLACE FUNCTION public.get_active_certificate()
RETURNS TABLE (
  id UUID, subject_name VARCHAR, is_aeat_connected BOOLEAN,
  last_connection_check TIMESTAMP, aeat_status_code VARCHAR, not_after TIMESTAMP
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM public.check_certificate_validity();

  RETURN QUERY
  SELECT vc.id, vc.subject_name, vc.is_aeat_connected,
         vc.last_connection_check, vc.aeat_status_code, vc.not_after
  FROM public.verifactu_certificates vc
  WHERE vc.user_id = (SELECT auth.uid())
    AND vc.is_valid = true AND vc.is_revoked = false AND vc.not_after > NOW()
  ORDER BY vc.uploaded_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_certificate() TO authenticated;

-- ============================================================
-- 8. LAS FACTURAS QUE YA ESTABAN SELLADAS
-- ============================================================
--
-- Se les calcula su registro de alta en orden de cadena. No se les
-- cambia nada de lo sellado: la huella oficial se deduce de datos que ya
-- eran inmutables (emisor, número, fecha, cuota, total y el instante del
-- sellado), así que es determinista y honesta. La alternativa era
-- dejarlas fuera para siempre, sin poder enviarlas nunca.
--
-- Los triggers de la factura se apagan durante el relleno: el objetivo
-- es sincronizar verifactu_hash con el registro recién creado, y
-- fn_invoice_seal lo devolvería a la cadena interna en cuanto se tocara
-- la fila.
DO $$
DECLARE
  f                 RECORD;
  v_huella_anterior TEXT;
  v_indice          BIGINT;
  v_marca           TEXT;
  v_tipo            TEXT;
  v_huella          TEXT;
  v_creados         INT := 0;
BEGIN
  ALTER TABLE public.invoices DISABLE TRIGGER USER;

  FOR f IN
    SELECT i.* FROM public.invoices i
    WHERE i.sealed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.verifactu_registros r
                      WHERE r.invoice_id = i.id AND r.tipo_registro = 'alta')
    ORDER BY i.user_id, i.chain_index
  LOOP
    SELECT r.huella, r.indice INTO v_huella_anterior, v_indice
    FROM public.verifactu_registros r
    WHERE r.user_id = f.user_id
    ORDER BY r.indice DESC
    LIMIT 1;

    v_marca  := public.verifactu_marca_tiempo(f.sealed_at);
    v_tipo   := public.verifactu_tipo_factura(f.tipo, f.tipo_factura_fiscal, f.pos_session_id);
    v_huella := public.verifactu_huella(
      public.verifactu_cadena_alta(
        f.issuer_nif, f.number, f.issue_date, v_tipo,
        f.total_tax, f.total, v_huella_anterior, v_marca
      )
    );

    INSERT INTO public.verifactu_registros (
      user_id, invoice_id, tipo_registro, indice, primer_registro,
      huella, huella_anterior, id_emisor, num_serie, fecha_expedicion,
      tipo_factura, cuota_total, importe_total, fecha_hora_huso
    ) VALUES (
      f.user_id, f.id, 'alta', COALESCE(v_indice, 0) + 1, v_huella_anterior IS NULL,
      v_huella, v_huella_anterior, f.issuer_nif, f.number, f.issue_date,
      v_tipo, f.total_tax, f.total, v_marca
    );

    UPDATE public.invoices SET verifactu_hash = v_huella WHERE id = f.id;
    v_creados := v_creados + 1;
  END LOOP;

  ALTER TABLE public.invoices ENABLE TRIGGER USER;
  RAISE NOTICE 'Registros de alta creados para facturas ya selladas: %', v_creados;
END $$;

-- ============================================================
-- 9. LA MIGRACIÓN SE COMPRUEBA A SÍ MISMA
-- ============================================================
--
-- Los tres ejemplos resueltos del apartado 6 del documento oficial. Si
-- esta instalación no los reproduce, algo falla en el formato de fechas,
-- de importes o en la codificación, y es infinitamente mejor enterarse
-- aquí que después de mandar mil facturas que la AEAT marca como
-- «aceptadas con errores».
DO $$
DECLARE
  v_h1 TEXT; v_h2 TEXT; v_h3 TEXT;
BEGIN
  v_h1 := public.verifactu_huella(public.verifactu_cadena_alta(
    '89890001K', '12345678/G33', DATE '2024-01-01', 'F1', 12.35, 123.45,
    NULL, '2024-01-01T19:20:30+01:00'));

  v_h2 := public.verifactu_huella(public.verifactu_cadena_alta(
    '89890001K', '12345679/G34', DATE '2024-01-01', 'F1', 12.35, 123.45,
    v_h1, '2024-01-01T19:20:35+01:00'));

  v_h3 := public.verifactu_huella(public.verifactu_cadena_anulacion(
    '89890001K', '12345679/G34', DATE '2024-01-01',
    v_h2, '2024-01-01T19:20:40+01:00'));

  IF v_h1 <> '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60' THEN
    RAISE EXCEPTION 'La huella del ejemplo 6.1 de la AEAT no coincide: %', v_h1;
  END IF;
  IF v_h2 <> 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97' THEN
    RAISE EXCEPTION 'La huella del ejemplo 6.2 de la AEAT no coincide: %', v_h2;
  END IF;
  IF v_h3 <> '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68' THEN
    RAISE EXCEPTION 'La huella del ejemplo 6.3 de la AEAT no coincide: %', v_h3;
  END IF;

  -- Y la marca de tiempo, que es el otro sitio donde se tuerce todo sin
  -- avisar: en enero España va a +01:00 y en julio a +02:00.
  IF public.verifactu_marca_tiempo(TIMESTAMPTZ '2024-01-01T18:20:30Z') <> '2024-01-01T19:20:30+01:00' THEN
    RAISE EXCEPTION 'La marca de tiempo de invierno sale mal: %',
      public.verifactu_marca_tiempo(TIMESTAMPTZ '2024-01-01T18:20:30Z');
  END IF;
  IF public.verifactu_marca_tiempo(TIMESTAMPTZ '2024-07-15T10:00:00Z') <> '2024-07-15T12:00:00+02:00' THEN
    RAISE EXCEPTION 'La marca de tiempo de verano sale mal: %',
      public.verifactu_marca_tiempo(TIMESTAMPTZ '2024-07-15T10:00:00Z');
  END IF;

  RAISE NOTICE 'Los tres ejemplos oficiales de la AEAT se reproducen correctamente.';
END $$;
