-- ============================================================
-- 079 · INVITAR A ALGUIEN CON UN ENLACE
--
-- La titular crea desde Equipo un enlace para que otra persona (su
-- socio, su jefe) entre en la cuenta desde su propio dispositivo sin
-- contraseña. Al pulsar «Entrar» el servidor abre la sesión de la cuenta
-- en ese dispositivo.
--
-- · Aquí sólo se guarda la HUELLA (SHA-256) del enlace, nunca el enlace:
--   quien lea la tabla no puede usarlo.
-- · Sirve una vez, caduca (7 días) y se puede anular antes.
-- · La titular ve, crea y anula los suyos; nadie más los ve. Gastarlo
--   (`usado_en`) sólo lo hace el servidor, con la clave de servicio.
--
-- Tabla nueva: no toca nada de lo que hay. Se puede aplicar en caliente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invitaciones_acceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propietario_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  para text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  caduca_en timestamptz NOT NULL,
  usado_en timestamptz,
  revocado_en timestamptz
);

CREATE INDEX IF NOT EXISTS invitaciones_acceso_propietario_idx
  ON public.invitaciones_acceso (propietario_user_id, creado_en DESC);

ALTER TABLE public.invitaciones_acceso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitaciones_acceso_ver ON public.invitaciones_acceso;
CREATE POLICY invitaciones_acceso_ver ON public.invitaciones_acceso
  FOR SELECT TO authenticated
  USING (propietario_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS invitaciones_acceso_crear ON public.invitaciones_acceso;
CREATE POLICY invitaciones_acceso_crear ON public.invitaciones_acceso
  FOR INSERT TO authenticated
  WITH CHECK (
    propietario_user_id = (SELECT auth.uid())
    AND usado_en IS NULL AND revocado_en IS NULL
    AND caduca_en <= now() + interval '7 days 1 minute'
  );

-- Anular: la titular sólo puede poner `revocado_en` (el resto de columnas
-- no se tocan desde el navegador; lo garantiza el disparador de abajo).
DROP POLICY IF EXISTS invitaciones_acceso_anular ON public.invitaciones_acceso;
CREATE POLICY invitaciones_acceso_anular ON public.invitaciones_acceso
  FOR UPDATE TO authenticated
  USING (propietario_user_id = (SELECT auth.uid()))
  WITH CHECK (propietario_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_invitacion_solo_anular()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- La clave de servicio (el servidor) puede gastar la invitación.
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.propietario_user_id IS DISTINCT FROM OLD.propietario_user_id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR NEW.caduca_en IS DISTINCT FROM OLD.caduca_en
     OR NEW.usado_en IS DISTINCT FROM OLD.usado_en
     OR NEW.para IS DISTINCT FROM OLD.para THEN
    RAISE EXCEPTION 'Una invitación sólo se puede anular.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitacion_solo_anular ON public.invitaciones_acceso;
CREATE TRIGGER invitacion_solo_anular
  BEFORE UPDATE ON public.invitaciones_acceso
  FOR EACH ROW EXECUTE FUNCTION public.fn_invitacion_solo_anular();

COMMENT ON TABLE public.invitaciones_acceso IS
  'Enlaces de un solo uso para entrar en la cuenta sin contraseña (sólo la huella SHA-256).';
