-- ============================================================
-- MIGRACIÓN 017: Campos manuales de plantilla (datos_extras)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Qué añade:
--
-- Los campos manuales de la plantilla activa (nº de pedido,
-- matrícula, agente, envío, fecha de entrega; claves custom_1..5)
-- se rellenan en el formulario de factura/albarán y se guardan en
-- esta columna JSONB. El motor de plantillas (`datos.ts`) los lee
-- de `opciones.datosExtras` al generar el PDF.
--
-- `add column if not exists` la hace idempotente: si ya existe en
-- algún entorno no falla.
-- ============================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS datos_extras JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.albaranes
  ADD COLUMN IF NOT EXISTS datos_extras JSONB NOT NULL DEFAULT '{}';
