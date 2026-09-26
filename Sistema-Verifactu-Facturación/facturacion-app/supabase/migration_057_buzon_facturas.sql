-- ============================================================
-- 057 · BUZÓN DE FACTURAS DE PROVEEDORES
-- ============================================================
--
-- Cada cuenta tiene una dirección de correo propia (una clave larga y
-- aleatoria dentro de la dirección del servicio de correo entrante). Lo
-- que llega ahí con un PDF o una foto se guarda en `buzon_documentos` y
-- espera en la bandeja de Gastos a que alguien lo revise: la IA lo lee en
-- el navegador, igual que la foto de un ticket, y nunca se guarda un gasto
-- sin que una persona lo vea.

create table if not exists public.buzon_direcciones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clave text not null unique check (char_length(clave) between 16 and 64),
  creado_en timestamptz not null default now()
);

alter table public.buzon_direcciones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'buzon_direcciones' and policyname = 'buzon_direcciones_propia') then
    create policy buzon_direcciones_propia on public.buzon_direcciones
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.buzon_documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recibido_en timestamptz not null default now(),
  remitente text,
  asunto text,
  nombre text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  -- El fichero en base64. Con tope: una factura no pesa más de unos MB.
  contenido text not null check (char_length(contenido) <= 14000000),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'procesado', 'descartado')),
  gasto_id uuid
);

create index if not exists buzon_documentos_bandeja on public.buzon_documentos (user_id, estado, recibido_en desc);

alter table public.buzon_documentos enable row level security;

do $$ begin
  -- La cuenta ve y marca lo suyo; sólo el servidor (el correo entrante) lo escribe.
  if not exists (select 1 from pg_policies where tablename = 'buzon_documentos' and policyname = 'buzon_documentos_leer') then
    create policy buzon_documentos_leer on public.buzon_documentos
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'buzon_documentos' and policyname = 'buzon_documentos_marcar') then
    create policy buzon_documentos_marcar on public.buzon_documentos
      for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'buzon_documentos' and policyname = 'buzon_documentos_borrar') then
    create policy buzon_documentos_borrar on public.buzon_documentos
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
