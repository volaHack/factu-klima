-- ============================================================
-- 051 · RECORDATORIOS DE COBRO: A QUIÉN SE LE HA RECORDADO Y CUÁNDO
-- ============================================================
--
-- Cada recordatorio enviado (por correo desde el programa, o anotado a
-- mano tras mandarlo por WhatsApp o desde el correo propio) queda aquí.
-- Sirve para no recordar dos veces lo mismo el mismo día y para que el
-- envío automático diario sepa cuándo toca el siguiente.
--
-- Sin esta tabla la pantalla funciona igual y anota en el navegador; el
-- envío automático sí la necesita.

create table if not exists public.recordatorios_cobro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid,
  cliente_nombre text not null,
  -- Las facturas que incluía el recordatorio.
  factura_ids uuid[] not null default '{}',
  canal text not null check (canal in ('email', 'whatsapp', 'manual', 'automatico')),
  destinatario text,
  asunto text,
  importe numeric(12, 2),
  enviado_en timestamptz not null default now()
);

create index if not exists recordatorios_cobro_cuenta_fecha on public.recordatorios_cobro (user_id, enviado_en desc);
create index if not exists recordatorios_cobro_cliente on public.recordatorios_cobro (user_id, cliente_id, enviado_en desc);

alter table public.recordatorios_cobro enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'recordatorios_cobro' and policyname = 'recordatorios_cobro_propios') then
    create policy recordatorios_cobro_propios on public.recordatorios_cobro
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
