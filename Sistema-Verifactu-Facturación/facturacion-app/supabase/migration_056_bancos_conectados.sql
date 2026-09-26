-- ============================================================
-- 056 · BANCOS CONECTADOS (OPEN BANKING, PSD2)
-- ============================================================
--
-- La conexión de un negocio con su banco a través de Enable Banking: el
-- negocio autoriza en la web de su banco (PSD2, hasta 180 días) y desde
-- entonces los movimientos se traen solos a la conciliación.
--
-- Las dos tablas son SÓLO del servidor (sin políticas para el navegador):
-- el `session_id` de Enable Banking, junto con la clave privada de la
-- plataforma, da acceso a los movimientos. La pantalla habla con la API
-- del programa, que comprueba de quién es cada cosa.

create table if not exists public.bancos_conectados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  banco text not null,
  pais text not null default 'ES',
  session_id text not null unique,
  -- [{ uid, iban, nombre, moneda }]
  cuentas jsonb not null default '[]'::jsonb,
  valido_hasta timestamptz,
  creado_en timestamptz not null default now(),
  ultima_lectura timestamptz
);

create index if not exists bancos_conectados_cuenta on public.bancos_conectados (user_id);
alter table public.bancos_conectados enable row level security;

-- La vuelta desde el banco trae un `state`: aquí se sabe de quién es.
create table if not exists public.bancos_autorizaciones (
  state text primary key check (char_length(state) >= 32),
  user_id uuid not null references auth.users(id) on delete cascade,
  banco text not null,
  pais text not null default 'ES',
  creado_en timestamptz not null default now()
);

alter table public.bancos_autorizaciones enable row level security;
