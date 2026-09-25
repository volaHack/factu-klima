/**
 * ¿ESTE CERTIFICADO PUEDE ENVIAR LAS FACTURAS DE ESTE NIF?
 *
 * La AEAT sólo acepta un envío si el certificado es del propio obligado
 * tributario (o de un representante dado de alta, que el programa todavía
 * no contempla). Con otro NIF, el envío entero se rechaza en la cabecera
 * (código 4104) y el registro se queda atascado: su huella ya lleva el NIF
 * dentro y no se puede corregir. Por eso se mira ANTES de activar y de
 * enviar, no después.
 *
 * El titular puede traer más de un NIF: los certificados de representante
 * de persona jurídica llevan el DNI de quien representa y el CIF de la
 * empresa (organizationIdentifier=VATES-B…). Vale si el de la empresa es
 * cualquiera de ellos.
 *
 * Sin dependencias de servidor: lo usan la pantalla y el envío.
 */

const NIF_EN_TEXTO = /(?:^|[^0-9A-Z])([0-9XYZ][0-9]{7}[A-Z]|[A-HJNPQRSUVW][0-9]{7}[0-9A-J])(?![0-9A-Z])/g;

/** Todos los NIF que aparecen en un texto (el «subject» del certificado), sin repetir. */
export function nifsEnTexto(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const vistos = new Set<string>();
  for (const m of texto.toUpperCase().matchAll(NIF_EN_TEXTO)) vistos.add(m[1]);
  return [...vistos];
}

/**
 * `true` si el certificado es de ese NIF, `false` si claramente es de
 * otro, `null` si no se puede saber (el titular no trae ningún NIF, o la
 * empresa todavía no tiene NIF puesto): en la duda no se bloquea.
 */
export function certificadoValeParaNif(subject: string | null | undefined, nifEmpresa: string | null | undefined): boolean | null {
  const nif = nifEmpresa?.replace(/[\s-]/g, '').toUpperCase();
  const delCertificado = nifsEnTexto(subject);
  if (!nif || delCertificado.length === 0) return null;
  return delCertificado.includes(nif);
}

/** El mensaje que se enseña cuando no coinciden. */
export function avisoNifDistinto(subject: string | null | undefined, nifEmpresa: string): string {
  const delCertificado = nifsEnTexto(subject);
  return `El certificado es de ${delCertificado.join(' / ')} y en Ajustes tus facturas las emite ${nifEmpresa.toUpperCase()}. `
    + 'La AEAT rechaza el envío si no coinciden. Pon en Ajustes el NIF y el nombre fiscal del titular del certificado '
    + '(tal como constan en Hacienda) antes de emitir, o sube el certificado de la empresa que factura.';
}
