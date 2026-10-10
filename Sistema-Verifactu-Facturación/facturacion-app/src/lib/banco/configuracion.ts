import 'server-only';

/**
 * El diagnóstico de la conexión con los bancos, con la llamada de verdad a
 * Enable Banking. Lo usa la página `/admin/banco`.
 */

import { aplicacion } from './enableBanking';
import { diagnosticar, todoBien, type Comprobacion } from './diagnostico';

export interface EstadoConfiguracion {
  comprobaciones: Comprobacion[];
  listo: boolean;
  urlVuelta: string;
  entorno: string | null;
}

export async function comprobarConfiguracion(origen: string): Promise<EstadoConfiguracion> {
  const urlVuelta = `${origen.replace(/\/+$/, '')}/api/banco/vuelta`;
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const clave = process.env.ENABLE_BANKING_PRIVATE_KEY;

  // Primero lo que se puede mirar sin salir del servidor; sólo si eso está
  // bien se pregunta a Enable Banking.
  // (Sin `app`, `diagnosticar` ya apunta «no se ha podido preguntar»: aquí
  // sólo cuentan el id y la clave.)
  const previas = diagnosticar({ appId, clave, urlVuelta });
  const credenciales = previas.filter(c => c.id === 'app_id' || c.id === 'clave').every(c => c.ok);
  let app;
  let errorApi: string | undefined;
  if (credenciales) {
    try { app = await aplicacion(); } catch (e) { errorApi = e instanceof Error ? e.message : String(e); }
  }
  const comprobaciones = credenciales ? diagnosticar({ appId, clave, urlVuelta, app, errorApi }) : previas;
  return { comprobaciones, listo: todoBien(comprobaciones), urlVuelta, entorno: app?.entorno ?? null };
}
