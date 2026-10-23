-- ============================================================
-- 069 - Resumen del historial del programa anterior
--
-- La pantalla «Historial» (068 guarda los documentos) enseña lo facturado
-- y lo comprado por año y lo que quedó sin facturar o sin servir. Con
-- diecisiete mil documentos no se pueden bajar todos al teléfono para
-- sumarlos: la suma la hace la base de datos y llegan unas pocas filas.
--
-- security invoker: corre con los permisos de quien la llama, así que las
-- políticas de historico_documentos (la empresa ve lo suyo, segundo
-- factor) siguen mandando. Además se ciñe a la propia cuenta: una gestoría
-- no ve aquí mezclado lo de todas las empresas que lleva.
-- ============================================================

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
    count(*) filter (where h.tipo not in ('factura_venta', 'factura_compra') and cardinality(h.pasa_a) = 0),
    coalesce(sum(h.total) filter (where h.tipo not in ('factura_venta', 'factura_compra') and cardinality(h.pasa_a) = 0), 0)
  from public.historico_documentos h
  where h.user_id = (select auth.uid())
  group by 1, 2
  order by 1 desc nulls last, 2
$$;

comment on function public.resumen_historico() is 'Documentos y totales del historial del programa anterior por año y tipo, de la cuenta que llama';

revoke all on function public.resumen_historico() from public, anon;
grant execute on function public.resumen_historico() to authenticated;
