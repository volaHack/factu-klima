-- ============================================================
-- 054 · SESIONES DE LOS PERFILES: QUIÉN ESTÁ TRABAJANDO AHORA
-- ============================================================
--
-- `actividad_perfiles` (050) guarda lo que pasó: entró, emitió, cerró la
-- caja. No responde bien a «¿quién está usando el panel AHORA?»: si alguien
-- cierra el navegador sin cerrar su perfil, su «entrada» se queda sin
-- «salida» para siempre.
--
-- Aquí cada equipo (navegador) tiene una fila por cuenta con quién está
-- delante, en qué pantalla y cuándo dio señales de vida por última vez
-- (se renueva cada minuto mientras se usa). La titular ve la lista en
-- «Equipo» y puede cerrar la sesión de un equipo a distancia: se marca
-- `cerrar` y ese equipo, en su siguiente latido, cierra el perfil.

create table if not exists public.sesiones_perfiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identificador aleatorio que cada navegador guarda para sí.
  equipo_id text not null check (char_length(equipo_id) between 8 and 64),
  -- Sin clave ajena: el perfil puede borrarse y la sesión seguir a la vista.
  perfil_id uuid not null,
  perfil_nombre text not null check (char_length(perfil_nombre) between 1 and 60),
  perfil_rol text not null check (perfil_rol in ('titular', 'empleado', 'cajero')),
  -- «Mostrador», «Chrome en Windows»…
  equipo text not null default 'Equipo' check (char_length(equipo) between 1 and 60),
  pagina text check (char_length(pagina) <= 200),
  desde timestamptz not null default now(),
  visto_en timestamptz not null default now(),
  cerrar boolean not null default false,
  primary key (user_id, equipo_id)
);

create index if not exists sesiones_perfiles_recientes on public.sesiones_perfiles (user_id, visto_en desc);

alter table public.sesiones_perfiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sesiones_perfiles' and policyname = 'sesiones_perfiles_propias') then
    create policy sesiones_perfiles_propias on public.sesiones_perfiles
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
