-- ============================================================
-- 048 · LOS INGRESOS DE LA PLATAFORMA, APUNTADOS SIEMPRE
-- ============================================================
--
-- Cuando Stripe cobraba una suscripción o una propina, la plataforma
-- emitía al momento una factura sellada a nombre de la administradora.
-- Eso da por hecho que quien cobra ya está dada de alta en Hacienda, y
-- mientras no lo esté no debe emitir facturas a su nombre. Y si la
-- factura no se podía emitir (cliente sin NIF, fuera de zona…), el
-- ingreso no quedaba apuntado en ningún sitio más que en Stripe.
--
-- Ahora:
--  · `cobros_abiertos`: mientras sea falso, no se puede contratar ni
--    dejar propinas (la web lo oculta y la API lo rechaza).
--  · `actividad_desde`: la fecha de alta. Sin ella, nada se factura.
--  · `ingresos_plataforma`: cada cobro queda apuntado, con su base y su
--    impuesto, se facture o no. Es el libro que se le da a la gestoría.

alter table public.plataforma_config
  add column if not exists cobros_abiertos boolean not null default false,
  add column if not exists actividad_desde date;

create table if not exists public.ingresos_plataforma (
  id uuid primary key default gen_random_uuid(),
  -- La referencia de Stripe (factura, sesión o abono): un cobro, una fila.
  stripe_ref text not null unique,
  tipo text not null check (tipo in ('suscripcion', 'propina', 'devolucion')),
  fecha date not null,
  importe numeric(12, 2) not null,
  base numeric(12, 2) not null,
  cuota numeric(12, 2) not null default 0,
  tipo_impositivo numeric(5, 2) not null default 0,
  cliente_nombre text,
  cliente_nif text,
  cliente_user_id uuid,
  concepto text not null,
  -- facturado: tiene su factura · pendiente_alta: cobrado antes del alta,
  -- sin factura · revisar: no se ha podido facturar solo (motivo en nota).
  estado text not null check (estado in ('facturado', 'pendiente_alta', 'revisar')),
  invoice_id uuid references public.invoices(id),
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists ingresos_plataforma_fecha on public.ingresos_plataforma (fecha desc);

-- Sólo el servidor (clave de servicio) lo lee y lo escribe: es la
-- contabilidad de la plataforma, no de ningún inquilino.
alter table public.ingresos_plataforma enable row level security;
revoke all on public.ingresos_plataforma from anon, authenticated;

-- (049) La factura que le corresponde a cada cobro, guardada ya preparada:
-- lo cobrado antes del alta se puede facturar después con un botón, sin
-- reconstruir a mano los datos del cliente.
alter table public.ingresos_plataforma add column if not exists factura_propuesta jsonb;
