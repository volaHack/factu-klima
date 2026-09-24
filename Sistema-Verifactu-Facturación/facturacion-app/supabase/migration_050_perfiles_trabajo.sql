-- ============================================================
-- 050 · PERFILES DE TRABAJO: QUIÉN ESTÁ USANDO LA CUENTA
-- ============================================================
--
-- Una cuenta es de un negocio, pero en el negocio trabaja más de una
-- persona: la dueña lleva los números y un empleado atiende el mostrador
-- o emite las facturas del día. Hasta ahora todos entraban con la misma
-- sesión y no quedaba rastro de quién había hecho qué.
--
-- Los perfiles NO son cuentas nuevas (no tienen email ni contraseña de
-- Supabase): son las personas que trabajan DENTRO de la cuenta, como los
-- perfiles de una plataforma de vídeo. Cada equipo recuerda quién está
-- delante, y cada perfil puede llevar un PIN para que nadie se haga pasar
-- por otro.
--
--  · perfiles_trabajo: las personas del negocio, con su rol
--    (titular · empleado · cajero), su color y su PIN (hash + sal).
--  · actividad_perfiles: qué hizo cada una y cuándo (entró, emitió una
--    factura, abrió o cerró la caja…). Es lo que responde a «¿quién
--    emitió esta factura?» y «¿quién está usando el panel?».
--
-- Todo con RLS por cuenta: cada negocio sólo ve sus perfiles.

create table if not exists public.perfiles_trabajo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 60),
  rol text not null check (rol in ('titular', 'empleado', 'cajero')),
  color text not null default '#b02a5c',
  -- SHA-256(sal || pin) en hexadecimal. Sin PIN, ambos a null.
  pin_hash text,
  pin_sal text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists perfiles_trabajo_cuenta on public.perfiles_trabajo (user_id);

alter table public.perfiles_trabajo enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'perfiles_trabajo' and policyname = 'perfiles_trabajo_propios') then
    create policy perfiles_trabajo_propios on public.perfiles_trabajo
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.actividad_perfiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- El perfil puede borrarse después: se guarda también su nombre, para
  -- que el historial siga diciendo quién fue.
  perfil_id uuid references public.perfiles_trabajo(id) on delete set null,
  perfil_nombre text not null,
  accion text not null check (accion in (
    'entrada', 'salida', 'factura_emitida', 'caja_abierta', 'caja_cerrada'
  )),
  -- Factura o sesión de caja a la que se refiere, si la hay.
  documento_id uuid,
  detalle text,
  en timestamptz not null default now()
);

create index if not exists actividad_perfiles_cuenta_fecha on public.actividad_perfiles (user_id, en desc);
create index if not exists actividad_perfiles_documento on public.actividad_perfiles (documento_id) where documento_id is not null;

alter table public.actividad_perfiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'actividad_perfiles' and policyname = 'actividad_perfiles_propia') then
    -- Se lee y se añade; no se edita ni se borra desde la app: es un
    -- registro, no una lista de tareas.
    create policy actividad_perfiles_propia on public.actividad_perfiles
      for select using (auth.uid() = user_id);
    create policy actividad_perfiles_alta on public.actividad_perfiles
      for insert with check (auth.uid() = user_id);
  end if;
end $$;
