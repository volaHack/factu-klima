-- ============================================================
-- MIGRACIÓN 039b: endurecer el rol de administradora
--
-- La 039 cerró la puerta a `anon` y a `authenticated`, pero NO a
-- `service_role`, que es la clave con la que escriben el webhook de
-- Stripe y las rutas /api/admin/*. Con ella se podía crear una
-- administradora desde el servidor: justo lo que el diseño dice que no
-- puede pasar. Ser admin se concede SÓLO desde el editor SQL de
-- Supabase, que corre como `postgres` —el dueño de la tabla— y por eso
-- sigue funcionando igual después de esto.
--
-- El panel sí necesita LEERLA (src/lib/admin/datos.ts lista qué cuentas
-- son administradoras), así que el SELECT se queda.
--
-- Aquí no sirve un trigger como el de `admin_registro`: bloquearía
-- también al editor SQL, que es el único camino que debe seguir
-- abierto.
-- ============================================================

REVOKE ALL ON public.administradores FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.administradores FROM service_role;

COMMENT ON TABLE public.administradores IS
  'Administradoras de la plataforma. No se escribe desde la app ni desde el servidor: sólo desde el editor SQL de Supabase. Preguntar con public.es_admin(uuid) o public.soy_admin().';
COMMENT ON COLUMN public.administradores.nota IS
  'Por qué esta cuenta es administradora. Texto libre para quien lo lea dentro de un año.';

-- La garantía, comprobada sola. Los privilegios por defecto del esquema
-- public empujan en sentido contrario: si alguien recrea la tabla o la
-- función sin repetir los REVOKE, esta migración se niega a aplicarse.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.administradores', 'SELECT') THEN
    RAISE EXCEPTION 'administradores quedaría legible por authenticated: revisa los REVOKE de la 039.';
  END IF;
  IF has_table_privilege('anon', 'public.administradores', 'SELECT') THEN
    RAISE EXCEPTION 'administradores quedaría legible por anon: revisa los REVOKE de la 039.';
  END IF;
  IF has_function_privilege('authenticated', 'public.es_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'es_admin(uuid) quedaría ejecutable desde la app: cualquiera podría sondear qué cuentas son admin.';
  END IF;
  IF has_table_privilege('service_role', 'public.administradores', 'INSERT') THEN
    RAISE EXCEPTION 'service_role todavía puede crear administradoras: el REVOKE de esta migración no ha surtido efecto.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.soy_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'soy_admin() no es ejecutable desde la app: el menú y el panel dejarían de reconocer a la administradora.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'administradores') THEN
    RAISE EXCEPTION 'administradores no debe tener políticas RLS: sin privilegios, una política sólo confunde.';
  END IF;
END $$;
