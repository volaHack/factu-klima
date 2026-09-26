-- ============================================================
-- 058 · CÓDIGOS DIR3 DE LOS CLIENTES QUE SON ADMINISTRACIONES
-- ============================================================
--
-- Para facturar a una Administración Pública por FACe, la Facturae tiene
-- que llevar sus tres unidades DIR3: oficina contable, órgano gestor y
-- unidad tramitadora. Se guardan en la ficha del cliente.
-- { "oficinaContable": "...", "organoGestor": "...", "unidadTramitadora": "..." }

alter table public.clients add column if not exists dir3 jsonb;
