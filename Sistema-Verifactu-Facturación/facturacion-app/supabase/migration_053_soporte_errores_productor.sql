-- ============================================================
-- 053 · SOPORTE, REGISTRO DE ERRORES Y DATOS DEL PRODUCTOR
-- ============================================================
--
--  · soporte_conversaciones / soporte_mensajes: el chat entre cada cuenta
--    y la administración. Cada cuenta ve sólo lo suyo; la administración
--    (public.soy_admin()) ve y contesta todo. Los contadores de «sin leer»
--    los lleva un disparador, no el navegador.
--  · errores_app: los fallos que ven los usuarios (en su navegador) y los
--    del servidor, para enterarse sin que nadie tenga que avisar. Se
--    escribe sólo desde el servidor (clave de servicio); lo lee la
--    administración.
--  · plataforma_config: quién produce el software y los datos de su
--    declaración responsable (RD 1007/2023, Orden HAC/1177/2024). Son los
--    que van en el bloque SistemaInformatico de cada registro Veri*Factu
--    de TODAS las cuentas: el productor es la plataforma, no cada cliente.

-- ---------- Soporte ----------

create table if not exists public.soporte_conversaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asunto text not null default 'Consulta' check (char_length(asunto) between 1 and 120),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  -- Para no tener que cruzar con los ajustes al listar en administración.
  empresa text,
  email text,
  no_leidos_admin integer not null default 0,
  no_leidos_usuario integer not null default 0,
  ultimo_mensaje_en timestamptz not null default now(),
  creada_en timestamptz not null default now()
);

create index if not exists soporte_conversaciones_cuenta on public.soporte_conversaciones (user_id, ultimo_mensaje_en desc);
create index if not exists soporte_conversaciones_bandeja on public.soporte_conversaciones (estado, ultimo_mensaje_en desc);

create table if not exists public.soporte_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.soporte_conversaciones(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  de_admin boolean not null default false,
  texto text not null check (char_length(trim(texto)) between 1 and 4000),
  -- En qué pantalla estaba quien escribe: ahorra el «¿dónde estás?».
  pagina text,
  creado_en timestamptz not null default now()
);

create index if not exists soporte_mensajes_conversacion on public.soporte_mensajes (conversacion_id, creado_en);

alter table public.soporte_conversaciones enable row level security;
alter table public.soporte_mensajes enable row level security;

do $$ begin
  -- La cuenta: sus conversaciones.
  if not exists (select 1 from pg_policies where tablename = 'soporte_conversaciones' and policyname = 'soporte_conv_propias') then
    create policy soporte_conv_propias on public.soporte_conversaciones
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  -- La administración: todas.
  if not exists (select 1 from pg_policies where tablename = 'soporte_conversaciones' and policyname = 'soporte_conv_admin') then
    create policy soporte_conv_admin on public.soporte_conversaciones
      for all to authenticated
      using (public.soy_admin())
      with check (public.soy_admin());
  end if;

  -- Mensajes: la cuenta lee los de sus conversaciones y escribe como cliente.
  if not exists (select 1 from pg_policies where tablename = 'soporte_mensajes' and policyname = 'soporte_msg_leer_propios') then
    create policy soporte_msg_leer_propios on public.soporte_mensajes
      for select to authenticated
      using (exists (select 1 from public.soporte_conversaciones c where c.id = conversacion_id and c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'soporte_mensajes' and policyname = 'soporte_msg_escribir_propios') then
    create policy soporte_msg_escribir_propios on public.soporte_mensajes
      for insert to authenticated
      with check (
        de_admin = false
        and autor_id = auth.uid()
        and exists (select 1 from public.soporte_conversaciones c where c.id = conversacion_id and c.user_id = auth.uid())
      );
  end if;
  -- La administración lee y contesta en cualquiera.
  if not exists (select 1 from pg_policies where tablename = 'soporte_mensajes' and policyname = 'soporte_msg_admin') then
    create policy soporte_msg_admin on public.soporte_mensajes
      for all to authenticated
      using (public.soy_admin())
      with check (public.soy_admin() and autor_id = auth.uid());
  end if;
end $$;

-- Al llegar un mensaje: la conversación sube arriba, suma un «sin leer»
-- al otro lado y, si el cliente escribe en una cerrada, se reabre.
create or replace function public.fn_soporte_mensaje_nuevo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.de_admin then
    update public.soporte_conversaciones
       set ultimo_mensaje_en = new.creado_en,
           no_leidos_usuario = no_leidos_usuario + 1
     where id = new.conversacion_id;
  else
    update public.soporte_conversaciones
       set ultimo_mensaje_en = new.creado_en,
           no_leidos_admin = no_leidos_admin + 1,
           estado = 'abierta'
     where id = new.conversacion_id;
  end if;
  return new;
end $$;

revoke execute on function public.fn_soporte_mensaje_nuevo() from public, anon, authenticated;

drop trigger if exists soporte_mensaje_nuevo on public.soporte_mensajes;
create trigger soporte_mensaje_nuevo
  after insert on public.soporte_mensajes
  for each row execute function public.fn_soporte_mensaje_nuevo();

-- ---------- Errores ----------

create table if not exists public.errores_app (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  origen text not null check (origen in ('navegador', 'servidor')),
  mensaje text not null,
  pila text,
  ruta text,
  -- Misma huella = mismo fallo: la administración los agrupa.
  huella text not null,
  user_id uuid,
  navegador text,
  version text,
  resuelto boolean not null default false
);

create index if not exists errores_app_fecha on public.errores_app (creado_en desc);
create index if not exists errores_app_huella on public.errores_app (huella, creado_en desc);

alter table public.errores_app enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'errores_app' and policyname = 'errores_app_admin_lee') then
    create policy errores_app_admin_lee on public.errores_app
      for select to authenticated using (public.soy_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'errores_app' and policyname = 'errores_app_admin_marca') then
    create policy errores_app_admin_marca on public.errores_app
      for update to authenticated using (public.soy_admin()) with check (public.soy_admin());
  end if;
end $$;

-- ---------- Productor del software y declaración responsable ----------

alter table public.plataforma_config
  add column if not exists productor_nombre text,
  add column if not exists productor_nif text,
  add column if not exists productor_domicilio text,
  add column if not exists productor_email text,
  add column if not exists sistema_nombre text not null default 'FactuKlima',
  add column if not exists sistema_id text not null default 'FK',
  add column if not exists sistema_version text not null default '1.0',
  add column if not exists declaracion_lugar text,
  add column if not exists declaracion_fecha date,
  -- A qué correo avisar cuando entra un mensaje de soporte (opcional).
  add column if not exists soporte_email text;
