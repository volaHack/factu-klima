-- ------------------------------------------------------------
-- 10. LOGIN DE ESCRITORIO: PASAR EL CÓDIGO, NO LOS TOKENS
--
-- La 009 guardaba la sesión ya intercambiada (access_token/refresh_token),
-- pero ese intercambio ocurría en /auth/callback del servidor, y ahí
-- fallaba siempre en la app de escritorio: createBrowserClient fuerza
-- flowType=pkce, así que el code_verifier vive solo en las cookies de
-- Electron, mientras que la petición del callback llega al servidor desde
-- el navegador del sistema (sin ese verifier) → AuthPKCECodeVerifierMissing
-- → la tabla nunca se rellenaba y la app se quedaba esperando.
--
-- Ahora el callback solo guarda el code de autorización crudo y la app de
-- escritorio hace el exchange en su propio contexto (donde sí existe el
-- verifier) llamando a exchangeCodeForSession(code).
-- ------------------------------------------------------------

alter table public.desktop_login add column if not exists code text;

-- Se cambia la firma de la función: hay que soltar la anterior (no se puede
-- cambiar el tipo de retorno con create or replace).
drop function if exists public.complete_desktop_login(text);

create or replace function public.complete_desktop_login(p_state text)
returns table (code text)
language sql
security definer
set search_path = public
as $$
  delete from public.desktop_login where created_at < now() - interval '10 minutes';
  delete from public.desktop_login
  where state = p_state
    and code is not null
  returning code;
$$;

-- La app de escritorio (clave pública, rol anon) es quien hace el
-- polling, así que necesita EXECUTE. Postgres da EXECUTE a PUBLIC y
-- Supabase además da EXECUTE por nombre a anon/authenticated/service_role
-- vía ALTER DEFAULT PRIVILEGES; hay que revocar el de PUBLIC para que el
-- acceso quede solo en los roles explícitos.
REVOKE EXECUTE ON FUNCTION public.complete_desktop_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_desktop_login(TEXT) TO anon, authenticated;
