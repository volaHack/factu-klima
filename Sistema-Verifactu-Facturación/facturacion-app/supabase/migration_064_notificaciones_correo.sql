-- =============================================================================
-- 064 — Notificaciones por correo: avisos del panel y resumen del mes
-- =============================================================================
-- Una fila por cuenta (cada empresa es una cuenta). Las dos cosas vienen
-- APAGADAS: sólo se manda lo que la empresa enciende en Ajustes.
--
-- La empresa sólo puede cambiar sus dos interruptores. Lo demás (qué se
-- avisó la última vez, el enlace de baja) lo escribe el servidor.

create table if not exists public.notificaciones_correo (
  user_id             uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  avisos              boolean     not null default false,
  resumen_mensual     boolean     not null default false,
  -- Para el enlace «dejar de recibir estos correos», sin iniciar sesión.
  token_baja          uuid        not null default gen_random_uuid() unique,
  ultimo_aviso_huella text,
  ultimo_aviso_en     timestamptz,
  -- AAAA-MM del último resumen mandado: nunca dos del mismo mes.
  ultimo_resumen      text,
  actualizado_en      timestamptz not null default now()
);

alter table public.notificaciones_correo enable row level security;

drop policy if exists "notificaciones: ver las suyas" on public.notificaciones_correo;
create policy "notificaciones: ver las suyas" on public.notificaciones_correo
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "notificaciones: crear las suyas" on public.notificaciones_correo;
create policy "notificaciones: crear las suyas" on public.notificaciones_correo
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "notificaciones: cambiar las suyas" on public.notificaciones_correo;
create policy "notificaciones: cambiar las suyas" on public.notificaciones_correo
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notificaciones_correo from anon, authenticated;
grant select (user_id, avisos, resumen_mensual, actualizado_en) on public.notificaciones_correo to authenticated;
grant insert (user_id, avisos, resumen_mensual, actualizado_en) on public.notificaciones_correo to authenticated;
grant update (avisos, resumen_mensual, actualizado_en) on public.notificaciones_correo to authenticated;
