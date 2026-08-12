-- ============================================================
-- 017: Plantillas de documento
--
-- Guarda el diseño con el que se imprime cada factura o albarán. Una
-- plantilla nace de un PDF que sube el usuario: el diseño se conserva como
-- calco (imagen de la página con los datos de muestra borrados) y encima
-- van los campos que se rellenan con los datos reales.
--
-- El diseño entero vive en `template` (JSONB) porque es el formato que
-- consume pdfme tal cual. Incluye el calco en base64, así que la fila puede
-- ocupar unos cientos de KB: son pocas filas por empresa y cambian muy de
-- vez en cuando.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- Tipos de documento que imprime: {factura}, {albaran} o los dos.
  applies_to    TEXT[] NOT NULL DEFAULT ARRAY['factura'],
  template      JSONB NOT NULL,
  -- Avisos de la detección y confianza por campo. Sirve para volver a abrir
  -- el revisor y explicar al usuario qué se dedujo y qué no.
  diagnostics   JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_user
  ON document_templates(user_id, updated_at DESC);

-- Sólo una plantilla predeterminada por empresa: si hubiera dos, cuál se usa
-- al descargar una factura dependería del orden de lectura.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_templates_default
  ON document_templates(user_id)
  WHERE is_default;

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus plantillas" ON document_templates;
CREATE POLICY "Usuarios ven sus plantillas" ON document_templates
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios crean sus plantillas" ON document_templates;
CREATE POLICY "Usuarios crean sus plantillas" ON document_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios editan sus plantillas" ON document_templates;
CREATE POLICY "Usuarios editan sus plantillas" ON document_templates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios borran sus plantillas" ON document_templates;
CREATE POLICY "Usuarios borran sus plantillas" ON document_templates
  FOR DELETE USING (auth.uid() = user_id);
