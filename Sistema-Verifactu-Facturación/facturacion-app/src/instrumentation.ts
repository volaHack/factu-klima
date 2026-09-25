import type { Instrumentation } from 'next';

/**
 * Los fallos del servidor (páginas, rutas de API, acciones) quedan en
 * `errores_app`, igual que los del navegador. Ver lib/errores.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Sólo en Node: el registro usa la clave de servicio de Supabase.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registrarError } = await import('./lib/errores/registrar');
  const e = err as Error & { digest?: string };
  await registrarError({
    origen: 'servidor',
    mensaje: `${e?.message ?? String(err)}${e?.digest ? ` (digest ${e.digest})` : ''}`,
    pila: e?.stack ?? null,
    ruta: `${request.method} ${request.path} · ${context.routeType}`,
  });
};
