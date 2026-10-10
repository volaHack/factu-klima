-- ============================================================
-- 062 · MOVIMIENTOS DEL BANCO CONECTADO, GUARDADOS
-- ============================================================
--
-- Hasta ahora los movimientos se traían del banco al pulsar un botón y
-- vivían en el navegador (localStorage): otro dispositivo no los veía, y
-- lo ignorado se perdía al cambiar de ordenador. Ahora se guardan aquí,
-- llegan solos cada día (cron) y la conciliación los lee de esta tabla.
--
-- `id` es el de `movimientosDesdeBanco` (huella del IBAN y la referencia
-- del banco): estable entre lecturas y entre sesiones, así que volver a
-- leer o renovar el permiso no duplica nada.
--
-- Sólo el servidor (service role) lee y escribe: RLS sin políticas.

create table if not exists public.banco_movimientos (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 3 and 64),
  conexion_id uuid references public.bancos_conectados(id) on delete set null,
  cuenta_uid text not null,
  iban text,
  fecha date not null,
  importe numeric(14,2) not null,
  concepto text not null default '' check (char_length(concepto) <= 500),
  referencia text check (char_length(referencia) <= 200),
  saldo numeric(16,2),
  ignorado boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists banco_movimientos_fecha on public.banco_movimientos (user_id, fecha desc);
alter table public.banco_movimientos enable row level security;
revoke all on public.banco_movimientos from anon, authenticated;

alter table public.bancos_conectados add column if not exists estado text not null default 'activa';
alter table public.bancos_conectados add column if not exists saldos jsonb not null default '{}'::jsonb;
alter table public.bancos_conectados add column if not exists ultimo_error text;
