-- ============================================================
-- 061 · DETECCIÓN DE ATAQUES
-- ============================================================
--
-- `eventos_seguridad`: lo raro que ve el servidor. Sondeos de escáneres
-- (/.env, /wp-admin…), intentos de inyección en la dirección, accesos al
-- panel de administración de quien no lo es, firmas de webhook falsas,
-- secretos y enlaces inválidos, límites de peticiones superados.
--
-- `ips_bloqueadas`: direcciones a las que el servidor contesta 403 sin
-- pasar de la entrada. Se bloquean a mano desde el panel o solas cuando
-- una IP acumula ataques claros en poco tiempo (24 h).
--
-- Las dos tablas sólo las lee y escribe el servidor (RLS sin políticas):
-- ninguna cuenta, ni siquiera la del administrador desde el navegador,
-- puede leerlas o borrarlas por la API.

create table if not exists public.eventos_seguridad (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  tipo text not null check (char_length(tipo) <= 60),
  gravedad text not null check (gravedad in ('baja', 'media', 'alta')),
  ip text check (char_length(ip) <= 64),
  user_id uuid,
  ruta text check (char_length(ruta) <= 500),
  detalle jsonb,
  navegador text check (char_length(navegador) <= 300)
);

create index if not exists eventos_seguridad_recientes on public.eventos_seguridad (creado_en desc);
create index if not exists eventos_seguridad_ip on public.eventos_seguridad (ip, creado_en desc);

create table if not exists public.ips_bloqueadas (
  ip text primary key check (char_length(ip) between 3 and 64),
  motivo text not null check (char_length(motivo) <= 300),
  automatico boolean not null default false,
  creado_en timestamptz not null default now(),
  hasta timestamptz
);

alter table public.eventos_seguridad enable row level security;
alter table public.ips_bloqueadas enable row level security;
revoke all on public.eventos_seguridad from anon, authenticated;
revoke all on public.ips_bloqueadas from anon, authenticated;
