-- Migration 006: Multitenant Stripe Connections

CREATE TABLE IF NOT EXISTS public.stripe_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  publishable_key text,
  encrypted_secret_key text,
  encrypted_webhook_secret text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.stripe_connections ENABLE ROW LEVEL SECURITY;

-- Ocultar los datos a todos por defecto (solo lectura con service_role en el backend)
-- No queremos que los usuarios puedan descargar su secret key cifrado hacia el frontend.
-- Si necesitan volver a conectarlo, lo sobrescriben.
CREATE POLICY "Nadie puede leer stripe_connections desde cliente"
  ON public.stripe_connections
  FOR SELECT
  USING (false);

-- Permitir a los usuarios escribir su propia conexion de Stripe.
-- FOR INSERT, UPDATE, DELETE (no FOR ALL): en Postgres, FOR ALL incluye
-- SELECT, y como las politicas permisivas se combinan con OR, un FOR ALL
-- aqui reabriria la lectura que la politica anterior bloquea a proposito
-- (el secret key cifrado no debe poder leerse desde el cliente, ni
-- siquiera el propio dueno). Corregido al aplicar la migracion: el
-- original usaba FOR ALL y anulaba sin querer el bloqueo de lectura.
CREATE POLICY "Usuarios pueden escribir su propia conexion de Stripe"
  ON public.stripe_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden actualizar su propia conexion de Stripe"
  ON public.stripe_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden borrar su propia conexion de Stripe"
  ON public.stripe_connections
  FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON public.stripe_connections FROM anon;
REVOKE ALL ON public.stripe_connections FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_connections TO authenticated;
