/**
 * ¿ESTÁ BIEN CONFIGURADA LA CONEXIÓN CON LOS BANCOS?
 *
 * La conexión con los bancos (Enable Banking, PSD2) depende de tres cosas
 * que no están en el código: el id de la aplicación, su clave privada y que
 * en el panel de Enable Banking esté registrada la dirección a la que el
 * banco devuelve al cliente. Si falla cualquiera, el cliente pulsa
 * «Conectar», el banco le da un error genérico y nadie sabe por qué.
 *
 * Aquí se comprueba cada cosa por separado y se dice cómo arreglarla. Lo
 * enseña el panel de administración (`/admin/banco`).
 *
 * Puro: recibe lo que hay y devuelve las comprobaciones. La llamada a
 * Enable Banking la hace quien lo usa y pasa el resultado.
 */

import { createPrivateKey } from 'node:crypto';

export interface AplicacionEnableBanking {
  nombre: string;
  /** `SANDBOX` (bancos de prueba) o `PRODUCTION`. */
  entorno: string;
  /** Direcciones de vuelta registradas en el panel de Enable Banking. */
  redirecciones: string[];
  activa: boolean;
}

export interface EntradaDiagnostico {
  appId: string | undefined;
  clave: string | undefined;
  /** La dirección de vuelta que usará la app: `${origen}/api/banco/vuelta`. */
  urlVuelta: string;
  /** Lo que respondió `GET /application`, si se pudo preguntar. */
  app?: AplicacionEnableBanking;
  /** El error de esa llamada, si falló. */
  errorApi?: string;
}

export interface Comprobacion {
  id: 'app_id' | 'clave' | 'conexion' | 'activa' | 'redireccion' | 'entorno';
  ok: boolean;
  titulo: string;
  detalle: string;
  /** Qué hacer para arreglarlo. */
  arreglo?: string;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La clave privada tal como la espera `crypto`. En las variables de entorno se suele pegar
 * con `\n` escritos (dos caracteres) o en una sola línea con espacios: las
 * dos formas se rehacen aquí.
 */
export function normalizarClave(pem: string): string {
  let t = pem.trim().replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(t);
  if (m) {
    const cuerpo = m[2].replace(/\s+/g, '');
    const lineas = cuerpo.match(/.{1,64}/g) ?? [];
    t = `-----BEGIN ${m[1]}-----\n${lineas.join('\n')}\n-----END ${m[1]}-----`;
  }
  return t;
}

function claveValida(pem: string): boolean {
  try {
    const k = createPrivateKey(normalizarClave(pem));
    return k.asymmetricKeyType === 'rsa';
  } catch {
    return false;
  }
}

const normUrl = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();

export function diagnosticar(e: EntradaDiagnostico): Comprobacion[] {
  const salida: Comprobacion[] = [];

  const appIdOk = Boolean(e.appId && RE_UUID.test(e.appId.trim()));
  salida.push({
    id: 'app_id', ok: appIdOk,
    titulo: 'Id de la aplicación',
    detalle: !e.appId ? 'No está puesto.' : appIdOk ? 'Puesto.' : 'Está puesto, pero no tiene forma de id de aplicación (un UUID).',
    ...(appIdOk ? {} : { arreglo: 'En las variables de entorno de producción (el .env del servidor), añade ENABLE_BANKING_APP_ID con el «Application ID» de tu aplicación en enablebanking.com.' }),
  });

  const claveOk = Boolean(e.clave && claveValida(e.clave));
  salida.push({
    id: 'clave', ok: claveOk,
    titulo: 'Clave privada',
    detalle: !e.clave ? 'No está puesta.' : claveOk ? 'Se lee bien (RSA).' : 'Está puesta, pero no es una clave privada RSA válida.',
    ...(claveOk ? {} : { arreglo: 'Añade ENABLE_BANKING_PRIVATE_KEY con el contenido entero del fichero .pem que te dio Enable Banking al crear la aplicación, de «-----BEGIN PRIVATE KEY-----» a «-----END PRIVATE KEY-----».' }),
  });

  // Sin las dos cosas no se puede ni preguntar a Enable Banking.
  if (!appIdOk || !claveOk) return salida;

  if (!e.app) {
    salida.push({
      id: 'conexion', ok: false,
      titulo: 'Conexión con Enable Banking',
      detalle: e.errorApi ? `No acepta las credenciales: ${e.errorApi}` : 'No se ha podido preguntar.',
      arreglo: 'Comprueba que el id y la clave son de la MISMA aplicación. Si regeneraste la clave en Enable Banking, la antigua deja de valer: pon la nueva.',
    });
    return salida;
  }

  salida.push({ id: 'conexion', ok: true, titulo: 'Conexión con Enable Banking', detalle: `Responde la aplicación «${e.app.nombre}».` });

  salida.push({
    id: 'activa', ok: e.app.activa,
    titulo: 'Aplicación activada',
    detalle: e.app.activa ? 'Activa.' : 'La aplicación existe pero no está activada.',
    ...(e.app.activa ? {} : { arreglo: 'En enablebanking.com, entra en la aplicación y actívala (en producción, Enable Banking la activa al firmar el contrato).' }),
  });

  const registrada = e.app.redirecciones.some(r => normUrl(r) === normUrl(e.urlVuelta));
  salida.push({
    id: 'redireccion', ok: registrada,
    titulo: 'Dirección de vuelta del banco',
    detalle: registrada
      ? `Registrada: ${e.urlVuelta}`
      : `El banco devolvería al cliente a ${e.urlVuelta}, y esa dirección no está en la aplicación${e.app.redirecciones.length ? ` (tiene: ${e.app.redirecciones.join(', ')})` : ''}.`,
    ...(registrada ? {} : { arreglo: `En enablebanking.com → tu aplicación → «Allowed redirect URLs», añade exactamente: ${e.urlVuelta}` }),
  });

  const sandbox = /sandbox/i.test(e.app.entorno);
  salida.push({
    id: 'entorno', ok: true,
    titulo: 'Entorno',
    detalle: sandbox
      ? 'Pruebas (sandbox): sólo aparecen bancos de mentira. Sirve para probar el flujo entero; para bancos reales hace falta una aplicación de producción.'
      : 'Producción: bancos reales.',
  });

  return salida;
}

/** ¿Pueden las empresas conectar ya sus bancos? */
export function todoBien(comprobaciones: Comprobacion[]): boolean {
  const ids = new Set(comprobaciones.map(c => c.id));
  return comprobaciones.every(c => c.ok) && ids.has('redireccion');
}
