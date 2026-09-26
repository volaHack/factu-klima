-- ============================================================
-- 059 · VARIAS EMPRESAS CON UN SOLO ACCESO
-- ============================================================
--
-- Cada empresa sigue siendo una cuenta con sus datos aparte (todo cuelga
-- de user_id y de RLS, y así se queda). Lo nuevo es agruparlas: quien
-- lleva una SL y además es autónomo, o una gestoría pequeña, pasa de una
-- a otra desde el menú sin volver a iniciar sesión.
--
-- Sólo el servidor (service role) lee y escribe estas tablas: el cambio de
-- empresa se autoriza allí, comprobando que las dos cuentas son del mismo
-- grupo. Sin políticas = el navegador no ve nada.

create table if not exists public.grupos_empresas (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  grupo_id  uuid not null,
  unida_en  timestamptz not null default now()
);
create index if not exists grupos_empresas_grupo_idx on public.grupos_empresas (grupo_id);
alter table public.grupos_empresas enable row level security;

-- Para unir una cuenta que ya existe: se saca un código en una y se
-- escribe en la otra. Vale 15 minutos y un solo uso.
create table if not exists public.codigos_vinculo (
  codigo     text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  caduca_en  timestamptz not null
);
create index if not exists codigos_vinculo_user_idx on public.codigos_vinculo (user_id);
alter table public.codigos_vinculo enable row level security;

revoke all on public.grupos_empresas, public.codigos_vinculo from anon, authenticated;
