-- ============================================================
-- MIGRACIÓN 046: el sellado cuenta los descuentos que existen
--
-- QUÉ ESTABA MAL
-- `fn_invoice_seal` recalcula los importes desde las líneas —y hace bien,
-- porque aceptar el total que manda el cliente sería la puerta grande al
-- fraude—, pero su fórmula se había quedado corta:
--
--   1. Sólo aplicaba el PRIMER descuento de línea. Las líneas tienen tres
--      en cascada (`discount_percent`, `_2`, `_3`) desde hace tiempo.
--   2. Ignoraba por completo los descuentos A PIE DE FACTURA
--      (`global_discount_percent_1/2/3`), que la aplicación ya calculaba
--      y guardaba.
--
-- Consecuencia: una factura con descuento en cascada o con descuento
-- final se sellaba por un importe DISTINTO del que se había visto en
-- pantalla y del que sale impreso. En un sistema cuyo valor es que el
-- importe sellado es el bueno, eso es lo más grave que puede pasar.
--
-- CÓMO SE ARREGLA
-- Se replica exactamente el cálculo de `calculateInvoiceTotals`
-- (src/lib/utils.ts):
--
--   neto de línea = ROUND(cant × precio × (1-d1) × (1-d2) × (1-d3), 2)
--   factor de pie = (1-g1) × (1-g2) × (1-g3)
--   base          = ROUND(Σ neto × factor, 2)
--   cuota         = Σ ROUND(base_del_tipo × factor × tipo, 2)   (por tipo)
--   descuentos    = ROUND(Σ bruto − Σ neto × factor, 2)
--   total         = ROUND(base_sin_redondear + cuota, 2)
--
-- El orden de redondeo importa: se redondea al final, no en cada paso, y
-- por eso las variables nuevas son NUMERIC sin precisión fija.
--
-- POR QUÉ ESTE FICHERO PARCHEA EN VEZ DE REESCRIBIR LA FUNCIÓN ENTERA
-- `fn_invoice_seal` tiene casi 7.000 caracteres: además del cálculo lleva
-- el encadenado de huellas, el bloqueo contra sellados simultáneos y el
-- control de antirretroactividad. Copiarla entera aquí para cambiar diez
-- líneas es la mejor forma de introducir un fallo en la parte que NO se
-- quiere tocar. Se sustituyen sólo los dos trozos afectados, y si alguno
-- no aparece la migración falla en vez de dejar la función a medias.
--
-- Comprobado con una factura real (2 × 10 € con 10 % y 5 % en cascada,
-- 1 × 5 €, y 10 % a pie): base 19,89 · descuentos 5,11 · cuota 3,68 ·
-- total 23,57, idéntico a lo que calcula la aplicación. El test
-- `descuentos.test.ts` fija esos mismos números del lado de TypeScript.
-- ============================================================

DO $bloque$
DECLARE
  def   TEXT;
  paso1 TEXT;
  paso2 TEXT;
BEGIN
  def := pg_get_functiondef('public.fn_invoice_seal'::regproc);

  -- Ya aplicada: no hay nada que hacer.
  IF def ILIKE '%global_discount_percent_1%' THEN
    RETURN;
  END IF;

  paso1 := replace(
    def,
    '  v_now        TIMESTAMPTZ := NOW();',
    '  v_now        TIMESTAMPTZ := NOW();' || chr(10) ||
    '  v_factor     NUMERIC := 1;   -- descuentos a pie de factura, encadenados' || chr(10) ||
    '  v_bruto      NUMERIC := 0;   -- lineas sin ningun descuento' || chr(10) ||
    '  v_neto       NUMERIC := 0;   -- base tras descuentos de linea y de pie'
  );
  IF paso1 = def THEN
    RAISE EXCEPTION 'No se encontro el bloque DECLARE esperado en fn_invoice_seal';
  END IF;

  paso2 := regexp_replace(
    paso1,
    'SELECT\s+COALESCE\(SUM\(ROUND\(quantity.*?WHERE invoice_id = NEW\.id;',
    'v_factor := (1 - COALESCE(NEW.global_discount_percent_1, 0) / 100.0)' || chr(10) ||
    '              * (1 - COALESCE(NEW.global_discount_percent_2, 0) / 100.0)' || chr(10) ||
    '              * (1 - COALESCE(NEW.global_discount_percent_3, 0) / 100.0);' || chr(10) || chr(10) ||
    '    WITH lineas AS (' || chr(10) ||
    '      SELECT tax_rate,' || chr(10) ||
    '             quantity * unit_price AS bruto,' || chr(10) ||
    '             ROUND(quantity * unit_price' || chr(10) ||
    '                   * (1 - COALESCE(discount_percent, 0) / 100.0)' || chr(10) ||
    '                   * (1 - COALESCE(discount_percent_2, 0) / 100.0)' || chr(10) ||
    '                   * (1 - COALESCE(discount_percent_3, 0) / 100.0), 2) AS neto' || chr(10) ||
    '      FROM public.invoice_line_items WHERE invoice_id = NEW.id' || chr(10) ||
    '    ), por_tipo AS (' || chr(10) ||
    '      SELECT tax_rate, SUM(bruto) AS bruto, SUM(neto) AS base FROM lineas GROUP BY tax_rate' || chr(10) ||
    '    )' || chr(10) ||
    '    SELECT COALESCE(SUM(bruto), 0),' || chr(10) ||
    '           COALESCE(SUM(base), 0) * v_factor,' || chr(10) ||
    '           COALESCE(SUM(ROUND(base * v_factor * tax_rate / 100.0, 2)), 0)' || chr(10) ||
    '      INTO v_bruto, v_neto, v_tax' || chr(10) ||
    '      FROM por_tipo;' || chr(10) || chr(10) ||
    '    v_subtotal := ROUND(v_neto, 2);' || chr(10) ||
    '    v_discount := ROUND(v_bruto - v_neto, 2);'
  );
  IF paso2 = paso1 THEN
    RAISE EXCEPTION 'No se encontro el bloque de recalculo esperado en fn_invoice_seal';
  END IF;

  paso2 := replace(
    paso2,
    'NEW.total          := v_subtotal + v_tax;',
    'NEW.total          := ROUND(v_neto + v_tax, 2);'
  );

  EXECUTE paso2;
END
$bloque$;

-- Si algo de lo anterior no hubiera entrado, que se note aquí y no en la
-- primera factura con descuento.
DO $comprobacion$
BEGIN
  IF pg_get_functiondef('public.fn_invoice_seal'::regproc) NOT ILIKE '%global_discount_percent_1%'
     OR pg_get_functiondef('public.fn_invoice_seal'::regproc) NOT ILIKE '%discount_percent_3%' THEN
    RAISE EXCEPTION 'fn_invoice_seal sigue sin contemplar los descuentos: revisa la migracion 046';
  END IF;
END
$comprobacion$;
