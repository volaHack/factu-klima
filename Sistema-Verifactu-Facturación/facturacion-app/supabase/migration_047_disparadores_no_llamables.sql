-- ============================================================
-- 047 · LOS DISPARADORES NO SE LLAMAN DESDE FUERA
-- ============================================================
--
-- Las funciones que protegen las facturas (sellado, inmutabilidad, no
-- borrar, registro Veri*Factu, guardas de líneas y ajustes…) son
-- SECURITY DEFINER y Postgres les da EXECUTE a PUBLIC al crearlas. Eso
-- las publicaba en /rest/v1/rpc/<nombre>, llamables incluso sin sesión
-- (el asesor de seguridad de Supabase las marcaba: 12 para «anon», 17
-- para «authenticated»).
--
-- Llamarlas a mano falla —una función de disparador fuera de un
-- disparador no tiene NEW ni OLD—, pero ninguna tiene por qué estar a la
-- vista: el permiso EXECUTE sólo se comprueba al CREAR el disparador, no
-- cada vez que salta, así que retirarlo no cambia nada de lo que hacen.
--
-- Sólo se tocan las que devuelven `trigger`. Las que se usan como RPC o
-- dentro de políticas (soy_admin, mi_email, es_gestoria_de,
-- fn_pos_adjust_stock, aceptar_acceso_gestoria, complete_desktop_login…)
-- se quedan como estaban.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
