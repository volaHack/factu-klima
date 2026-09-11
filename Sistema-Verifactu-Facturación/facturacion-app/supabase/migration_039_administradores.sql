-- ============================================================
-- MIGRACIÓN 039: rol de administradora de la plataforma
--
-- Hasta ahora «admin» era un email escrito a mano en storage.ts, en el
-- trigger de límite y en la migración 005. Ahora es una fila en una
-- tabla que nadie puede leer ni escribir desde la API pública: sólo se
-- rellena desde el editor SQL de Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.administradores (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota      TEXT
);

ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: ni lectura ni escritura desde la API.
REVOKE ALL ON public.administradores FROM anon, authenticated;

-- Para el servidor y los triggers: ¿es admin este usuario?
CREATE OR REPLACE FUNCTION public.es_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.administradores WHERE user_id = p_uid);
$$;
REVOKE EXECUTE ON FUNCTION public.es_admin(UUID) FROM PUBLIC, anon, authenticated;

-- Para el navegador: sólo se puede preguntar por uno mismo, así nadie
-- sondea qué otras cuentas son admin.
CREATE OR REPLACE FUNCTION public.soy_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.es_admin(auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.soy_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soy_admin() TO authenticated;
