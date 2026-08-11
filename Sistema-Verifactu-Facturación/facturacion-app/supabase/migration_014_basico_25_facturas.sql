-- ============================================================
-- MIGRACIÓN 014: Plan Básico pasa de 15 a 25 facturas/mes
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Mantiene sincronizado el límite del plan con src/lib/plans.ts
-- (fuente de verdad para la UI). Sin esto, la base de datos seguiría
-- rechazando la factura 16 del mes aunque la UI muestre 25.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_plan_invoice_limit(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_plan
    WHEN 'basico' THEN 25
    WHEN 'pro' THEN 100
    WHEN 'sin_limite' THEN NULL
    ELSE 0  -- sin plan (o plan desconocido) = 0 facturas permitidas
  END;
$$;
