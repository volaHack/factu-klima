import { campoNuevo } from './editor';
import type { CampoDetectado, PaginaExtraida } from './tipos';
import { componerBloqueQr } from '../verifactu/qrFactura';

/**
 * EL QR TIENE QUE PODER MOVERSE
 *
 * El código ya se colocaba donde lo pusiera la plantilla: `generarPdf` lee
 * la posición del campo `verifactu_qr` y estampa ahí. El problema era que
 * una plantilla CALCADA DE UN PDF no traía ese campo —sólo lo ponían las
 * que se empezaban desde cero—, así que no había nada que mover en el
 * editor y el código caía siempre en la posición por defecto, encima de
 * lo que hubiera. Ese es el «QR fijo» que aparecía sin haberlo puesto.
 *
 * Aquí se asegura que el recuadro exista cuando el documento lo lleva, y
 * que no exista cuando no. A partir de ahí es un campo como cualquier
 * otro: se arrastra, se estira dentro de su tamaño legal y se lleva donde
 * no estorbe.
 *
 * LA NORMA PERMITE MOVERLO, Y LO DICE
 * -----------------------------------
 * El documento técnico de la AEAT sobre el QR pide la esquina superior
 * —centrada en vertical, a la izquierda en apaisado— pero cierra el
 * apartado con la salida: «Si existen obstáculos que hagan inconveniente
 * esa ubicación, puede utilizarse otra ubicación, siempre que el código
 * "QR" sea claramente visible y se distinga de otros códigos "QR"».
 *
 * Por eso el recuadro nace donde manda la especificación —que es el sitio
 * bueno mientras no haya obstáculo— pero no se queda clavado ahí. Lo
 * único que se sigue imponiendo es lo que la norma no negocia: el tamaño
 * entre 30 y 40 mm, el espacio en blanco alrededor y que quepa entero en
 * la hoja. Eso lo comprueba `validarBloqueQr` antes de imprimir.
 */

/** El nombre del campo, tal y como lo busca el generador del PDF. */
export const CLAVE_QR = 'verifactu_qr';

export function esCampoQr(campo: { clave: string | null }): boolean {
  return campo.clave === CLAVE_QR;
}

/**
 * Deja los campos con recuadro de QR, o sin él, según toque.
 *
 * Devuelve la MISMA lista cuando no hay nada que cambiar, para que un
 * cambio de estado en React no repinte el editor sin motivo.
 */
export function asegurarHuecoQr(
  campos: CampoDetectado[],
  pagina: Pick<PaginaExtraida, 'ancho' | 'alto'>,
  debeLlevarlo: boolean,
  nuevoId: () => string,
): CampoDetectado[] {
  const tiene = campos.some(esCampoQr);

  if (!debeLlevarlo) {
    // Un albarán o un presupuesto no llevan QR: si quedaba el recuadro de
    // cuando la plantilla era una factura, se va. Dejarlo sería enseñar en
    // el editor un hueco que no se imprime nunca.
    return tiene ? campos.filter(c => !esCampoQr(c)) : campos;
  }

  if (tiene) return campos;

  // Nace donde manda la especificación: arriba, centrado en vertical y a la
  // izquierda en apaisado. Es la misma geometría que usa el estampado del
  // PDF, así que lo que se ve en el editor y donde acaba el código son el
  // mismo sitio.
  const bloque = componerBloqueQr({ hoja: { ancho: pagina.ancho, alto: pagina.alto } });
  const hueco = campoNuevo(nuevoId(), {
    x: bloque.qr.x, y: bloque.qr.y, ancho: bloque.qr.ancho, alto: bloque.qr.alto,
  });
  hueco.clave = CLAVE_QR;
  hueco.tipo = 'imagen';
  hueco.motivo = 'QR tributario obligatorio. Puedes moverlo si tapa algo del diseño.';

  return [...campos, hueco];
}
