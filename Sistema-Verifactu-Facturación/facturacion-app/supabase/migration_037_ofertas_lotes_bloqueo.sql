-- ============================================================
-- 037 - Ofertas de mostrador y bloqueo de lotes
--
-- Dos cosas que se despliegan juntas porque las dos tocan lo que se puede
-- vender y a qué precio.
--
-- OFERTAS: lo que va en el cartel. «3x2», «segunda unidad al 50 %», «diez
-- cajas y una gratis», «los martes la fruta a mitad de precio». Se guardan
-- las REGLAS; el cálculo lo hace `src/lib/ofertas.ts` en el momento de la
-- venta, igual que los rappels y las comisiones.
--
-- BLOQUEO DE LOTES: la mitad que le faltaba a la trazabilidad. Sabía decir
-- a quién se le había servido el lote L-4471, pero nada impedía seguir
-- vendiéndolo mientras se averiguaba. Ahora un lote puede estar
-- «inmovilizado» —retenido mientras se comprueba, reversible— o «retirado»
-- —fuera de circulación para siempre—.
-- ============================================================

-- ------------------------------------------------------------
-- OFERTAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ofertas (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL,

  alcance text NOT NULL DEFAULT 'todo',
  alcance_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- La aritmética. Cada tipo usa las que necesita y deja el resto en nulo;
  -- una columna por parámetro sería una tabla con veinte huecos vacíos.
  param_n numeric,
  param_m numeric,
  param_porcentaje numeric,
  param_importe numeric,
  tramos jsonb NOT NULL DEFAULT '[]'::jsonb,
  regalo_product_id uuid,
  regalo_nombre text,
  regalo_cantidad numeric,

  -- Cuándo vive.
  desde date,
  hasta date,
  dias_semana jsonb,
  hora_inicio text,
  hora_fin text,

  -- A quién y con qué condiciones.
  solo_grupo_cliente_id uuid,
  solo_cliente_id uuid,
  minimo_importe numeric,
  minimo_unidades numeric,

  -- Gobierno.
  activa boolean NOT NULL DEFAULT true,
  acumulable boolean NOT NULL DEFAULT false,
  prioridad integer NOT NULL DEFAULT 0,
  usos_maximos integer,
  usos integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- El tipo se valida en la base y no sólo en TypeScript: una fila con un
  -- tipo que el motor no conoce se aplicaría como «ninguna oferta», y un
  -- descuento que desaparece en silencio es de los fallos que no se ven
  -- hasta que un cliente reclama.
  CONSTRAINT ofertas_tipo_valido CHECK (tipo IN (
    'nxm', 'unidad_siguiente', 'porcentaje', 'importe',
    'precio_fijo', 'escalado', 'regalo'
  )),
  CONSTRAINT ofertas_alcance_valido CHECK (alcance IN ('producto', 'categoria', 'todo'))
);

ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ofertas' AND policyname = 'ofertas_own') THEN
    CREATE POLICY ofertas_own ON public.ofertas USING (auth.uid() = user_id);
  END IF;
END $$;

-- El TPV pide las ofertas vivas en cada venta: que no recorra la tabla.
CREATE INDEX IF NOT EXISTS ofertas_user_activa_idx
  ON public.ofertas (user_id, activa);

COMMENT ON TABLE public.ofertas IS
  'Reglas de promoción de mostrador. El calculo se hace en el cliente (src/lib/ofertas.ts) en el momento de la venta.';
COMMENT ON COLUMN public.ofertas.acumulable IS
  'Si convive con otras sobre la misma linea. Las no acumulables compiten y gana la que mas ahorra AL CLIENTE.';
COMMENT ON COLUMN public.ofertas.prioridad IS
  'Solo desempata entre dos ofertas que ahorren lo mismo. No decide cual gana.';

-- ------------------------------------------------------------
-- BLOQUEO DE LOTES
-- ------------------------------------------------------------

ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS motivo_bloqueo text,
  ADD COLUMN IF NOT EXISTS bloqueado_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lotes_estado_valido'
  ) THEN
    ALTER TABLE public.lotes
      ADD CONSTRAINT lotes_estado_valido
      CHECK (estado IN ('disponible', 'inmovilizado', 'retirado'));
  END IF;
END $$;

-- Un lote parado tiene que decir por que. Dentro de seis meses, quien mire
-- este lote —o un inspector— tiene que poder saberlo sin llamar a nadie.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lotes_bloqueo_con_motivo'
  ) THEN
    ALTER TABLE public.lotes
      ADD CONSTRAINT lotes_bloqueo_con_motivo
      CHECK (estado = 'disponible' OR (motivo_bloqueo IS NOT NULL AND length(btrim(motivo_bloqueo)) > 0));
  END IF;
END $$;

-- La consulta de la alerta: «ensename todo lo que esta parado».
CREATE INDEX IF NOT EXISTS lotes_user_estado_idx
  ON public.lotes (user_id, estado) WHERE estado <> 'disponible';

COMMENT ON COLUMN public.lotes.estado IS
  'disponible | inmovilizado (retenido mientras se comprueba, reversible) | retirado (fuera de circulacion, definitivo).';
COMMENT ON COLUMN public.lotes.motivo_bloqueo IS
  'Por que se paro. Obligatorio en cuanto el estado deja de ser disponible.';
COMMENT ON COLUMN public.lotes.bloqueado_en IS
  'Cuando se paro, para poder demostrar la rapidez de la reaccion ante una alerta sanitaria.';

-- ------------------------------------------------------------
-- UN LOTE PARADO NO SALE POR LA PUERTA
--
-- La comprobacion vive tambien aqui, y no solo en el navegador, por lo
-- mismo que el resto de guardianes de este esquema: el cliente se puede
-- saltar (una pestana vieja en cache, una sincronizacion sin conexion que
-- sube lo de ayer), y una retirada alimentaria es justo el sitio donde no
-- se puede confiar en que el cliente haya hecho su parte.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_linea_lote_vendible()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_estado text;
  v_codigo text;
  v_motivo text;
BEGIN
  IF NEW.lote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado, codigo, motivo_bloqueo
    INTO v_estado, v_codigo, v_motivo
    FROM public.lotes
   WHERE id = NEW.lote_id;

  IF v_estado IS NULL OR v_estado = 'disponible' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'LOTE BLOQUEADO: el lote % esta % y no se puede vender (%).',
    v_codigo, v_estado, coalesce(v_motivo, 'sin motivo anotado')
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS tr_linea_lote_vendible ON public.invoice_line_items;
CREATE TRIGGER tr_linea_lote_vendible
  BEFORE INSERT OR UPDATE OF lote_id ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_linea_lote_vendible();
