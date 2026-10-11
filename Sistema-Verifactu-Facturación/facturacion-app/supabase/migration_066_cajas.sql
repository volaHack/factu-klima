-- =============================================================================
-- 066 — Cajas completas (CAJ.) en las líneas de factura y de albarán
-- =============================================================================
-- En distribución cada línea lleva CAJ. (cajas completas), U/C (unidades
-- por caja, ya existía como units_per_package) y UDES. (quantity). Ver
-- src/lib/cajas.ts.
--
-- NULL = línea de antes, en la que quantity eran las cajas y el precio era
-- por caja: se siguen leyendo igual. Un número (aunque sea 0) = la línea va
-- por unidades.

alter table public.invoice_line_items add column if not exists cajas numeric;
alter table public.albaran_line_items add column if not exists cajas numeric;
