-- ============================================================
-- 060 · FACTURA ELECTRÓNICA ENTRE EMPRESAS (RD 238/2026)
-- ============================================================
--
-- Cada factura electrónica, emitida o recibida, se guarda tal cual
-- (el XML) con su huella SHA-256: la ley obliga a conservarla, y el
-- contenido no se puede cambiar una vez guardado (disparador de abajo).
-- No hay política de borrado: una factura electrónica no se borra.
--
-- `fe_comunicaciones` son los estados que se comunican a la otra parte y
-- a la solución pública de la AEAT: aceptación, rechazo, pago, cobro,
-- impago y anulación, cada uno con su plazo (cuatro días hábiles).
--
-- Mientras el canal sea «simulado» nada sale del programa: se genera, se
-- valida y se guarda igual que se haría de verdad.
--
-- Aplicada en producción en varios pasos (060a…060h) con el mismo
-- contenido: la herramienta de migraciones cortaba las peticiones largas.

alter table public.clients add column if not exists tipo_fiscal text
  check (tipo_fiscal is null or tipo_fiscal in ('empresa', 'autonomo', 'particular', 'administracion'));

alter table public.company_settings add column if not exists factura_electronica jsonb;

create table if not exists public.fe_facturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sentido text not null check (sentido in ('emitida', 'recibida')),
  invoice_id uuid,
  gasto_ids uuid[],
  formato text not null check (formato in ('ubl', 'facturae', 'cii', 'edifact')),
  numero text not null check (char_length(numero) between 1 and 120),
  fecha date not null,
  vencimiento date,
  nif_emisor text not null,
  nombre_emisor text,
  nif_receptor text,
  nombre_receptor text,
  total numeric(14, 2) not null,
  contenido text not null check (char_length(contenido) <= 6000000),
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  canal text not null default 'simulado' check (canal in ('simulado', 'spfe', 'manual')),
  estado text not null check (estado in ('generada', 'enviada', 'error', 'recibida', 'aceptada', 'rechazada', 'pagada', 'impagada', 'anulada')),
  estado_fecha date,
  motivo text,
  codigo text,
  respuesta jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (user_id, sentido, nif_emisor, numero, fecha)
);

create index if not exists fe_facturas_lista on public.fe_facturas (user_id, sentido, creado_en desc);
create unique index if not exists fe_facturas_una_por_factura on public.fe_facturas (invoice_id) where invoice_id is not null;

create table if not exists public.fe_comunicaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fe_factura_id uuid not null references public.fe_facturas(id) on delete cascade,
  tipo text not null check (tipo in ('aceptacion', 'rechazo', 'pago', 'pago_parcial', 'cobro', 'impago', 'anulacion')),
  fecha_hecho date not null,
  importe numeric(14, 2),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  plazo date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviada', 'error')),
  canal text not null default 'simulado' check (canal in ('simulado', 'spfe', 'manual')),
  enviada_en timestamptz,
  respuesta jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists fe_comunicaciones_factura on public.fe_comunicaciones (fe_factura_id, creado_en);
create index if not exists fe_comunicaciones_pendientes on public.fe_comunicaciones (user_id, estado) where estado <> 'enviada';

-- Lo conservado no cambia: ni el fichero, ni su huella, ni a quién pertenece.
create or replace function public.fe_facturas_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.contenido is distinct from old.contenido or new.huella is distinct from old.huella
     or new.user_id is distinct from old.user_id or new.sentido is distinct from old.sentido
     or new.numero is distinct from old.numero or new.nif_emisor is distinct from old.nif_emisor then
    raise exception using message = 'La factura electronica guardada no se puede modificar', errcode = 'P0001';
  end if;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists fe_facturas_inmutable on public.fe_facturas;
create trigger fe_facturas_inmutable before update on public.fe_facturas
  for each row execute function public.fe_facturas_inmutable();

revoke execute on function public.fe_facturas_inmutable() from public, anon, authenticated;

alter table public.fe_facturas enable row level security;
alter table public.fe_comunicaciones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fe_facturas' and policyname = 'fe_facturas_leer') then
    create policy fe_facturas_leer on public.fe_facturas for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fe_facturas' and policyname = 'fe_facturas_crear') then
    create policy fe_facturas_crear on public.fe_facturas for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fe_facturas' and policyname = 'fe_facturas_estado') then
    create policy fe_facturas_estado on public.fe_facturas for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fe_comunicaciones' and policyname = 'fe_comunicaciones_leer') then
    create policy fe_comunicaciones_leer on public.fe_comunicaciones for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fe_comunicaciones' and policyname = 'fe_comunicaciones_crear') then
    create policy fe_comunicaciones_crear on public.fe_comunicaciones for insert to authenticated
      with check ((select auth.uid()) = user_id
        and exists (select 1 from public.fe_facturas f where f.id = fe_factura_id and f.user_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'fe_comunicaciones' and policyname = 'fe_comunicaciones_estado') then
    create policy fe_comunicaciones_estado on public.fe_comunicaciones for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- El buzón de facturas de proveedores admite también facturas electrónicas (XML).
alter table public.buzon_documentos drop constraint if exists buzon_documentos_mime_check;
alter table public.buzon_documentos add constraint buzon_documentos_mime_check
  check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/plain'));
