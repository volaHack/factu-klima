-- ============================================================
-- MIGRACIÓN 008: Categorías personalizadas
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
--
-- QUÉ HACE Y POR QUÉ
-- ------------------
-- La app permite al usuario crear, editar y eliminar categorías de
-- producto. Esas categorías se guardan en company_settings, pero la
-- columna `custom_categories` planeada en el diseño nunca llegó a
-- crearse: el código la lee y escribe pero la BD no la tiene, así que
-- cualquier cambio se perdía en cuanto se recargaba la página.
--
-- Esta migración añade la columna. Formato de cada entrada JSON:
--   { "id": string, "name": string, "icon": string, "sector"?: string,
--     "hidden"?: boolean }
--
--   - id nuevo (`custom_<timestamp>`): categoría adicional.
--   - id igual al de una categoría por defecto del sector: la RENOMBRA
--     o cambia su icono (override). Es el mecanismo para editar las
--     categorías por defecto.
--   - hidden = true: oculta la categoría por defecto (eliminación).
--
-- RLS y permisos: la columna hereda los de la tabla (authenticated ya
-- tiene SELECT/UPDATE sobre company_settings), no hace falta nada más.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS custom_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN company_settings.custom_categories IS
  'Categorías personalizadas del usuario. Cada entrada: { id, name, icon, sector?, hidden? }. Un id que coincide con una categoría por defecto del sector la renombra (edición); hidden=true la oculta (eliminación).';
