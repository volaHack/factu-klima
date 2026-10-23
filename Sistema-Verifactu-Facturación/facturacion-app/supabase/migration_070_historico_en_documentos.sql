-- ============================================================
-- 070 - El historial del programa anterior en «Documentos»
--
-- Quien llega de ISECAN busca sus facturas y albaranes de antes donde
-- están los de ahora, en Documentos, no en una pantalla aparte. Pero son
-- diecisiete mil: no se pueden bajar todos al teléfono para filtrarlos y
-- ordenarlos allí como se hace con los de Klima.
--
-- Esta vista deja cada documento con las columnas de la lista de
-- Documentos (tipo y sentido por separado, el número como se conocía, el
-- nombre de la ficha, un estado) para que el filtro, el buscador y el
-- orden los haga la base de datos y lleguen de cincuenta en cincuenta.
--
--   · numero: «T24/100269» en los pedidos y «25/25» en los albaranes, como
--     en el programa de antes; las facturas ya llevan el año dentro
--     (24000001). Ver numeroVisible en lib/historico.
--   · cliente: el nombre comercial de la ficha o, sin él, la razón social.
--   · estado: emitida (facturas), facturado (el albarán o pedido pasó a
--     otro documento) o pendiente (no pasó a ninguno).
--
-- security_invoker: la leen las políticas de historico_documentos y de
-- clients con los permisos de quien pregunta (lo suyo, segundo factor).
-- ============================================================

create or replace view public.historico_listado
with (security_invoker = true) as
select
  h.id,
  h.user_id,
  h.origen,
  h.tipo as tipo_historico,
  case when h.tipo like 'factura%' then 'factura' when h.tipo like 'albaran%' then 'albaran' else 'pedido' end as tipo,
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
  case when h.tipo in ('factura_venta', 'factura_compra') then 'emitida'
       when cardinality(h.pasa_a) > 0 then 'facturado'
       else 'pendiente' end as estado,
  h.observaciones
from public.historico_documentos h
left join public.clients c on c.id = h.client_id;

comment on view public.historico_listado is 'Historial del programa anterior con las columnas de la lista de Documentos. Solo consulta';

revoke all on public.historico_listado from public, anon;
grant select on public.historico_listado to authenticated;
