-- ============================================================
-- 068 - Historial del programa anterior (solo consulta)
--
-- Una empresa que llega de otro programa (ISECAN, Factusol…) trae años de
-- facturas, albaranes y pedidos ya emitidos allí. No pueden entrar en
-- `invoices`: al insertarlas, el trigger de Veri*Factu les crearía su
-- registro pendiente de enviar a la AEAT, entrarían en los modelos de
-- IGIC/IVA, en la contabilidad y en los recordatorios de cobro, y ya no
-- se podrían borrar. Pero sí hace falta verlos: cuánto compra un cliente,
-- cuándo fue su última compra, qué albaranes quedaron sin facturar.
--
-- Esta tabla los guarda aparte, solo para consulta. Nada de la app suma
-- desde aquí en la parte fiscal ni contable.
--
--   · tipo: factura_venta, albaran_venta, pedido_venta, factura_compra,
--     albaran_compra.
--   · serie + numero: tal como estaban en el programa anterior.
--   · codigo_tercero: el código del cliente o proveedor allí; client_id
--     es la ficha de aquí con ese código (clients.codigo, migración 067).
--   · bases: [{ tipo, base, cuota }] por tipo impositivo.
--   · pasa_a: documentos posteriores («factura_compra:25/16»); un
--     albarán sin nada aquí no llegó a facturarse.
-- ============================================================

create table if not exists public.historico_documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origen text not null,
  tipo text not null check (tipo in ('factura_venta', 'albaran_venta', 'pedido_venta', 'factura_compra', 'albaran_compra')),
  serie text not null default '',
  numero text not null,
  fecha date,
  codigo_tercero text,
  client_id uuid references public.clients(id) on delete set null,
  base numeric(14, 2) not null default 0,
  impuestos numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  bases jsonb not null default '[]'::jsonb check (jsonb_typeof(bases) = 'array'),
  forma_pago text,
  observaciones text,
  pasa_a text[] not null default '{}',
  creado_en timestamptz not null default now(),
  unique (user_id, origen, tipo, serie, numero)
);

create index if not exists historico_documentos_ficha on public.historico_documentos (client_id, fecha desc);
create index if not exists historico_documentos_cuenta on public.historico_documentos (user_id, fecha desc);

comment on table public.historico_documentos is 'Documentos emitidos en el programa anterior. Solo consulta: no cuentan en Veri*Factu, modelos fiscales ni contabilidad';

alter table public.historico_documentos enable row level security;

-- La empresa lo ve y lo puede vaciar (o volver a cargar); cambiarlo no:
-- es un registro de lo que pasó en el otro programa.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'historico_documentos' and policyname = 'historico_lee_propio') then
    create policy historico_lee_propio on public.historico_documentos
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_documentos' and policyname = 'historico_carga_propio') then
    create policy historico_carga_propio on public.historico_documentos
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_documentos' and policyname = 'historico_borra_propio') then
    create policy historico_borra_propio on public.historico_documentos
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_proc where proname = 'es_gestoria_de')
     and not exists (select 1 from pg_policies where tablename = 'historico_documentos' and policyname = 'gestoria_lee_historico') then
    create policy gestoria_lee_historico on public.historico_documentos
      for select to authenticated using (public.es_gestoria_de(user_id));
  end if;
  -- Como en todas las tablas desde la 065: sin el segundo código, nada.
  if exists (select 1 from pg_proc where proname = 'segundo_factor_cumplido')
     and not exists (select 1 from pg_policies where tablename = 'historico_documentos' and policyname = '2fa: exigir segundo factor') then
    create policy "2fa: exigir segundo factor" on public.historico_documentos as restrictive for all to authenticated
      using ((select public.segundo_factor_cumplido())) with check ((select public.segundo_factor_cumplido()));
  end if;
end $$;

revoke all on public.historico_documentos from anon;
grant select, insert, delete on public.historico_documentos to authenticated;
