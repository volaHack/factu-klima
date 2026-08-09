-- ============================================================
-- MIGRACIÓN 003: Verifactu Certificados Digitales FNMT
-- Almacenamiento y gestión de certificados para envío a AEAT
--
-- ADVERTENCIA IMPORTANTE — LEER ANTES DE CONFIAR EN ESTA TABLA
-- ------------------------------------------------------------
-- Esta migración soporta una integración de DEMOSTRACIÓN. El servidor
-- (src/app/api/verifactu/certificate/upload/route.ts) NO valida que lo
-- subido sea un certificado FNMT real: no descifra el PKCS#12, no
-- comprueba la cadena de confianza, no consulta la CRL. Cualquier
-- usuario autenticado puede "subir" un archivo cualquiera y el sistema
-- lo guardará como si fuera un certificado válido.
--
-- Lo que SÍ es real desde esta revisión de seguridad:
--   - certificate_data se cifra en reposo con AES-256-GCM en el servidor
--     (ver src/lib/verifactu/certificateEncryption.ts) usando la clave
--     de entorno CERTIFICATE_ENCRYPTION_KEY, que nunca sale del servidor.
--     Antes se guardaba con Buffer.from(...).toString(), es decir, en
--     texto plano (y además corrompiendo los bytes binarios no-UTF8).
--   - certificate_thumbprint es un SHA-256 real del archivo subido (no
--     un valor fijo inventado igual para todos los certificados).
--
-- La columna validation_status distingue explícitamente "hemos
-- comprobado que este certificado es auténtico" (nunca ocurre hoy) de
-- "está cifrado y guardado, pero sin verificar" (el único caso posible
-- hoy). No usar is_valid para inferir autenticidad: is_valid sólo
-- significa "no ha expirado ni se ha marcado revocado a mano".
-- ============================================================

-- Tabla: verifactu_certificates
-- Almacena certificados FNMT (PKCS#12 cifrados en reposo, ver advertencia
-- de arriba; el cifrado NO implica que el certificado se haya verificado)
-- RLS: Solo el propietario puede ver/modificar su certificado
CREATE TABLE IF NOT EXISTS public.verifactu_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,

  -- Datos del certificado, cifrados con AES-256-GCM por el servidor
  -- (ver src/lib/verifactu/certificateEncryption.ts)
  certificate_data BYTEA NOT NULL,  -- .p12 cifrado (IV || authTag || ciphertext)
  certificate_password_hash VARCHAR(255),  -- Hash de la contraseña para verificación
  certificate_thumbprint VARCHAR(64),  -- SHA-256 real del archivo subido (no es fingerprint X.509)

  -- Metadata del certificado — MOCK: hoy son valores fijos "sin
  -- verificar", NO datos extraídos del certificado real (no hay parser
  -- PKCS#12/X.509 instalado en el proyecto). Ver advertencia de arriba.
  subject_name VARCHAR(500),  -- "CN=...O=...C=ES"
  issuer_name VARCHAR(500),   -- "CN=AC FNMT..."
  serial_number VARCHAR(64),  -- Número de serie
  not_before TIMESTAMP NOT NULL,  -- Fecha de inicio de validez (hoy: inventada, no extraída del certificado)
  not_after TIMESTAMP NOT NULL,   -- Fecha de vencimiento (hoy: inventada, no extraída del certificado)

  -- Estado de validez
  is_valid BOOLEAN DEFAULT true,   -- "no expirado / no invalidado a mano", NO "verificado como auténtico"
  is_revoked BOOLEAN DEFAULT false,
  revocation_checked_at TIMESTAMP,
  last_validation_error TEXT,

  -- Nivel de confianza real de la validación. 'unverified' es el único
  -- valor que puede producir el flujo actual: no existe código que
  -- pueda marcar 'verified' todavía.
  validation_status TEXT NOT NULL DEFAULT 'unverified',

  -- Estado de conexión AEAT
  is_aeat_connected BOOLEAN DEFAULT false,
  last_connection_check TIMESTAMP,
  last_connection_error TEXT,
  aeat_status_code VARCHAR(10),  -- P.ej. "200" si OK, "401" si no autorizado, etc.

  -- Auditoría
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  uploaded_ip INET,

  CONSTRAINT valid_dates CHECK (not_before < not_after),
  CONSTRAINT valid_thumbprint CHECK (length(certificate_thumbprint) = 64 OR certificate_thumbprint IS NULL),
  CONSTRAINT valid_validation_status CHECK (validation_status IN ('unverified', 'verified', 'invalid'))
);

-- Idempotente: si la tabla ya existía de una ejecución anterior de esta
-- misma migración sin la columna/constraint (p.ej. porque se aplicó antes
-- de esta revisión de seguridad), se añaden aquí sin fallar.
ALTER TABLE public.verifactu_certificates
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'unverified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_validation_status'
  ) THEN
    ALTER TABLE public.verifactu_certificates
      ADD CONSTRAINT valid_validation_status CHECK (validation_status IN ('unverified', 'verified', 'invalid'));
  END IF;
END $$;

-- Índice para búsqueda rápida por usuario
CREATE INDEX IF NOT EXISTS idx_verifactu_certs_user_id ON public.verifactu_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_verifactu_certs_thumbprint ON public.verifactu_certificates(certificate_thumbprint);

-- Row-Level Security: Solo el propietario puede acceder a su certificado
ALTER TABLE public.verifactu_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo propietario puede ver su certificado" ON public.verifactu_certificates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Solo propietario puede insertar certificados" ON public.verifactu_certificates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Solo propietario puede actualizar su certificado" ON public.verifactu_certificates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Solo propietario puede borrar su certificado" ON public.verifactu_certificates
  FOR DELETE USING (auth.uid() = user_id);

-- Tabla: verifactu_submissions
-- Registro de cada envío de factura a AEAT
CREATE TABLE IF NOT EXISTS public.verifactu_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices ON DELETE CASCADE,
  certificate_id UUID NOT NULL REFERENCES public.verifactu_certificates ON DELETE CASCADE,

  -- Datos del envío
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  xml_payload TEXT,  -- La factura en formato XML de Verifactu (sin sensibles)

  -- Respuesta de AEAT
  aeat_ticket_id VARCHAR(64),  -- Ticket devuelto por AEAT
  aeat_status_code VARCHAR(10),  -- "200", "400", "401", etc.
  aeat_response_body TEXT,  -- Respuesta completa de AEAT
  submission_status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, rejected, error

  -- Metadata
  submission_error TEXT,  -- Si hubo error
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMP,

  CONSTRAINT valid_status CHECK (submission_status IN ('pending', 'accepted', 'rejected', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_invoice ON public.verifactu_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_status ON public.verifactu_submissions(submission_status);
CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_certificate ON public.verifactu_submissions(certificate_id);

-- RLS: Solo el propietario de la factura puede ver sus envíos
ALTER TABLE public.verifactu_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo propietario de factura ve sus envíos" ON public.verifactu_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = verifactu_submissions.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );

-- Función: check_certificate_validity()
-- Verifica que el certificado no esté expirado
CREATE OR REPLACE FUNCTION public.check_certificate_validity()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.verifactu_certificates
  SET is_valid = FALSE, last_validation_error = 'Certificado expirado'
  WHERE not_after < NOW() AND is_valid = true;
END;
$$;

-- Función: get_active_certificate()
-- Obtiene el certificado válido del usuario AUTENTICADO.
--
-- Antes aceptaba p_user_id como parámetro que mandaba el cliente, y
-- confiaba en que RLS filtrara filas ajenas aunque alguien pasara un
-- UUID que no fuera el suyo. Eso era correcto (la función es
-- SECURITY INVOKER, así que RLS se aplica igual), pero es una
-- invariante frágil: si en el futuro alguien le añadiera
-- SECURITY DEFINER "para arreglar un problema de permisos",
-- p_user_id pasaría a ser un parámetro de autorización real y
-- cualquier usuario autenticado podría leer el certificado de otro
-- pasando su UUID. Se elimina el parámetro: el usuario se obtiene
-- siempre de auth.uid(), nunca de lo que mande el cliente, así que
-- ese escenario deja de ser posible pase lo que pase con SECURITY
-- DEFINER en el futuro.
DROP FUNCTION IF EXISTS public.get_active_certificate(UUID);

CREATE OR REPLACE FUNCTION public.get_active_certificate()
RETURNS TABLE (
  id UUID,
  subject_name VARCHAR,
  is_aeat_connected BOOLEAN,
  last_connection_check TIMESTAMP,
  aeat_status_code VARCHAR,
  not_after TIMESTAMP
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.check_certificate_validity();

  RETURN QUERY
  SELECT
    vc.id,
    vc.subject_name,
    vc.is_aeat_connected,
    vc.last_connection_check,
    vc.aeat_status_code,
    vc.not_after
  FROM public.verifactu_certificates vc
  WHERE vc.user_id = (SELECT auth.uid())
  AND vc.is_valid = true
  AND vc.is_revoked = false
  AND vc.not_after > NOW()
  ORDER BY vc.uploaded_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_certificate() TO authenticated;

-- Comentarios
COMMENT ON TABLE public.verifactu_certificates IS
'Almacena certificados FNMT cifrados en reposo (AES-256-GCM, ver src/lib/verifactu/certificateEncryption.ts). ADVERTENCIA: cifrado en reposo no equivale a certificado verificado — ver columna validation_status y las advertencias al inicio de este fichero. No existe todavía validación real de autenticidad, cadena FNMT ni CRL.';

COMMENT ON COLUMN public.verifactu_certificates.certificate_data IS
'Archivo .p12 cifrado con AES-256-GCM usando la clave de entorno CERTIFICATE_ENCRYPTION_KEY (nunca se expone al navegador). Formato: IV(12) || authTag(16) || ciphertext, en hex con prefijo \x.';

COMMENT ON COLUMN public.verifactu_certificates.validation_status IS
'unverified = guardado y cifrado, pero NO se ha comprobado su autenticidad (único valor que produce el flujo actual). verified/invalid están reservados para cuando exista un validador PKCS#12/X.509 real.';

COMMENT ON COLUMN public.verifactu_certificates.is_aeat_connected IS
'true si la última comprobación de conexión fue exitosa. ADVERTENCIA: hoy esa comprobación no es una conexión TLS mutua real con AEAT (ver /api/verifactu/health) — no tratar este campo como prueba de que las facturas se están enviando a la AEAT.';

COMMENT ON TABLE public.verifactu_submissions IS
'Registro auditable de cada intento de envío a AEAT. Permite reintento y seguimiento de estado.';

-- Permisos por defecto
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verifactu_certificates TO authenticated;
GRANT SELECT ON public.verifactu_submissions TO authenticated;

-- NOTA: PRINT es sintaxis de T-SQL (SQL Server), no existe en PostgreSQL.
-- La versión anterior de este fichero usaba PRINT aquí, lo que provoca un
-- error de sintaxis y — al ejecutarse como una única transacción desde el
-- SQL Editor de Supabase — puede abortar TODA la migración, incluidas las
-- tablas y políticas RLS de arriba. Se sustituye por RAISE NOTICE, que sí
-- es válido en PL/pgSQL.
DO $$
BEGIN
  RAISE NOTICE '== VERIFACTU CERTIFICADOS INSTALADO ==';
  RAISE NOTICE 'Tablas creadas: verifactu_certificates, verifactu_submissions';
  RAISE NOTICE 'RLS habilitado en ambas tablas';
END $$;
