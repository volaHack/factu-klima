-- ============================================================
-- 074 - El stock lo mueven las líneas de los documentos
--
-- Hasta ahora el stock solo cambiaba al pulsar «Expedir» en un albarán o
-- al cobrar en el TPV, y lo cambiaba el navegador: una factura directa
-- (sin albarán) no descontaba nada, una factura de compra no sumaba,
-- anular un albarán no devolvía la mercancía y editar sus líneas después
-- no corregía nada.
--
-- Ahora lo lleva la base de datos, con un apunte por cada cambio:
--
--   · movimientos_stock: lo que cada documento ha movido de cada producto
--     (y almacén). Es el libro: el stock de un documento es la suma de sus
--     apuntes.
--   · fn_sincronizar_stock(origen, id): calcula lo que el documento DEBE
--     haber movido según su estado y sus líneas, lo compara con lo que ya
--     movió y apunta solo la diferencia. Da igual cuántas veces se llame:
--     guardar dos veces no descuenta dos veces; editar una línea de 5 a 3
--     devuelve 2; anular devuelve todo; borrar un borrador, también.
--   · Disparadores en invoices / invoice_line_items y en albaranes /
--     albaran_line_items la llaman al guardar.
--
-- Qué mueve stock:
--   · Albarán de venta (resta) o de compra (suma) en cuanto deja de ser
--     borrador (expedido / facturado / recibido).
--   · Factura de venta (resta) o de compra (suma) emitida que NO viene de
--     un albarán: la mercancía de la que viene de un albarán ya la movió
--     el albarán. Incluye los tickets del TPV.
--   · No mueven: presupuestos, pedidos (son lo pendiente de recibir y de
--     entregar), rectificativas (las devoluciones reponen aparte), y nada
--     en borrador, pre-aprobación, rechazado o anulado.
--
-- El stock puede quedar en negativo: se vende lo que aún no ha entrado y
-- queda como pendiente.
--
-- Las compras recalculan el precio medio (PMP) y el de la última entrada.
--
-- Los documentos que ya existían se apuntan como ya aplicados, sin tocar
-- el stock de hoy: el número que hay ahora en cada ficha se respeta.
-- ============================================================

create table if not exists public.movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  almacen_id uuid,
  origen text not null check (origen in ('documento', 'albaran')),
  documento_id uuid not null,
  cantidad numeric not null,
  precio numeric,
  inicial boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_stock_documento_idx on public.movimientos_stock (origen, documento_id);
create index if not exists movimientos_stock_producto_idx on public.movimientos_stock (product_id, created_at desc);

alter table public.movimientos_stock enable row level security;

drop policy if exists movimientos_stock_select on public.movimientos_stock;
create policy movimientos_stock_select on public.movimientos_stock
  for select to authenticated using (user_id = (select auth.uid()));

-- Nadie escribe a mano: solo fn_sincronizar_stock.
revoke all on public.movimientos_stock from public, anon;
grant select on public.movimientos_stock to authenticated;

comment on table public.movimientos_stock is 'Lo que cada documento ha movido del stock de cada producto. Lo escribe fn_sincronizar_stock';

-- ------------------------------------------------------------
-- Suma o resta al stock de un producto (total y por almacén).
-- ------------------------------------------------------------
create or replace function public.fn_sumar_stock(p_product_id uuid, p_almacen_id uuid, p_delta numeric)
returns numeric
language sql
security definer
set search_path = ''
as $$
  update public.products
  set stock_quantity = coalesce(stock_quantity, 0) + p_delta,
      stocks_by_almacen = case
        when p_almacen_id is null then coalesce(stocks_by_almacen, '{}'::jsonb)
        else jsonb_set(
          coalesce(stocks_by_almacen, '{}'::jsonb),
          array[p_almacen_id::text],
          to_jsonb(coalesce((stocks_by_almacen ->> p_almacen_id::text)::numeric, 0) + p_delta)
        )
      end,
      updated_at = now()
  where id = p_product_id
  returning stock_quantity
$$;

revoke all on function public.fn_sumar_stock(uuid, uuid, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Lo que un documento debe haber movido, por producto.
-- signo: -1 venta, +1 compra, 0 no mueve.
-- ------------------------------------------------------------
create or replace function public.fn_stock_signo_documento(p_id uuid)
returns table (user_id uuid, almacen_id uuid, signo integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.user_id,
    i.almacen_id,
    case
      when i.status in ('borrador', 'pre_aprobacion', 'rechazado', 'anulada') then 0
      when i.tipo = 'albaran' then case when i.sentido = 'compra' then 1 else -1 end
      when i.tipo = 'factura'
        and not exists (select 1 from public.invoices o where o.id = i.documento_origen_id and o.tipo = 'albaran')
        and not exists (select 1 from public.albaranes a where a.invoice_id = i.id)
        then case when i.sentido = 'compra' then 1 else -1 end
      else 0
    end
  from public.invoices i
  where i.id = p_id
$$;

revoke all on function public.fn_stock_signo_documento(uuid) from public, anon, authenticated;

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
    full join hecho h on h.product_id = d.product_id and h.almacen_id is not distinct from d.almacen_id
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

-- Solo la llaman los disparadores y sincronizar_stock_documento.
revoke all on function public.fn_sincronizar_stock(text, uuid) from public, anon, authenticated;

-- Quien llame a mano solo puede sincronizar lo suyo.
create or replace function public.sincronizar_stock_documento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.invoices where id = p_id and user_id = (select auth.uid())) then
    perform public.fn_sincronizar_stock('documento', p_id);
  end if;
end;
$$;

revoke all on function public.sincronizar_stock_documento(uuid) from public, anon;
grant execute on function public.sincronizar_stock_documento(uuid) to authenticated;

-- ------------------------------------------------------------
-- Disparadores
-- ------------------------------------------------------------
create or replace function public.tr_stock_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_sincronizar_stock('documento', old.id);
  else
    perform public.fn_sincronizar_stock('documento', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists tr_invoices_stock on public.invoices;
create trigger tr_invoices_stock
  after insert or delete or update of status, tipo, sentido, documento_origen_id, almacen_id on public.invoices
  for each row execute function public.tr_stock_documento();

create or replace function public.tr_stock_lineas_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Una vez por documento tocado, no una por línea.
  if tg_op in ('INSERT', 'UPDATE') then
    for v_id in select distinct invoice_id from nuevas loop
      perform public.fn_sincronizar_stock('documento', v_id);
    end loop;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    for v_id in select distinct invoice_id from viejas where tg_op = 'DELETE' or invoice_id not in (select invoice_id from nuevas) loop
      perform public.fn_sincronizar_stock('documento', v_id);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_lineas_stock_ins on public.invoice_line_items;
drop trigger if exists tr_lineas_stock_upd on public.invoice_line_items;
drop trigger if exists tr_lineas_stock_del on public.invoice_line_items;
create trigger tr_lineas_stock_ins after insert on public.invoice_line_items
  referencing new table as nuevas for each statement execute function public.tr_stock_lineas_documento();
create trigger tr_lineas_stock_upd after update on public.invoice_line_items
  referencing old table as viejas new table as nuevas for each statement execute function public.tr_stock_lineas_documento();
create trigger tr_lineas_stock_del after delete on public.invoice_line_items
  referencing old table as viejas for each statement execute function public.tr_stock_lineas_documento();

create or replace function public.tr_stock_albaran()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_sincronizar_stock('albaran', old.id);
    if old.invoice_id is not null then perform public.fn_sincronizar_stock('documento', old.invoice_id); end if;
  else
    perform public.fn_sincronizar_stock('albaran', new.id);
    -- La factura a la que pasa ya no mueve esa mercancía (la movió el albarán).
    if new.invoice_id is not null then perform public.fn_sincronizar_stock('documento', new.invoice_id); end if;
    if tg_op = 'UPDATE' and old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
      perform public.fn_sincronizar_stock('documento', old.invoice_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_albaranes_stock on public.albaranes;
create trigger tr_albaranes_stock
  after insert or delete or update of status, invoice_id on public.albaranes
  for each row execute function public.tr_stock_albaran();

create or replace function public.tr_stock_lineas_albaran()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    for v_id in select distinct albaran_id from nuevas loop
      perform public.fn_sincronizar_stock('albaran', v_id);
    end loop;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    for v_id in select distinct albaran_id from viejas where tg_op = 'DELETE' or albaran_id not in (select albaran_id from nuevas) loop
      perform public.fn_sincronizar_stock('albaran', v_id);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_lineas_albaran_stock_ins on public.albaran_line_items;
drop trigger if exists tr_lineas_albaran_stock_upd on public.albaran_line_items;
drop trigger if exists tr_lineas_albaran_stock_del on public.albaran_line_items;
create trigger tr_lineas_albaran_stock_ins after insert on public.albaran_line_items
  referencing new table as nuevas for each statement execute function public.tr_stock_lineas_albaran();
create trigger tr_lineas_albaran_stock_upd after update on public.albaran_line_items
  referencing old table as viejas new table as nuevas for each statement execute function public.tr_stock_lineas_albaran();
create trigger tr_lineas_albaran_stock_del after delete on public.albaran_line_items
  referencing old table as viejas for each statement execute function public.tr_stock_lineas_albaran();

-- ------------------------------------------------------------
-- Ajuste manual (TPV sin documento, fabricación, devoluciones,
-- inventario): ahora también por almacén.
-- ------------------------------------------------------------
create or replace function public.fn_ajustar_stock(p_product_id uuid, p_delta numeric, p_almacen_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v numeric;
begin
  if not exists (select 1 from public.products where id = p_product_id and user_id = (select auth.uid())) then
    raise exception 'Producto no encontrado o no pertenece al usuario actual';
  end if;
  v := public.fn_sumar_stock(p_product_id, p_almacen_id, p_delta);
  return v;
end;
$$;

revoke all on function public.fn_ajustar_stock(uuid, numeric, uuid) from public, anon;
grant execute on function public.fn_ajustar_stock(uuid, numeric, uuid) to authenticated;

-- ------------------------------------------------------------
-- Lo que ya había: apuntado como aplicado, sin tocar el stock de hoy.
-- ------------------------------------------------------------
insert into public.movimientos_stock (user_id, product_id, almacen_id, origen, documento_id, cantidad, inicial)
select p.user_id, l.product_id, i.almacen_id, 'documento', i.id, s.signo * sum(l.quantity), true
from public.invoices i
cross join lateral public.fn_stock_signo_documento(i.id) s
join public.invoice_line_items l on l.invoice_id = i.id
join public.products p on p.id = l.product_id and p.user_id = i.user_id
where s.signo <> 0
  and not exists (select 1 from public.movimientos_stock m where m.origen = 'documento' and m.documento_id = i.id)
group by p.user_id, l.product_id, i.almacen_id, i.id, s.signo
having sum(l.quantity) <> 0;

insert into public.movimientos_stock (user_id, product_id, almacen_id, origen, documento_id, cantidad, inicial)
select p.user_id, l.product_id, null, 'albaran', a.id, -sum(l.quantity), true
from public.albaranes a
join public.albaran_line_items l on l.albaran_id = a.id
join public.products p on p.id = l.product_id and p.user_id = a.user_id
where a.status in ('expedido', 'facturado')
  and not exists (select 1 from public.movimientos_stock m where m.origen = 'albaran' and m.documento_id = a.id)
group by p.user_id, l.product_id, a.id
having sum(l.quantity) <> 0;
