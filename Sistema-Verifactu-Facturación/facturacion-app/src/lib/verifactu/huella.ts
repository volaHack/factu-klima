/**
 * LA HUELLA DE UN REGISTRO DE FACTURACIÓN
 *
 * Fuente: AEAT, «Detalle de las especificaciones técnicas para generación
 * de la huella o hash de los registros de facturación», versión 0.1.2 del
 * 27/08/2024. Nada de lo que hay aquí sale de un blog ni de un tutorial:
 * cada regla está en ese documento y las tres pruebas del final son sus
 * tres ejemplos, copiados literalmente.
 *
 * Lo que dice el documento, resumido:
 *
 *   1. Se concatenan unos campos concretos, EN UN ORDEN CONCRETO, con la
 *      forma «nombre=valor&nombre=valor&…».
 *   2. Los valores se recortan por los extremos.
 *   3. Los importes admiten una o dos posiciones decimales indistintamente:
 *      los ceros a la derecha no cuentan. Aquí se emiten siempre con dos,
 *      que es la forma que también viaja en el XML.
 *   4. Un campo ausente o vacío se escribe igual, con su «=» y nada detrás.
 *      El primer registro de la cadena es justo ese caso: «…&Huella=&…».
 *   5. La cadena se codifica en UTF-8, se le aplica SHA-256 y el resultado
 *      se escribe en hexadecimal, EN MAYÚSCULAS, 64 caracteres.
 *
 * Y el aviso que explica por qué esto no se puede improvisar (apartado 7):
 * si la huella que enviamos no coincide con la que calcula la AEAT, el
 * registro se acepta «con errores». No se pierde, pero queda marcado.
 *
 * DÓNDE VIVE LA VERDAD
 * La huella auténtica la calcula la base de datos al sellar la factura
 * (ver `verifactu_huella_alta` en la migración 038), porque es el único
 * sitio donde se puede garantizar el orden de la cadena bajo bloqueo. Este
 * módulo existe para construir la cadena que se le enseña al usuario
 * cuando quiere comprobarla y para verificar que lo guardado es lo que
 * debería ser. Las dos implementaciones tienen que dar el mismo resultado,
 * y hay pruebas que comparan ambas con los ejemplos oficiales.
 */

/** Campos de los que se compone la huella de un registro de alta. */
export interface CamposHuellaAlta {
  idEmisorFactura: string;
  numSerieFactura: string;
  /** En el formato del XML: dd-mm-aaaa. */
  fechaExpedicionFactura: string;
  tipoFactura: string;
  cuotaTotal: number;
  importeTotal: number;
  /** Huella del registro anterior. Vacía o ausente si es el primero. */
  huellaAnterior?: string | null;
  /** Marca de tiempo con huso: 2024-01-01T19:20:30+01:00. */
  fechaHoraHusoGenRegistro: string;
}

/** Campos de los que se compone la huella de un registro de anulación. */
export interface CamposHuellaAnulacion {
  idEmisorFacturaAnulada: string;
  numSerieFacturaAnulada: string;
  fechaExpedicionFacturaAnulada: string;
  huellaAnterior?: string | null;
  fechaHoraHusoGenRegistro: string;
}

/**
 * Escribe un par «nombre=valor» siguiendo las reglas del apartado 3.
 *
 * Lo importante es lo que NO hace: no codifica nada. La tentación de
 * meterle un encodeURIComponent es fuerte porque la cadena tiene pinta de
 * query string, pero no lo es. El ejemplo oficial lleva un número de
 * factura «12345678/G33» con la barra tal cual, y codificarla como %2F
 * daría una huella distinta de la que calcula la AEAT.
 */
function par(nombre: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return `${nombre}=`;
  return `${nombre}=${String(valor).trim()}`;
}

/**
 * Formatea un importe para la huella y para el XML.
 *
 * Dos decimales y punto como separador. El documento admite también una
 * sola posición decimal, pero admitir no es lo mismo que elegir: emitir
 * siempre igual evita que dos ejecuciones den huellas distintas para el
 * mismo importe.
 */
export function importeAeat(valor: number): string {
  if (!Number.isFinite(valor)) {
    throw new Error(`Importe no numérico en la huella: ${valor}`);
  }
  // Se normaliza el -0 que sale de redondear importes negativos diminutos:
  // «-0.00» y «0.00» son el mismo importe y no pueden dar huellas distintas.
  const redondeado = Math.round(valor * 100) / 100;
  return (redondeado === 0 ? 0 : redondeado).toFixed(2);
}

/**
 * Convierte una fecha ISO (aaaa-mm-dd) al formato del XML (dd-mm-aaaa).
 *
 * El XSD lo fija: `<simpleType name="fecha">` con longitud 10 y patrón
 * `\d{2}-\d{2}-\d{4}`. Es al revés que el ISO que usa la aplicación por
 * dentro, y es el error más fácil de cometer aquí porque «01-01-2024» y
 * «2024-01-01» tienen las dos pinta de fecha correcta.
 */
export function fechaAeat(fechaIso: string): string {
  const limpia = fechaIso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpia);
  if (!m) throw new Error(`Fecha no válida para la AEAT: ${fechaIso}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Marca de tiempo con huso horario, tal y como la pide el campo
 * FechaHoraHusoGenRegistro (tipo dateTime del XSD).
 *
 * Se emite SIEMPRE con desplazamiento explícito («+01:00», «+02:00»), no
 * en UTC con «Z». Las dos formas son dateTime válidos, pero el registro
 * documenta el huso del sistema que lo generó, y en España eso cambia dos
 * veces al año. Se calcula con Intl para que el horario de verano salga
 * solo, en vez de mantener una tabla de fechas de cambio que se quedaría
 * vieja.
 */
export function marcaDeTiempoAeat(momento: Date, zona = 'Europe/Madrid'): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(momento);

  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? '00';
  // La hora «24» que algunos entornos devuelven a medianoche sería un
  // dateTime inválido; se normaliza a 00.
  const hora = p('hour') === '24' ? '00' : p('hour');
  const local = `${p('year')}-${p('month')}-${p('day')}T${hora}:${p('minute')}:${p('second')}`;

  // El desplazamiento se deduce midiendo: la hora local de esa zona menos
  // la hora UTC del mismo instante. Así no hay que saber si ese día era
  // horario de verano.
  const comoUtc = Date.UTC(
    Number(p('year')), Number(p('month')) - 1, Number(p('day')),
    Number(hora), Number(p('minute')), Number(p('second')),
  );
  const minutos = Math.round((comoUtc - Math.floor(momento.getTime() / 1000) * 1000) / 60000);
  const signo = minutos < 0 ? '-' : '+';
  const abs = Math.abs(minutos);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');

  return `${local}${signo}${hh}:${mm}`;
}

/** La cadena exacta sobre la que se aplica SHA-256, para un alta. */
export function cadenaHuellaAlta(campos: CamposHuellaAlta): string {
  return [
    par('IDEmisorFactura', campos.idEmisorFactura),
    par('NumSerieFactura', campos.numSerieFactura),
    par('FechaExpedicionFactura', campos.fechaExpedicionFactura),
    par('TipoFactura', campos.tipoFactura),
    par('CuotaTotal', importeAeat(campos.cuotaTotal)),
    par('ImporteTotal', importeAeat(campos.importeTotal)),
    par('Huella', campos.huellaAnterior || ''),
    par('FechaHoraHusoGenRegistro', campos.fechaHoraHusoGenRegistro),
  ].join('&');
}

/** La cadena exacta sobre la que se aplica SHA-256, para una anulación. */
export function cadenaHuellaAnulacion(campos: CamposHuellaAnulacion): string {
  return [
    par('IDEmisorFacturaAnulada', campos.idEmisorFacturaAnulada),
    par('NumSerieFacturaAnulada', campos.numSerieFacturaAnulada),
    par('FechaExpedicionFacturaAnulada', campos.fechaExpedicionFacturaAnulada),
    par('Huella', campos.huellaAnterior || ''),
    par('FechaHoraHusoGenRegistro', campos.fechaHoraHusoGenRegistro),
  ].join('&');
}

/**
 * SHA-256 de la cadena, en hexadecimal y mayúsculas.
 *
 * Usa WebCrypto en vez de node:crypto para que valga igual en el servidor
 * y en el navegador: la pantalla de la factura ofrece recalcular la huella
 * para comprobarla, y eso pasa en el navegador del usuario.
 */
export async function calcularHuella(cadena: string): Promise<string> {
  const bytes = new TextEncoder().encode(cadena);
  const resumen = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(resumen))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Huella de un registro de alta. */
export function huellaDeAlta(campos: CamposHuellaAlta): Promise<string> {
  return calcularHuella(cadenaHuellaAlta(campos));
}

/** Huella de un registro de anulación. */
export function huellaDeAnulacion(campos: CamposHuellaAnulacion): Promise<string> {
  return calcularHuella(cadenaHuellaAnulacion(campos));
}

/** Una huella válida son 64 caracteres hexadecimales en mayúsculas. */
export function esHuellaValida(huella: string | null | undefined): boolean {
  return typeof huella === 'string' && /^[0-9A-F]{64}$/.test(huella);
}
