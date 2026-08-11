-- ============================================================
-- MIGRACIÓN 013: Porcentajes de IVA/IGIC configurables
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
--
-- QUÉ HACE Y POR QUÉ
-- ------------------
-- Antes, los tipos de IVA e IGIC eran una lista fija en el código
-- (IVA 21/10/4/0 y IGIC 7/3/13/0). Cada vez que un negocio necesitaba
-- otro porcentaje había que pedirle al informático que tocase el código.
--
-- Esta migración añade dos columnas a company_settings para que la
-- empresa configure sus propios porcentajes desde la pantalla de Ajustes:
--   iva_rates  INTEGER[]  → tipos de IVA disponibles
--   igic_rates INTEGER[]  → tipos de IGIC disponibles (Canarias)
--
-- Las filas existentes se rellenan con los valores por defecto, así que
-- la actualización no cambia el comportamiento de ningún usuario.
--
-- RLS y permisos: las columnas heredan los de la tabla (authenticated ya
-- tiene SELECT/UPDATE sobre company_settings), no hace falta nada más.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS iva_rates INTEGER[] NOT NULL DEFAULT ARRAY[21, 10, 4, 0]::integer[],
  ADD COLUMN IF NOT EXISTS igic_rates INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 13, 0]::integer[];

COMMENT ON COLUMN company_settings.iva_rates IS
  'Porcentajes de IVA que la empresa puede elegir al facturar. Por defecto 21, 10, 4, 0.';

COMMENT ON COLUMN company_settings.igic_rates IS
  'Porcentajes de IGIC que la empresa puede elegir al facturar (Canarias). Por defecto 7, 3, 13, 0.';
