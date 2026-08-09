-- ============================================================
-- Migración 007: serie de numeración separada para el TPV
-- ============================================================
-- Los tickets de mostrador (factura simplificada, sin NIF del
-- comprador) llevan su propia serie — práctica habitual en España
-- para distinguirlos de las facturas completas. Mismo mecanismo que
-- invoice_series/next_invoice_number, solo que para el TPV.

ALTER TABLE company_settings
  ADD COLUMN tpv_series TEXT NOT NULL DEFAULT 'TPV',
  ADD COLUMN next_tpv_number INTEGER NOT NULL DEFAULT 1;
