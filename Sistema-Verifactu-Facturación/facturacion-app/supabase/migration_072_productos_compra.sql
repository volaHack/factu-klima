-- ============================================================
-- 072 - Lo de comprar en la ficha del producto
--
-- La ficha solo tenía lo de vender (precio e impuesto de venta). Para
-- comprar hacía falta:
--
--   · purchase_price: el precio al que se compra al proveedor, el que se
--     propone en las líneas de un pedido, albarán o factura de compra.
--     El coste medio (coste_pmp) y el de la última entrada
--     (coste_ultima_compra) ya estaban y los calculan las compras.
--   · purchase_tax_rate: el impuesto de compra, por si no es el mismo que
--     el de venta. Vacío = el de venta.
--   · notes: observaciones internas de la ficha.
-- ============================================================

alter table public.products
  add column if not exists purchase_price numeric not null default 0,
  add column if not exists purchase_tax_rate numeric,
  add column if not exists notes text;

comment on column public.products.purchase_price is 'Precio de compra al proveedor; el que se propone en las líneas de compra';
comment on column public.products.purchase_tax_rate is 'Impuesto de compra (%). Vacío = el mismo que el de venta';
comment on column public.products.notes is 'Observaciones internas de la ficha';
