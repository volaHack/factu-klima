/**
 * LOS DATOS DEL TITULAR, EN UN SOLO SITIO
 *
 * Las cuatro páginas legales (privacidad, términos, aviso legal y
 * cookies) los leen de aquí. Mientras estén vacíos, cada página avisa
 * arriba de que el documento está sin completar: es preferible decirlo
 * a publicar una política con huecos disimulados.
 *
 * QUÉ HAY QUE RELLENAR, Y POR QUÉ CADA COSA:
 *
 * - `titular`: el nombre con el que se factura. Si se factura como
 *   autónoma, el nombre y apellidos; si hay sociedad, la razón social
 *   completa. Tiene que coincidir con el que sale en las facturas que
 *   emite el programa y con el de la cuenta de Stripe.
 * - `nif`: el mismo NIF con el que se declara.
 * - `domicilio`: el domicilio fiscal completo, con código postal.
 * - `email`: la dirección a la que puede escribir un cliente para
 *   ejercer sus derechos o pedir soporte. Los planes prometen soporte
 *   por email: esta es esa dirección.
 * - `registro`: sólo si hay sociedad (registro mercantil, tomo, folio,
 *   hoja). Una autónoma lo deja vacío.
 */
export const TITULAR = {
  titular: '',
  nif: '',
  domicilio: '',
  email: '',
  registro: '',
} as const;

/** Hasta que los cuatro campos obligatorios estén puestos, las páginas avisan. */
export const datosCompletos =
  Boolean(TITULAR.titular && TITULAR.nif && TITULAR.domicilio && TITULAR.email);

/** Para escribir «[pendiente]» donde falte un dato, sin dejar huecos mudos. */
export function dato(valor: string, nombre: string): string {
  return valor || `[pendiente: ${nombre}]`;
}

/**
 * Quién trata datos por cuenta del titular. Son los que hay de verdad
 * en el código: si mañana se añade otro proveedor, va aquí, porque el
 * RGPD obliga a poder decir quién toca los datos.
 */
export const ENCARGADOS = [
  {
    nombre: 'Supabase, Inc.',
    papel: 'Base de datos, autenticación y copias de seguridad',
    ubicacion: 'Servidores en la Unión Europea',
  },
  {
    nombre: 'Vercel, Inc.',
    papel: 'Alojamiento de la aplicación y registro técnico de peticiones',
    ubicacion: 'EE. UU., con cláusulas contractuales tipo',
  },
  {
    nombre: 'Stripe Payments Europe, Ltd.',
    papel: 'Cobro de las suscripciones y de los pagos online',
    ubicacion: 'Irlanda',
  },
  {
    nombre: 'Google LLC',
    papel: 'Inicio de sesión con Google, sólo si el usuario lo elige',
    ubicacion: 'EE. UU., con cláusulas contractuales tipo',
  },
  {
    nombre: 'Agencia Estatal de Administración Tributaria',
    papel: 'Recepción de los registros de facturación (Veri*Factu)',
    ubicacion: 'España — no es un encargado: es una obligación legal',
  },
] as const;

/** La última vez que se revisaron estos textos. */
export const ULTIMA_REVISION = '22 de septiembre de 2026';
