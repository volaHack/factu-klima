/**
 * DEJAR LA CUENTA EN ESTE DISPOSITIVO
 *
 * Lo que hay que hacer antes de que en este navegador deje de estar la
 * cuenta actual: al cerrar sesión y al cambiar a otra de tus empresas. Si
 * no, la siguiente se encontraría la caché y la cola sin conexión de la
 * anterior.
 */

import { cerrarPerfil } from '@/lib/perfilesCliente';
import { terminarSesionDeEsteEquipo } from '@/lib/sesionesPerfiles';
import { clearOfflineCache, getSyncQueueCount } from '@/lib/offlineDb';
import { processSyncQueue } from '@/lib/syncEngine';
import { olvidarPantallas } from '@/lib/pwa/sinConexion';

const conTope = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>(listo => setTimeout(listo, ms))]);

/**
 * LO QUE AÚN NO HA SUBIDO NO SE TIRA SIN AVISAR
 *
 * Salir vacía la caché del dispositivo, y en ella está la cola de lo hecho
 * sin conexión. Un ticket cobrado sin internet que no ha llegado al
 * servidor se perdía entero: ni en la base de datos ni en Hacienda. Primero
 * se intenta subir; si no se puede, se pregunta. Devuelve si se puede seguir.
 */
export async function subirPendientesOPreguntar(queSeHace: string): Promise<boolean> {
  try {
    let pendientes = await getSyncQueueCount();
    if (pendientes > 0 && navigator.onLine) {
      await conTope(processSyncQueue(), 8000);
      pendientes = await getSyncQueueCount();
    }
    if (pendientes > 0) {
      return confirm(
        `Hay ${pendientes} ${pendientes === 1 ? 'cambio hecho' : 'cambios hechos'} sin conexión que todavía no ` +
        `${pendientes === 1 ? 'se ha' : 'se han'} subido (ventas, albaranes o fichas).\n\n` +
        `Si ${queSeHace} ahora se perderán. Lo seguro es esperar a tener conexión.\n\n¿Seguir igualmente?`,
      );
    }
  } catch {
    // Si ni siquiera se puede mirar la cola, se sigue: el botón no puede
    // quedarse sin hacer nada.
  }
  return true;
}

/** Quien trabajaba con perfil deja de salir como «trabajando ahora», y fuera las pantallas guardadas. */
export async function soltarPerfilYPantallas(perfilActivo: boolean, cuentaPerfiles: string | null): Promise<void> {
  // Las pantallas guardadas para usar sin conexión llevan datos de esta cuenta.
  void olvidarPantallas().catch(() => {});
  if (perfilActivo) {
    cerrarPerfil();
    // Antes de soltar la sesión de Supabase: después ya no se podría borrar la fila.
    await conTope(terminarSesionDeEsteEquipo(cuentaPerfiles), 2000);
  }
}

/**
 * Vacía la caché sin conexión. Con un tope: `clearOfflineCache` abre
 * IndexedDB, y una conexión que otra pestaña deje bloqueada no rechaza la
 * promesa, se queda esperando para siempre.
 */
export async function vaciarCache(): Promise<void> {
  try {
    await conTope(clearOfflineCache(), 3000);
  } catch {
    // Una caché que no se deja borrar tampoco puede dejarte dentro.
  }
}
