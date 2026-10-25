-- ============================================================
-- 073 - Los mejores clientes y proveedores del programa anterior
--
-- La gráfica «Top clientes» de Clientes y proveedores solo sumaba las
-- facturas de Klima. Con el historial de ISECAN (diecisiete mil
-- documentos) no se pueden bajar todos para sumarlos en el teléfono: la
-- suma por ficha la hace la base de datos y llegan solo los primeros.
--
--   · p_tipo: factura_venta, albaran_venta, pedido_venta,
--     presupuesto_venta, factura_compra o albaran_compra.
--   · Los documentos sin ficha de aquí se agrupan por el código que
--     tenían en el otro programa.
--
-- security invoker: lee con las políticas de historico_documentos y de
-- clients, lo de quien pregunta.
-- ============================================================

create or replace function public.top_historico(p_tipo text, p_limite integer default 6)
returns table (
  client_id uuid,
  codigo_tercero text,
  nombre text,
  documentos bigint,
  total numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    h.client_id,
    case when h.client_id is null then h.codigo_tercero end,
    coalesce(nullif(c.trade_name, ''), c.business_name),
    count(*),
    coalesce(sum(h.total), 0)
  from public.historico_documentos h
  left join public.clients c on c.id = h.client_id
  where h.user_id = (select auth.uid())
    and h.tipo = p_tipo
  group by h.client_id, case when h.client_id is null then h.codigo_tercero end, c.trade_name, c.business_name
  order by 5 desc
  limit greatest(1, least(coalesce(p_limite, 6), 50))
$$;

revoke all on function public.top_historico(text, integer) from public, anon;
grant execute on function public.top_historico(text, integer) to authenticated;
