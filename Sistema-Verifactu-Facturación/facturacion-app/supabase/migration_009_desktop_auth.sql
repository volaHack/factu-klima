-- ------------------------------------------------------------
-- 9. LOGIN CON GOOGLE DESDE LA APP DE ESCRITORIO (ELECTRON)
--
-- Google no permite iniciar sesión dentro de la ventana embebida de
-- Electron, así que el OAuth ocurre en el navegador del sistema. Antes
-- eso se devolvía a la app con un enlace del protocolo propio "klima://",
-- que dependía de que Windows tuviera el protocolo registrado y de que el
-- navegador pidiera permiso para abrir la app — y fallaba dejando la app
-- colgada en el login.
--
-- Sustitución por polling: la app de escritorio genera un "state"
-- aleatorio, lo manda en el redirectTo del OAuth y se pone a preguntar.
-- El callback /auth/callback del servidor guarda aquí la sesión recién
-- creada (con service_role, saltándose la RLS), y la app recoge los
-- tokens por polling llamando a complete_desktop_login(state) — que solo
-- devuelve la fila si el state coincide y borra la fila al leerla
-- (consumo único). Sin protocolo de sistema operativo de por medio.
-- ------------------------------------------------------------

create table if not exists public.desktop_login (
  state text primary key,
  user_id uuid,
  access_token text,
  refresh_token text,
  created_at timestamptz not null default now()
);

-- Bloqueada para anon/authenticated: ni leer ni escribir directo. Solo
-- se accede vía service_role (el callback del servidor inserta) y vía la
-- función security definer de abajo (la app lee y consume).
alter table public.desktop_login enable row level security;

-- Recoge la sesión completada por polling desde la app de escritorio.
-- Devuelve los tokens SOLO si el state existe y la fila ya está
-- completada (user_id/access_token/refresh_token rellenos) y borra la
-- fila al hacerlo: un state solo se puede consumir una vez. También purga
-- filas antiguas para que la tabla no crezca si el usuario abandona el
-- login a mitad.
create or replace function public.complete_desktop_login(p_state text)
returns table (access_token text, refresh_token text)
language sql
security definer
set search_path = public
as $$
  delete from public.desktop_login where created_at < now() - interval '10 minutes';
  delete from public.desktop_login
  where state = p_state
    and user_id is not null
    and access_token is not null
    and refresh_token is not null
  returning access_token, refresh_token;
$$;

-- La app de escritorio (clave pública, rol anon) es quien hace el
-- polling, así que necesita EXECUTE. Postgres da EXECUTE a PUBLIC y
-- Supabase además da EXECUTE por nombre a anon/authenticated/service_role
-- vía ALTER DEFAULT PRIVILEGES; hay que revocar el de PUBLIC para que el
-- acceso quede solo en los roles explícitos.
REVOKE EXECUTE ON FUNCTION public.complete_desktop_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_desktop_login(TEXT) TO anon, authenticated;
