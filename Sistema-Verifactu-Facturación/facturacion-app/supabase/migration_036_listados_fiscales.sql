-- ============================================================
-- MIGRACIÓN 036 — Listados fiscales (modelos oficiales)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
--
-- QUÉ HACE Y POR QUÉ
-- ------------------
-- El módulo /listados-fiscales calcula los modelos oficiales (347, 303,
-- 130, 131 de la AEAT; 420, 415, 425 de la ATC) a partir de las facturas
-- y los gastos que ya hay. Al montarlo salieron tres huecos en el
-- esquema que impiden calcular bien varios modelos:
--
--   1. `gastos` guarda una cuota (`tax_amount`) pero no dice si esa cuota
--      es DEDUCIBLE ni de qué tipo de operación viene. Un 303 o un 420
--      necesitan separar interiores corrientes, bienes de inversión,
--      importaciones, adquisiciones intracomunitarias e inversión del
--      sujeto pasivo, porque van a casillas distintas del modelo. Sin
--      esto sólo se puede hacer una suma y llamarla "soportado", que es
--      justo lo que no vale para presentar.
--
--   2. `company_settings` no sabe en qué régimen de IRPF está el
--      empresario. Sin eso no se puede decidir si le toca el modelo 130
--      (estimación directa) o el 131 (módulos) — ni, de hecho, si le toca
--      alguno.
--
--   3. No había dónde guardar el historial de generaciones, que es lo que
--      permite volver a descargar un fichero ya presentado.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- NO BORRA NI MODIFICA DATOS EXISTENTES: todas las columnas nuevas
-- llevan valor por defecto compatible con lo que ya hay.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Clasificación fiscal de los gastos
-- ------------------------------------------------------------
--
-- `deducible` por defecto TRUE: los gastos que ya están grabados se
-- dieron de alta como gasto de la actividad, así que lo razonable es
-- tratarlos como deducibles hasta que alguien diga lo contrario. Marcar
-- el histórico como no deducible cambiaría la liquidación de trimestres
-- ya presentados, y eso no lo decide una migración.
--
-- `tipo_operacion` por defecto 'interior_corriente', que es el caso de
-- la inmensa mayoría de los gastos de una pyme (compras y suministros en
-- territorio de aplicación del impuesto).

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS deducible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tipo_operacion TEXT NOT NULL DEFAULT 'interior_corriente',
  -- Cuota que de verdad se deduce. Puede ser menor que `tax_amount` si
  -- hay prorrata o si el gasto es sólo parcialmente afecto a la
  -- actividad (el caso típico: el coche). NULL = se deduce toda.
  ADD COLUMN IF NOT EXISTS cuota_deducible NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gastos_tipo_operacion_check'
  ) THEN
    ALTER TABLE public.gastos
      ADD CONSTRAINT gastos_tipo_operacion_check CHECK (tipo_operacion IN (
        'interior_corriente',        -- compras y servicios en el TAI
        'interior_inversion',        -- bienes de inversión
        'importacion_corriente',     -- importaciones de bienes corrientes
        'importacion_inversion',     -- importaciones de bienes de inversión
        'intracomunitaria_corriente',
        'intracomunitaria_inversion',
        'inversion_sujeto_pasivo',   -- ISP: la cuota se autorrepercute
        'no_sujeta',
        'exenta'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.gastos.deducible IS
  'Si la cuota soportada da derecho a deducción. Los gastos anteriores a la migración se dan por deducibles.';
COMMENT ON COLUMN public.gastos.tipo_operacion IS
  'A qué casilla del 303/420 va la cuota soportada. Ver el CHECK para los valores.';
COMMENT ON COLUMN public.gastos.cuota_deducible IS
  'Cuota realmente deducible si es menor que tax_amount (prorrata, afectación parcial). NULL = toda.';


-- ------------------------------------------------------------
-- 2. Régimen fiscal de la empresa
-- ------------------------------------------------------------
--
-- `regimen_irpf` a NULL a propósito: no se adivina. Mientras esté vacío,
-- el panel enseña los modelos 130 y 131 como "no configurado" en vez de
-- decidir por el usuario cuál le toca — que es una decisión con
-- consecuencias en Hacienda, no un valor por defecto.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS regimen_irpf TEXT,
  ADD COLUMN IF NOT EXISTS epigrafe_iae TEXT,
  -- Porcentaje de prorrata general, si la empresa la aplica. NULL = no
  -- hay prorrata y se deduce el 100%.
  ADD COLUMN IF NOT EXISTS porcentaje_prorrata NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_regimen_irpf_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_regimen_irpf_check CHECK (
        regimen_irpf IS NULL OR regimen_irpf IN (
          'directa_normal',      -- modelo 130
          'directa_simplificada',-- modelo 130
          'objetiva',            -- modelo 131 (módulos)
          'no_aplica'            -- sociedades: ni 130 ni 131
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.company_settings.regimen_irpf IS
  'Régimen de IRPF del empresario. Decide si le corresponde el modelo 130 (directa) o el 131 (objetiva). NULL = sin configurar.';


-- ------------------------------------------------------------
-- 3. Historial de generaciones
-- ------------------------------------------------------------
--
-- Se guarda el CONTENIDO del fichero generado, no sólo la fecha: el
-- objetivo del historial es poder volver a descargar exactamente lo que
-- se presentó. Recalcularlo meses después no sirve, porque los datos de
-- origen pueden haber cambiado (una factura rectificada, un gasto
-- reclasificado) y saldría un fichero distinto del que vio Hacienda.

CREATE TABLE IF NOT EXISTS public.fiscal_generaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modelo TEXT NOT NULL CHECK (modelo IN ('347', '303', '130', '131', '420', '415', '425')),
  ejercicio INT NOT NULL,
  -- NULL en los modelos anuales (347, 415, 425)
  trimestre INT CHECK (trimestre IS NULL OR trimestre BETWEEN 1 AND 4),
  generado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Quién lo generó, tal y como se enseña en el historial.
  generado_por TEXT NOT NULL DEFAULT '',
  num_registros INT NOT NULL DEFAULT 0,
  -- El resultado de la liquidación, o NULL en las declaraciones
  -- informativas (el 347 no tiene "resultado").
  resultado NUMERIC,
  estado TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'con_avisos')),
  nombre_fichero TEXT,
  contenido TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_generaciones ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que el resto de tablas del programa: cada usuario ve
-- sólo lo suyo. Los datos fiscales son de los más sensibles que hay
-- aquí dentro, así que no se abre ni una rendija de más.
DROP POLICY IF EXISTS "fiscal_generaciones_owner" ON public.fiscal_generaciones;
CREATE POLICY "fiscal_generaciones_owner" ON public.fiscal_generaciones
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_generaciones_usuario_modelo
  ON public.fiscal_generaciones (user_id, modelo, ejercicio DESC, trimestre DESC);

COMMENT ON TABLE public.fiscal_generaciones IS
  'Historial de ficheros fiscales generados, con su contenido, para poder volver a descargar lo que se presentó.';
