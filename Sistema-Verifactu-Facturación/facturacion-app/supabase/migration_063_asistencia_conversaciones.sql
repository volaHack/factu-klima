-- =============================================================================
-- 063 — Conversaciones de la Asistencia, guardadas en la cuenta
-- =============================================================================
-- Antes vivían sólo en el navegador. Ahora una fila por conversación, de la
-- cuenta (cada empresa es una cuenta). La RLS sólo deja tocar las filas de
-- quien ha entrado: ninguna empresa ve las conversaciones de otra.

create table if not exists public.asistencia_conversaciones (
  user_id        uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id             text        not null check (char_length(id) between 1 and 64),
  titulo         text        not null default '' check (char_length(titulo) <= 120),
  mensajes       jsonb       not null default '[]'::jsonb check (jsonb_typeof(mensajes) = 'array'),
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  primary key (user_id, id),
  -- Una conversación muy larga no puede llenar la base de datos.
  constraint asistencia_conversaciones_tamano check (pg_column_size(mensajes) <= 524288)
);

create index if not exists asistencia_conversaciones_recientes
  on public.asistencia_conversaciones (user_id, actualizada_en desc);

alter table public.asistencia_conversaciones enable row level security;

drop policy if exists "asistencia: ver las suyas" on public.asistencia_conversaciones;
create policy "asistencia: ver las suyas" on public.asistencia_conversaciones
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "asistencia: crear las suyas" on public.asistencia_conversaciones;
create policy "asistencia: crear las suyas" on public.asistencia_conversaciones
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "asistencia: cambiar las suyas" on public.asistencia_conversaciones;
create policy "asistencia: cambiar las suyas" on public.asistencia_conversaciones
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "asistencia: borrar las suyas" on public.asistencia_conversaciones;
create policy "asistencia: borrar las suyas" on public.asistencia_conversaciones
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.asistencia_conversaciones from anon;
grant select, insert, update, delete on public.asistencia_conversaciones to authenticated;
