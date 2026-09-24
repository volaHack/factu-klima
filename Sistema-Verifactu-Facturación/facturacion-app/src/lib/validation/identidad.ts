/**
 * ¿EL NIF Y EL NOMBRE SON DE LA MISMA PERSONA? — y todo lo que se mira
 * antes de emitir, porque una factura emitida ya no se puede tocar.
 *
 * Aquí va lo que se puede comprobar SIN conexión, con reglas que no dan
 * falsos positivos:
 *
 *  1. Que el NIF exista como tal: formato y letra o cifra de control.
 *  2. Que el tipo de NIF cuadre con el nombre. La primera letra del NIF de
 *     una persona jurídica dice qué es (B = limitada, A = anónima…), y la
 *     Ley de Sociedades de Capital obliga a que la denominación lleve la
 *     forma («S.L.», «S.A.»). Un DNI con «S.L.» en el nombre, o una «S.A.»
 *     con un NIF que empieza por B, es un dato mal puesto seguro.
 *  3. Lo que exige el art. 6 del Reglamento de facturación en una factura
 *     completa: nombre, NIF y domicilio de quien emite y de quien recibe.
 *
 * Si el NIF corresponde de verdad a ESE nombre sólo lo sabe la AEAT: eso
 * lo comprueba `/api/verifactu/comprobar-nif` contra el censo, con el
 * certificado de la empresa. Este módulo es la primera criba, y la que
 * funciona siempre, con o sin certificado y con o sin red.
 */

import { detectNifType, isValidNif, tipoDeEntidad } from './nif';
import { validarVatNumber } from '../intracomunitarias';

export type Gravedad = 'error' | 'aviso';

export interface ProblemaIdentidad {
  gravedad: Gravedad;
  campo: 'nif' | 'nombre' | 'domicilio' | 'vat';
  mensaje: string;
}

/** Quita todo lo que no sea letra o cifra y pasa a mayúsculas. */
export function normalizarNif(nif: string | undefined | null): string {
  return (nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * La forma jurídica que declara el propio nombre, si declara alguna.
 * Se mira el final del nombre y las formas escritas enteras; con puntos,
 * sin puntos o con espacios («S.L.», «SL», «S. L. U.»).
 */
export type FormaJuridica =
  | 'SL' | 'SA' | 'COOP' | 'CB' | 'SC' | 'SAT' | 'UTE' | 'ASOCIACION' | 'FUNDACION'
  | 'COM_PROPIETARIOS' | 'AYUNTAMIENTO' | 'COLECTIVA' | 'COMANDITARIA';

const FORMAS: { forma: FormaJuridica; patron: RegExp }[] = [
  { forma: 'SL', patron: /\b(S\s*\.?\s*L\s*\.?\s*(U|L|P|NE)?\s*\.?|SOCIEDAD\s+(DE\s+RESPONSABILIDAD\s+)?LIMITADA(\s+(UNIPERSONAL|LABORAL|PROFESIONAL|NUEVA\s+EMPRESA))?)\s*$/ },
  { forma: 'SA', patron: /\b(S\s*\.?\s*A\s*\.?\s*(U|L|D)?\s*\.?|SOCIEDAD\s+AN[OÓ]NIMA(\s+(UNIPERSONAL|LABORAL|DEPORTIVA))?)\s*$/ },
  { forma: 'COOP', patron: /\b(S\s*\.?\s*COOP\s*\.?(\s*(AND|V|MAD|GALEGA|[A-Z]{1,6})\s*\.?)?|SOCIEDAD\s+COOPERATIVA|COOPERATIVA)\b/ },
  { forma: 'SAT', patron: /\b(S\s*\.?\s*A\s*\.?\s*T\s*\.?|SOCIEDAD\s+AGRARIA\s+DE\s+TRANSFORMACI[OÓ]N)\s*(N\s*[ºO°]?\s*\d+)?\s*$/ },
  { forma: 'CB', patron: /\b(C\s*\.?\s*B\s*\.?|COMUNIDAD\s+DE\s+BIENES)\s*$/ },
  { forma: 'SC', patron: /\b(S\s*\.?\s*C\s*\.?(\s*P\s*\.?)?|SOCIEDAD\s+CIVIL(\s+PRIVADA)?)\s*$/ },
  { forma: 'UTE', patron: /\b(U\s*\.?\s*T\s*\.?\s*E\s*\.?|UNI[OÓ]N\s+TEMPORAL\s+DE\s+EMPRESAS)\b/ },
  { forma: 'COLECTIVA', patron: /\b(S\s*\.?\s*R\s*\.?\s*C\s*\.?|SOCIEDAD\s+COLECTIVA)\s*$/ },
  { forma: 'COMANDITARIA', patron: /\b(S\s*\.?\s*COM\s*\.?(\s*P\s*\.?\s*A\s*\.?)?|SOCIEDAD\s+COMANDITARIA)\b/ },
  { forma: 'COM_PROPIETARIOS', patron: /\b(COMUNIDAD\s+(DE\s+)?PROPIETARIOS|C\s*\.?\s*P\s*\.?\s*$|CDAD\s*\.?\s+PROP)/ },
  { forma: 'ASOCIACION', patron: /\b(ASOCIACI[OÓ]N|ASSOCIACI[OÓ]|ELKARTEA|FEDERACI[OÓ]N)\b/ },
  { forma: 'FUNDACION', patron: /\b(FUNDACI[OÓ]N?|FUNDAZIOA)\b/ },
  { forma: 'AYUNTAMIENTO', patron: /\b(AYUNTAMIENTO|AJUNTAMENT|CONCELLO|UDALA|DIPUTACI[OÓ]N|CABILDO|CONSELL\s+INSULAR|MANCOMUNIDAD)\b/ },
];

export function formaJuridicaDelNombre(nombre: string): FormaJuridica | null {
  const n = ` ${(nombre ?? '').toUpperCase().replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim()}`;
  for (const { forma, patron } of FORMAS) if (patron.test(n)) return forma;
  return null;
}

/** Formas societarias: las que nunca puede tener una persona física. */
const SOCIETARIAS: FormaJuridica[] = ['SL', 'SA', 'COOP', 'SAT', 'UTE', 'COLECTIVA', 'COMANDITARIA'];

/** Qué letra de NIF corresponde a cada forma, cuando la ley la fija. */
const LETRA_DE_FORMA: Partial<Record<FormaJuridica, string[]>> = {
  SA: ['A'],
  SL: ['B'],
  COLECTIVA: ['C'],
  COMANDITARIA: ['D'],
  CB: ['E'],
  COOP: ['F'],
  // Las asociaciones y fundaciones son G; algunas religiosas, R.
  ASOCIACION: ['G', 'R'],
  FUNDACION: ['G', 'R'],
  COM_PROPIETARIOS: ['H'],
  SC: ['J'],
  AYUNTAMIENTO: ['P', 'Q', 'S'],
  UTE: ['U'],
  // La SAT tiene NIF de la letra V.
  SAT: ['V'],
};

const NOMBRE_FORMA: Record<FormaJuridica, string> = {
  SL: 'sociedad limitada (S.L.)', SA: 'sociedad anónima (S.A.)', COOP: 'cooperativa',
  CB: 'comunidad de bienes (C.B.)', SC: 'sociedad civil (S.C.)', SAT: 'sociedad agraria de transformación',
  UTE: 'unión temporal de empresas', ASOCIACION: 'asociación', FUNDACION: 'fundación',
  COM_PROPIETARIOS: 'comunidad de propietarios', AYUNTAMIENTO: 'administración local',
  COLECTIVA: 'sociedad colectiva', COMANDITARIA: 'sociedad comanditaria',
};

/**
 * ¿Cuadran el NIF y el nombre? Sólo lo que se puede afirmar sin consultar
 * a nadie. `quien` sólo cambia el texto («el cliente» / «tu empresa»).
 */
/** «de el cliente» → «del cliente». */
const de = (quien: string) => (quien.startsWith('el ') ? `del ${quien.slice(3)}` : `de ${quien}`);

export function comprobarNifYNombre(
  nifBruto: string | undefined | null,
  nombreBruto: string | undefined | null,
  quien = 'el cliente',
): ProblemaIdentidad[] {
  const problemas: ProblemaIdentidad[] = [];
  const nif = normalizarNif(nifBruto);
  const nombre = (nombreBruto ?? '').trim();

  if (!nombre) {
    problemas.push({ gravedad: 'error', campo: 'nombre', mensaje: `Falta el nombre o la razón social ${de(quien)}.` });
  }
  if (!nif) {
    problemas.push({ gravedad: 'error', campo: 'nif', mensaje: `Falta el NIF ${de(quien)}.` });
    return problemas;
  }

  const tipo = detectNifType(nif);
  if (tipo === 'UNKNOWN') {
    problemas.push({
      gravedad: 'error', campo: 'nif',
      mensaje: `El NIF ${de(quien)} (${nif}) no tiene un formato válido: DNI (8 cifras y letra), NIE (X, Y o Z, 7 cifras y letra) o NIF de empresa (letra, 7 cifras y control).`,
    });
    return problemas;
  }
  if (!isValidNif(nif)) {
    problemas.push({
      gravedad: 'error', campo: 'nif',
      mensaje: `El NIF ${de(quien)} (${nif}) está mal: la ${tipo === 'CIF' ? 'cifra o letra' : 'letra'} de control no corresponde. Suele ser una cifra cambiada.`,
    });
    return problemas;
  }
  if (!nombre) return problemas;

  const forma = formaJuridicaDelNombre(nombre);
  const esPersona = tipo === 'NIF' || tipo === 'NIE';

  // «Sa» es también un apellido (María Sa): sin puntos no basta para
  // afirmar que es una anónima.
  const saSinPuntos = forma === 'SA' && /\bSA\s*$/i.test(nombre);
  if (esPersona && forma && SOCIETARIAS.includes(forma) && !saSinPuntos) {
    problemas.push({
      gravedad: 'error', campo: 'nif',
      mensaje: `«${nombre}» es una ${NOMBRE_FORMA[forma]}, pero ${nif} es el NIF de una persona física. La empresa tiene su propio NIF (empieza por letra): usa ese, o pon el nombre de la persona si le facturas a ella.`,
    });
    return problemas;
  }

  if (tipo === 'CIF' && forma) {
    const letras = LETRA_DE_FORMA[forma];
    const letra = nif[0];
    if (letras && !letras.includes(letra)) {
      // Anónima frente a limitada (y viceversa) es contradicción segura;
      // el resto de formas admiten más casos, así que avisan.
      const segura = (forma === 'SA' && letra === 'B') || (forma === 'SL' && letra === 'A');
      problemas.push({
        gravedad: segura ? 'error' : 'aviso', campo: 'nif',
        mensaje: `El nombre dice ${NOMBRE_FORMA[forma]}, pero un NIF que empieza por ${letra} es de una ${tipoDeEntidad(nif) ?? 'entidad de otro tipo'}. Uno de los dos está mal.`,
      });
    }
  }

  if (tipo === 'CIF' && !forma && (nif[0] === 'A' || nif[0] === 'B')) {
    problemas.push({
      gravedad: 'aviso', campo: 'nombre',
      mensaje: `${nif} es de una ${tipoDeEntidad(nif)}, y su razón social tiene que llevar «${nif[0] === 'A' ? 'S.A.' : 'S.L.'}». «${nombre}» parece el nombre comercial: en la factura va la razón social tal como está en Hacienda.`,
    });
  }

  return problemas;
}

// ------------------------------------------------------------------
// Antes de emitir
// ------------------------------------------------------------------

export interface EmisorAEmitir {
  businessName?: string;
  nif?: string;
  address?: string;
}

export interface FacturaParaComprobar {
  clientName?: string;
  clientNif?: string;
  clientAddress?: string;
  clientVatNumber?: string;
  esIntracomunitaria?: boolean;
  /** F1 completa, F2 simplificada… Sin valor: completa si identifica al cliente. */
  tipoFacturaFiscal?: string;
  /** Viene del TPV: ticket simplificado salvo que identifique al cliente. */
  posSessionId?: string;
}

/** ¿El país de la ficha es España (o no está puesto)? */
export function esClienteEspanol(pais?: string | null): boolean {
  const p = (pais ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return !p || p === 'ES' || p === 'ESPANA' || p === 'SPAIN' || p === 'ESP';
}

/**
 * Todo lo que tiene que estar bien para emitir. Los errores impiden
 * emitir; los avisos se enseñan y se deja seguir.
 *
 * `paisCliente` es el de la ficha: a un cliente de fuera de España no se
 * le pide un NIF español (lleva su identificador del país o su NIF-IVA).
 */
export function problemasParaEmitir(
  factura: FacturaParaComprobar,
  emisor: EmisorAEmitir | null,
  paisCliente?: string | null,
): ProblemaIdentidad[] {
  const problemas: ProblemaIdentidad[] = [];

  // Quien emite: sin su NIF bien, TODAS las facturas salen mal.
  for (const p of comprobarNifYNombre(emisor?.nif, emisor?.businessName, 'tu empresa')) {
    problemas.push({ ...p, mensaje: `${p.mensaje} Corrígelo en Ajustes.` });
  }
  const nif = normalizarNif(factura.clientNif);
  const vat = normalizarNif(factura.clientVatNumber);
  const simplificada = factura.tipoFacturaFiscal === 'F2' || factura.tipoFacturaFiscal === 'R5'
    || (!!factura.posSessionId && !nif && !vat);

  // El domicilio de quien emite lo pide la factura completa (art. 6); la
  // simplificada y el ticket, no (art. 7).
  if (!simplificada && (nif || vat) && !emisor?.address?.trim()) {
    problemas.push({ gravedad: 'error', campo: 'domicilio', mensaje: 'Falta el domicilio fiscal de tu empresa en Ajustes: tiene que salir en cada factura completa.' });
  }

  // Un ticket o una simplificada sin datos del cliente no necesitan más.
  if (simplificada && !nif && !vat) return problemas;
  if (factura.posSessionId && !nif && !vat) return problemas;
  // Sin NIF y sin tipo decidido: lo resuelve tipoFiscalAlEmitir (simplificada
  // hasta 400 € o error). Aquí no se repite.
  if (!nif && !vat) return problemas;

  if (factura.esIntracomunitaria || (vat && !nif)) {
    const v = validarVatNumber(vat);
    if (!v.valido) {
      problemas.push({ gravedad: 'error', campo: 'vat', mensaje: `El NIF-IVA del cliente (${vat || 'vacío'}) no es válido: ${v.error ?? 'formato incorrecto'}` });
    }
    if (!factura.clientName?.trim()) {
      problemas.push({ gravedad: 'error', campo: 'nombre', mensaje: 'Falta el nombre del cliente.' });
    }
  } else if (esClienteEspanol(paisCliente)) {
    problemas.push(...comprobarNifYNombre(nif, factura.clientName));
  } else if (!factura.clientName?.trim()) {
    problemas.push({ gravedad: 'error', campo: 'nombre', mensaje: 'Falta el nombre del cliente.' });
  }

  // Factura completa: el domicilio del cliente es obligatorio (art. 6 RD 1619/2012).
  if (!simplificada && !factura.clientAddress?.trim()) {
    problemas.push({ gravedad: 'error', campo: 'domicilio', mensaje: 'Falta el domicilio del cliente. En una factura completa es obligatorio: ponlo en su ficha.' });
  }

  return problemas;
}

/** El primer error, en una frase, para lanzarlo como excepción. */
export function resumenDeErrores(problemas: ProblemaIdentidad[]): string | null {
  const errores = problemas.filter(p => p.gravedad === 'error');
  if (errores.length === 0) return null;
  const cabeza = 'No se puede emitir: una factura emitida ya no se puede cambiar, así que antes hay que corregir esto. ';
  return cabeza + errores.map(e => e.mensaje).join(' ');
}
