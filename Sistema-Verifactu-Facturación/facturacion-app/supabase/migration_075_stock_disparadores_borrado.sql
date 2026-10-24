-- ============================================================
-- 075 - Disparadores de líneas (074) al borrar
--
-- Cada tabla de transición solo existe en su operación: «nuevas» en
-- INSERT y UPDATE, «viejas» en UPDATE y DELETE. La versión de la 074
-- leía «nuevas» también al borrar líneas y fallaba. Cada rama lee ahora
-- solo la suya.
-- ============================================================

create or replace function public.tr_stock_lineas_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_id in select distinct invoice_id from nuevas loop
      perform public.fn_sincronizar_stock('documento', v_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_id in select invoice_id from nuevas union select invoice_id from viejas loop
      perform public.fn_sincronizar_stock('documento', v_id);
    end loop;
  else
    for v_id in select distinct invoice_id from viejas loop
      perform public.fn_sincronizar_stock('documento', v_id);
    end loop;
  end if;
  return null;
end;
$$;

create or replace function public.tr_stock_lineas_albaran()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_id in select distinct albaran_id from nuevas loop
      perform public.fn_sincronizar_stock('albaran', v_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_id in select albaran_id from nuevas union select albaran_id from viejas loop
      perform public.fn_sincronizar_stock('albaran', v_id);
    end loop;
  else
    for v_id in select distinct albaran_id from viejas loop
      perform public.fn_sincronizar_stock('albaran', v_id);
    end loop;
  end if;
  return null;
end;
$$;
