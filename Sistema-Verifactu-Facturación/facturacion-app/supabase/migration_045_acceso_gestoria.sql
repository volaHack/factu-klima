-- ============================================================
-- MIGRACIÓN 045: acceso de la gestoría a las cuentas que la invitan
--
-- EL MODELO
-- El cliente invita a su gestoría por email desde sus Ajustes. La
-- gestoría, con su propia cuenta, acepta la invitación y a partir de ahí
-- PUEDE LEER esa empresa. Nada más: ni emitir, ni editar, ni borrar.
--
-- POR QUÉ ASÍ Y NO «ENTRANDO COMO EL CLIENTE»
-- Compartir la contraseña es lo que se hace hoy en medio sector y es
-- justo lo que no se puede hacer en un sistema con registros sellados:
-- si la gestoría entra con la cuenta del cliente, nada distingue en el
-- registro quién emitió una factura. Aquí cada uno entra con lo suyo y
-- el acceso queda escrito, con su fecha de alta y su fecha de baja.
--
-- CÓMO SE IMPLEMENTA
-- Políticas ADICIONALES de SELECT sobre las tablas que hacen falta para
-- llevar la contabilidad. Las políticas existentes («sólo el dueño») no
-- se tocan: en RLS varias políticas se suman, así que el dueño sigue
-- viendo lo suyo y la gestoría ve, además, lo de quien la invitó.
--
-- NO SE COMPARTEN: los certificados digitales (verifactu_certificates),
-- las conexiones de Stripe, ni las suscripciones. Un gestor no necesita
-- el certificado de su cliente para llevarle los libros, y un
-- certificado es una firma.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.accesos_gestoria (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propietario_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Se invita por email porque la gestoría puede no tener cuenta todavía.
  gestoria_email       TEXT NOT NULL,
  -- Se rellena al aceptar: hasta entonces no hay acceso a nada.
  gestoria_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estado               TEXT NOT NULL DEFAULT 'invitado'
                         CHECK (estado IN ('invitado', 'activo', 'revocado')),
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceptado_en          TIMESTAMPTZ,
  revocado_en          TIMESTAMPTZ,
  UNIQUE (propietario_user_id, gestoria_email)
);

CREATE INDEX IF NOT EXISTS idx_accesos_gestoria_activa
  ON public.accesos_gestoria (gestoria_user_id, propietario_user_id)
  WHERE estado = 'activo';

ALTER TABLE public.accesos_gestoria ENABLE ROW LEVEL SECURITY;

-- El email de quien está entrando. En una función SECURITY DEFINER
-- porque `auth.users` no es legible desde la aplicación.
CREATE OR REPLACE FUNCTION public.mi_email()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.mi_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_email() TO authenticated;

-- ¿Soy la gestoría de esta empresa, ahora mismo?
CREATE OR REPLACE FUNCTION public.es_gestoria_de(p_propietario UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accesos_gestoria
    WHERE propietario_user_id = p_propietario
      AND gestoria_user_id = auth.uid()
      AND estado = 'activo'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.es_gestoria_de(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_gestoria_de(UUID) TO authenticated;

-- El dueño gestiona sus invitaciones; la gestoría ve las suyas.
DROP POLICY IF EXISTS accesos_gestoria_propietario ON public.accesos_gestoria;
CREATE POLICY accesos_gestoria_propietario ON public.accesos_gestoria
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = propietario_user_id)
  WITH CHECK ((SELECT auth.uid()) = propietario_user_id);

DROP POLICY IF EXISTS accesos_gestoria_invitada ON public.accesos_gestoria;
CREATE POLICY accesos_gestoria_invitada ON public.accesos_gestoria
  FOR SELECT TO authenticated
  USING (lower(gestoria_email) = public.mi_email() OR gestoria_user_id = (SELECT auth.uid()));

-- Aceptar es un acto de la gestoría, y sólo sobre una invitación a su
-- nombre: por eso va en una función y no en una política de UPDATE, que
-- habría que escribir con mucho cuidado para que no pudiera cambiar otra
-- cosa de la fila.
CREATE OR REPLACE FUNCTION public.aceptar_acceso_gestoria(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.accesos_gestoria
     SET gestoria_user_id = auth.uid(),
         estado = 'activo',
         aceptado_en = now()
   WHERE id = p_id
     AND lower(gestoria_email) = public.mi_email()
     AND estado = 'invitado';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESO: esa invitación no existe, no es para ti o ya estaba aceptada.';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.aceptar_acceso_gestoria(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_acceso_gestoria(UUID) TO authenticated;

-- ------------------------------------------------------------
-- LO QUE LA GESTORÍA PUEDE LEER. Sólo SELECT, y sólo esto.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS gestoria_lee_facturas ON public.invoices;
CREATE POLICY gestoria_lee_facturas ON public.invoices
  FOR SELECT TO authenticated USING (public.es_gestoria_de(user_id));

DROP POLICY IF EXISTS gestoria_lee_lineas ON public.invoice_line_items;
CREATE POLICY gestoria_lee_lineas ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE public.es_gestoria_de(i.user_id)));

DROP POLICY IF EXISTS gestoria_lee_desglose ON public.invoice_tax_breakdown;
CREATE POLICY gestoria_lee_desglose ON public.invoice_tax_breakdown
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE public.es_gestoria_de(i.user_id)));

DROP POLICY IF EXISTS gestoria_lee_clientes ON public.clients;
CREATE POLICY gestoria_lee_clientes ON public.clients
  FOR SELECT TO authenticated USING (public.es_gestoria_de(user_id));

DROP POLICY IF EXISTS gestoria_lee_gastos ON public.gastos;
CREATE POLICY gestoria_lee_gastos ON public.gastos
  FOR SELECT TO authenticated USING (public.es_gestoria_de(user_id));

DROP POLICY IF EXISTS gestoria_lee_ajustes ON public.company_settings;
CREATE POLICY gestoria_lee_ajustes ON public.company_settings
  FOR SELECT TO authenticated USING (public.es_gestoria_de(user_id));
