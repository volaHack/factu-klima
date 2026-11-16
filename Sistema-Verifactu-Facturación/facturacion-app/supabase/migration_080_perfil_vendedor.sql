-- ============================================================
-- 080 · PERFIL DE VENDEDOR
-- ============================================================
--
-- Un rol más entre los perfiles de trabajo (050): el vendedor, que hace
-- pedidos y presupuestos de venta y consulta los clientes, sin ver costes,
-- compras, facturas ni las cifras del negocio. Qué ve y qué no lo decide
-- la aplicación (src/lib/perfiles.ts); aquí sólo se deja guardar el rol.
--
-- Las dos tablas que lo apuntan lo limitaban a titular · empleado · cajero
-- con un CHECK: se sustituye por uno que admite también `vendedor`.
--
-- No toca ninguna fila y se puede aplicar en caliente y más de una vez.
-- Mientras no se aplique, guardar un perfil de vendedor da error en las
-- cuentas que guardan los perfiles en la tabla.

do $$
declare
  c record;
begin
  -- El CHECK del rol se creó sin nombre: se busca por lo que comprueba.
  for c in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and con.contype = 'c'
       and (
         (rel.relname = 'perfiles_trabajo' and pg_get_constraintdef(con.oid) ilike '%rol%cajero%')
         or (rel.relname = 'sesiones_perfiles' and pg_get_constraintdef(con.oid) ilike '%perfil_rol%cajero%')
       )
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

alter table public.perfiles_trabajo
  add constraint perfiles_trabajo_rol_check
  check (rol in ('titular', 'empleado', 'vendedor', 'cajero'));

alter table public.sesiones_perfiles
  add constraint sesiones_perfiles_perfil_rol_check
  check (perfil_rol in ('titular', 'empleado', 'vendedor', 'cajero'));

comment on column public.perfiles_trabajo.rol is
  'titular · empleado · vendedor · cajero (lo que ve cada uno: src/lib/perfiles.ts).';
