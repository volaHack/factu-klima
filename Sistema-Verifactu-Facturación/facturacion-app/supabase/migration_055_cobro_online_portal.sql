-- ============================================================
-- 055 · COBRO ONLINE DE FACTURAS Y PORTAL DEL CLIENTE
-- ============================================================
--
--  · cobro_online_cuentas: la cuenta de Stripe (Connect, tipo Express) de
--    cada negocio. El dinero de sus facturas va a SU cuenta, no a la de la
--    plataforma. La escribe sólo el servidor (clave de servicio); la cuenta
--    la puede leer para saber en qué punto está.
--  · portal_clientes: el enlace que un negocio le da a su cliente para ver
--    sus facturas y pagarlas. El token es el único secreto: largo, aleatorio
--    y revocable. La página pública lo resuelve en el servidor.
--  · cobros_online: cada intento de pago y cómo acabó, para no apuntar dos
--    veces el mismo cobro y para que el negocio vea qué entró por ahí.

create table if not exists public.cobro_online_cuentas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  -- Stripe ha verificado el negocio y ya puede cobrar.
  cobros_activos boolean not null default false,
  datos_enviados boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.cobro_online_cuentas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cobro_online_cuentas' and policyname = 'cobro_online_cuentas_leer_propia') then
    create policy cobro_online_cuentas_leer_propia on public.cobro_online_cuentas
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.portal_clientes (
  token text primary key check (char_length(token) >= 32),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz,
  revocado_en timestamptz
);

-- Un enlace vivo por cliente: pedirlo otra vez devuelve el mismo.
create unique index if not exists portal_clientes_uno_vivo
  on public.portal_clientes (user_id, client_id) where revocado_en is null;

alter table public.portal_clientes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'portal_clientes' and policyname = 'portal_clientes_propios') then
    create policy portal_clientes_propios on public.portal_clientes
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.cobros_online (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  stripe_session_id text not null unique,
  importe numeric(12, 2) not null check (importe > 0),
  estado text not null default 'iniciado' check (estado in ('iniciado', 'pagado', 'caducado')),
  -- El cobro que se apuntó en cobros_pagos al confirmarse.
  cobro_pago_id uuid,
  creado_en timestamptz not null default now(),
  pagado_en timestamptz
);

create index if not exists cobros_online_factura on public.cobros_online (invoice_id);

alter table public.cobros_online enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cobros_online' and policyname = 'cobros_online_leer_propios') then
    create policy cobros_online_leer_propios on public.cobros_online
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
