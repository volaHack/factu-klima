-- Renumerada de 012 a 023: ya existía un migration_012_albaranes_devoluciones_abonos.sql
-- con contenido distinto. Ésta va última porque toca vendedores, que se
-- crea en la 018 (ver más abajo).

-- Migraciones pendientes acumuladas: unidades por bulto, almacén del
-- vendedor, y módulos/panel de la empresa. Ninguna se ha aplicado todavía.

-- --- Unidades por bulto ---
-- Doce cajas de veinticuatro son doce en la factura y 288 en el almacén.
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_package NUMERIC DEFAULT NULL;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS units_per_package NUMERIC DEFAULT NULL;
ALTER TABLE albaran_line_items ADD COLUMN IF NOT EXISTS units_per_package NUMERIC DEFAULT NULL;

-- --- Tres descuentos en cascada por línea ---
-- Ya deberían existir de una migración anterior; con IF NOT EXISTS no pasa
-- nada si ya están, y si faltaban es lo que causaba el cobro de más.
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS discount_percent_2 NUMERIC DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS discount_percent_3 NUMERIC DEFAULT 0;
ALTER TABLE albaran_line_items ADD COLUMN IF NOT EXISTS discount_percent_2 NUMERIC DEFAULT 0;
ALTER TABLE albaran_line_items ADD COLUMN IF NOT EXISTS discount_percent_3 NUMERIC DEFAULT 0;

-- --- Almacén propio de un vendedor ---
-- Vacío = tira del almacén de la empresa; el comercial de ruta pone el suyo.
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS almacen_id UUID DEFAULT NULL;

-- --- Módulos encendidos y panel de inicio de cada empresa ---
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS modulos JSONB DEFAULT NULL;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS panel JSONB DEFAULT NULL;
