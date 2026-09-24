-- ============================================================
-- 052 · APUNTES CONTABLES A MANO Y PERIÓDICOS
-- ============================================================
--
-- Lo que la contabilidad no saca de las facturas: nóminas, amortizaciones,
-- préstamos y asientos sueltos. Un apunte periódico se guarda UNA vez con
-- su calendario; los asientos de cada mes los genera el programa.
--
-- Sin esta tabla, el programa los guarda en los metadatos de la cuenta,
-- con un tope pequeño; al aplicarla, se pasan aquí solos.
--
-- La gestoría de la empresa (migración 045) puede leerlos, igual que lee
-- sus facturas y sus gastos, para ver la misma contabilidad.

create table if not exists public.apuntes_contables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concepto text not null check (char_length(trim(concepto)) between 1 and 200),
  plantilla text not null default 'libre' check (plantilla in ('libre', 'nomina', 'amortizacion', 'prestamo')),
  periodicidad text not null default 'unico' check (periodicidad in ('unico', 'mes', 'trimestre', 'anio')),
  fecha date not null,
  hasta date,
  -- [{ cuenta: '64000000', debe: 1500, haber: 0 }, …]
  lineas jsonb not null default '[]'::jsonb,
  -- { principal, interesAnual, meses, conIngreso } para los préstamos.
  prestamo jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists apuntes_contables_cuenta on public.apuntes_contables (user_id, fecha);

alter table public.apuntes_contables enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'apuntes_contables' and policyname = 'apuntes_contables_propios') then
    create policy apuntes_contables_propios on public.apuntes_contables
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if exists (select 1 from pg_proc where proname = 'es_gestoria_de')
     and not exists (select 1 from pg_policies where tablename = 'apuntes_contables' and policyname = 'gestoria_lee_apuntes') then
    create policy gestoria_lee_apuntes on public.apuntes_contables
      for select to authenticated using (public.es_gestoria_de(user_id));
  end if;
end $$;
