-- ============================================================
-- 071 - Presupuestos en el historial del programa anterior
--
-- En ISECAN los presupuestos se guardaban con el mismo formato que los
-- albaranes. Cargados como albaranes, cientos de presupuestos que nunca
-- se aceptaron salían como «albaranes sin facturar», con su importe
-- sumado a lo pendiente. Se pueden guardar como lo que son.
--
--   · tipo admite presupuesto_venta.
--   · historico_listado (070): tipo «presupuesto», estado «emitida»
--     (si se aceptó o no, el programa de antes no lo decía).
--   · resumen_historico (069): un presupuesto no es algo pendiente de
--     facturar ni de servir.
-- ============================================================

alter table public.historico_documentos drop constraint if exists historico_documentos_tipo_check;
alter table public.historico_documentos add constraint historico_documentos_tipo_check
  check (tipo in ('factura_venta', 'albaran_venta', 'pedido_venta', 'presupuesto_venta', 'factura_compra', 'albaran_compra'));

create or replace view public.historico_listado
with (security_invoker = true) as
select
  h.id,
  h.user_id,
  h.origen,
  h.tipo as tipo_historico,
  case when h.tipo like 'factura%' then 'factura' when h.tipo like 'albaran%' then 'albaran'
       when h.tipo like 'presupuesto%' then 'presupuesto' else 'pedido' end as tipo,
  case when h.tipo like '%compra' then 'compra' else 'venta' end as sentido,
  case when h.serie = '' or (left(h.numero, length(h.serie)) = h.serie and length(h.numero) - length(h.serie) >= 4)
       then h.numero else upper(h.serie) || '/' || h.numero end as numero,
  h.fecha,
  h.client_id,
  coalesce(nullif(c.trade_name, ''), c.business_name) as cliente,
  c.business_name as razon_social,
  c.nif as cliente_nif,
  h.codigo_tercero,
  h.total,
  case when h.tipo in ('factura_venta', 'factura_compra', 'presupuesto_venta') then 'emitida'
       when cardinality(h.pasa_a) > 0 then 'facturado'
       else 'pendiente' end as estado,
  h.observaciones
from public.historico_documentos h
left join public.clients c on c.id = h.client_id;

revoke all on public.historico_listado from public, anon;
grant select on public.historico_listado to authenticated;

create or replace function public.resumen_historico()
returns table (
  anio integer,
  tipo text,
  documentos bigint,
  total numeric,
  pendientes bigint,
  total_pendiente numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    extract(year from h.fecha)::integer,
    h.tipo,
    count(*),
    coalesce(sum(h.total), 0),
    count(*) filter (where h.tipo not in ('factura_venta', 'factura_compra', 'presupuesto_venta') and cardinality(h.pasa_a) = 0),
    coalesce(sum(h.total) filter (where h.tipo not in ('factura_venta', 'factura_compra', 'presupuesto_venta') and cardinality(h.pasa_a) = 0), 0)
  from public.historico_documentos h
  where h.user_id = (select auth.uid())
  group by 1, 2
  order by 1 desc nulls last, 2
$$;
