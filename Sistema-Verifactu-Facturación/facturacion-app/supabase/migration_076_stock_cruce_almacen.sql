-- ============================================================
-- 076 - fn_sincronizar_stock (074): cruce por almacén
--
-- PostgreSQL solo admite igualdades en un FULL JOIN, y la 074 cruzaba el
-- almacén con IS NOT DISTINCT FROM: fallaba al guardar cualquier
-- documento con líneas. «Sin almacén» se cruza ahora como un id fijo.
-- ============================================================

create or replace function public.fn_sincronizar_stock(p_origen text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_almacen uuid;
  v_signo integer := 0;
  r record;
  v_stock numeric;
  v_pmp numeric;
  -- Un FULL JOIN solo admite igualdades: «sin almacén» se cruza como este id.
  v_sin constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_id is null then return; end if;

  if p_origen = 'documento' then
    select s.user_id, s.almacen_id, s.signo into v_user, v_almacen, v_signo
    from public.fn_stock_signo_documento(p_id) s;
  elsif p_origen = 'albaran' then
    -- Los albaranes de la pantalla antigua: siempre de venta, sin almacén.
    select a.user_id, null::uuid, case when a.status in ('expedido', 'facturado') then -1 else 0 end
      into v_user, v_almacen, v_signo
    from public.albaranes a where a.id = p_id;
  else
    raise exception 'Origen de stock desconocido: %', p_origen;
  end if;

  v_signo := coalesce(v_signo, 0);

  for r in
    with deseado as (
      select l.product_id, v_almacen as almacen_id,
             v_signo * sum(l.quantity) as cantidad,
             case when sum(l.quantity) <> 0 then
               sum(l.quantity * l.unit_price
                   * (1 - coalesce(l.discount_percent, 0) / 100)
                   * (1 - coalesce(l.discount_percent_2, 0) / 100)
                   * (1 - coalesce(l.discount_percent_3, 0) / 100)) / sum(l.quantity)
             end as precio
      from public.invoice_line_items l
      join public.products p on p.id = l.product_id and p.user_id = v_user
      where p_origen = 'documento' and l.invoice_id = p_id and v_signo <> 0
      group by l.product_id
      union all
      select l.product_id, null::uuid, v_signo * sum(l.quantity), null::numeric
      from public.albaran_line_items l
      join public.products p on p.id = l.product_id and p.user_id = v_user
      where p_origen = 'albaran' and l.albaran_id = p_id and v_signo <> 0
      group by l.product_id
    ),
    hecho as (
      select m.product_id, m.almacen_id, sum(m.cantidad) as cantidad
      from public.movimientos_stock m
      where m.origen = p_origen and m.documento_id = p_id
      group by m.product_id, m.almacen_id
    )
    select coalesce(d.product_id, h.product_id) as product_id,
           coalesce(d.almacen_id, h.almacen_id) as almacen_id,
           coalesce(d.cantidad, 0) - coalesce(h.cantidad, 0) as diferencia,
           d.precio
    from deseado d
    full join hecho h
      on h.product_id = d.product_id
     and coalesce(h.almacen_id, v_sin) = coalesce(d.almacen_id, v_sin)
  loop
    continue when r.diferencia = 0;
    -- El producto ya no existe: no hay stock que mover.
    continue when not exists (select 1 from public.products where id = r.product_id);

    -- Una entrada de compra recalcula el precio medio y el de la última entrada.
    if v_signo = 1 and r.diferencia > 0 and r.precio is not null and r.precio > 0 then
      select greatest(coalesce(stock_quantity, 0), 0), nullif(coste_pmp, 0) into v_stock, v_pmp
      from public.products where id = r.product_id;
      update public.products
      set coste_pmp = round(((v_stock * coalesce(v_pmp, r.precio)) + (r.diferencia * r.precio)) / (v_stock + r.diferencia), 4),
          coste_ultima_compra = round(r.precio, 4)
      where id = r.product_id;
    end if;

    perform public.fn_sumar_stock(r.product_id, r.almacen_id, r.diferencia);

    insert into public.movimientos_stock (user_id, product_id, almacen_id, origen, documento_id, cantidad, precio)
    select p.user_id, r.product_id, r.almacen_id, p_origen, p_id, r.diferencia, r.precio
    from public.products p where p.id = r.product_id;
  end loop;
end;
$$;

revoke all on function public.fn_sincronizar_stock(text, uuid) from public, anon, authenticated;
