-- 015: Imágenes de producto (miniatura data URL ligera; offline-first)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
co