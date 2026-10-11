-- =============================================================================
-- Aplicar DESPUÉS de desplegar la app que pide el código (proxy + /auth/dos-pasos):
-- si no, una cuenta con segundo factor vería el panel vacío sin saber por qué.
-- En producción, por tandas de tablas y con lock_timeout, para no bloquear.
-- 065 — Verificación en dos pasos de verdad: sin código, sin datos
-- =============================================================================
-- Con la verificación en dos pasos activada, iniciar sesión sólo con la
-- contraseña da una sesión de nivel aal1. La app la manda a pedir el código
-- (proxy y /auth/dos-pasos), pero eso es la pantalla: quien tuviera la
-- contraseña podría llamar a la API directamente con esa sesión. Esta
-- migración lo cierra en la base de datos.
--
-- Una política RESTRICTIVA en cada tabla de `public`: para el rol
-- `authenticated`, si la cuenta tiene un segundo factor verificado, la
-- sesión tiene que ser aal2. Las cuentas sin segundo factor siguen igual.
-- `anon` (portal del cliente, aprobar presupuestos) y el servidor con la
-- clave de servicio no se ven afectados.
--
-- La función se evalúa una vez por consulta (`(select …)`), no por fila.
-- Las tablas que se creen después necesitan su política: la función
-- `public.exigir_segundo_factor(tabla)` la pone.

create or replace function public.segundo_factor_cumplido()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.segundo_factor_cumplido() from public, anon;
grant execute on function public.segundo_factor_cumplido() to authenticated;

create or replace function public.exigir_segundo_factor(tabla regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('drop policy if exists "2fa: exigir segundo factor" on %s', tabla);
  execute format(
    'create policy "2fa: exigir segundo factor" on %s as restrictive for all to authenticated '
    'using ((select public.segundo_factor_cumplido())) with check ((select public.segundo_factor_cumplido()))',
    tabla);
end;
$$;

revoke all on function public.exigir_segundo_factor(regclass) from public, anon, authenticated;

do $$
declare t record;
begin
  for t in
    select c.oid::regclass as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    perform public.exigir_segundo_factor(t.tabla);
  end loop;
end $$;
