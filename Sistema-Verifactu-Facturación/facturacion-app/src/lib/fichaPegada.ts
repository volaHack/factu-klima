/**
 * LA FICHA DE UN CLIENTE A PARTIR DE LO QUE SE PEGA
 *
 * Los datos de un cliente nuevo casi siempre llegan escritos: la firma de
 * un correo, un WhatsApp con «te paso los datos para la factura», el pie
 * de un presupuesto. Copiarlos casilla a casilla es lento y es donde se
 * cuela la letra mal del NIF. Aquí se lee ese bloque y se saca lo que
 * tenga: razón social, NIF/CIF/NIE (comprobado con su letra o cifra de
 * control), correo, teléfono, dirección, código postal, municipio,
 * provincia y persona de contacto.
 *
 * Se lee en este orden, de lo más seguro a lo menos:
 *   1. Lo que viene con su rótulo («CIF: …», «Dirección: …», «Tel. …»).
 *   2. Lo que se reconoce por su forma: un correo, un teléfono de nueve
 *      cifras, un NIF, un código postal con su municipio detrás.
 *   3. Lo que se deduce del sitio que ocupa: la línea con «S.L.» es la
 *      razón social; la que va después de «Un saludo,», quien escribe.
 *
 * Nada se aplica sin enseñarlo antes (ver `propuestaDeFicha`), y lo que
 * no se entiende se deja en blanco antes que adivinarlo mal.
 */

import { isValidNif } from './validation/nif';
import { formaJuridicaDelNombre, normalizarNif } from './validation/identidad';
import { esCpValido, municipiosDeCp, provinciaDeCp } from './codigosPostales';
import { PROVINCES } from './constants';

export interface FichaDetectada {
  razonSocial?: string;
  nif?: string;
  /** El NIF tiene su letra o cifra de control bien. */
  nifValido?: boolean;
  email?: string;
  telefono?: string;
  direccion?: string;
  codigoPostal?: string;
  municipio?: string;
  provincia?: string;
  contacto?: string;
}

export type CampoFicha = Exclude<keyof FichaDetectada, 'nifValido'>;

/** Los campos, en el orden del formulario y con su nombre para la vista previa. */
export const CAMPOS_FICHA: readonly { campo: CampoFicha; etiqueta: string }[] = [
  { campo: 'razonSocial', etiqueta: 'Razón social' },
  { campo: 'nif', etiqueta: 'NIF / CIF / NIE' },
  { campo: 'email', etiqueta: 'Correo' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'contacto', etiqueta: 'Persona de contacto' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'codigoPostal', etiqueta: 'Código postal' },
  { campo: 'municipio', etiqueta: 'Municipio' },
  { campo: 'provincia', etiqueta: 'Provincia' },
];

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Los rótulos que se reconocen delante de «:». */
const ROTULOS: readonly { campo: CampoFicha; patron: RegExp }[] = [
  { campo: 'razonSocial', patron: /^(razon social|nombre fiscal|denominacion( social)?|empresa|sociedad|titular|cliente|nombre( y apellidos)?)$/ },
  { campo: 'nif', patron: /^(n\.?\s?i\.?\s?f\.?|c\.?\s?i\.?\s?f\.?|n\.?\s?i\.?\s?e\.?|d\.?\s?n\.?\s?i\.?|nif\s?\/\s?cif|cif\s?\/\s?nif|nif-iva|vat|id\.? fiscal)$/ },
  { campo: 'email', patron: /^(e-?mail|correo( electronico)?|mail)$/ },
  { campo: 'telefono', patron: /^(tel[eé]?f?(ono)?\.?|tlf\.?|tfno\.?|movil|m[oó]vil|telf\.?|tel\.?|whatsapp|fijo)$/ },
  { campo: 'direccion', patron: /^(direccion( fiscal)?|domicilio( fiscal| social)?|dir\.?|calle)$/ },
  { campo: 'codigoPostal', patron: /^(c\.?\s?p\.?|codigo postal|cod\.? postal)$/ },
  { campo: 'municipio', patron: /^(poblacion|localidad|municipio|ciudad)$/ },
  { campo: 'provincia', patron: /^provincia$/ },
  { campo: 'contacto', patron: /^(contacto|persona de contacto|att?\.?|a\/a|atencion|a la atencion de|responsable)$/ },
];

const DESPEDIDAS = /^(un saludo|saludos|atentamente|cordialmente|un abrazo|gracias|muchas gracias|reciba un cordial saludo|quedo a la espera|best regards|regards)\b/;
const SALUDOS = /^(hola|buen[oa]s?( dias| tardes| noches)?|estimad[oa]s?|te paso|os paso|le paso|aqui (tienes|van)|para la factura|mis datos|los datos)\b/;
const CARGOS = /\b(gerente|director[a]?|responsable|encargad[oa]|jef[ea]|departamento|dpto|administracion|compras|contabilidad|propietari[oa]|socio|socia|ceo|administrador[a]?|recepcion)\b/;
const NEGOCIOS = /\b(bar|restaurante|cafeteria|cafe|hotel|hostal|apartamentos|supermercado|super|tienda|comercial|distribuciones|distribuidora|grupo|panaderia|pasteleria|fruteria|carniceria|pescaderia|kiosco|taberna|bodega|guachinche|pizzeria|heladeria|club|asociacion|ayuntamiento|colegio|residencia|catering|ferreteria|farmacia|clinica|taller|autoservicio)\b/;
const CALLES = /^(c\/|c\.\s|calle|cl\.?\s|avda?\.?|avenida|av\.\s|plaza|pza\.?|pl\.\s|paseo|p[ºo]\s|ctra\.?|carretera|camino|urb\.?|urbanizacion|pol(igono|\.)|p\.\s?i\.|parque|traves[ií]a|ronda|rambla|v[ií]a\s|glorieta|barrio|bo\.\s|lugar|edificio|local)/;

const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const RE_TELEFONO = /(?:(?:\+|00)\s?34[\s.-]*)?(?<!\d)[6789](?:[\s.-]*\d){8}(?!\d)/;
const RE_NIF_FORMA = /^(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/;
const RE_CP = /(?<![\d.,])(\d{5})(?![\d.,]\d)/;

/** «928 12 34 56», «+34 600-11-22-33» → «928 123 456» / «600 112 233». */
export function limpiarTelefono(t: string): string {
  const cifras = t.replace(/\D/g, '').replace(/^(0034|34)(?=[6789]\d{8}$)/, '');
  return cifras.length === 9 ? `${cifras.slice(0, 3)} ${cifras.slice(3, 6)} ${cifras.slice(6)}` : t.trim();
}

/** Los NIF que hay en un texto, normalizados: los válidos primero. */
export function nifsEnTexto(texto: string): { nif: string; valido: boolean }[] {
  const vistos = new Set<string>();
  const res: { nif: string; valido: boolean }[] = [];
  // Una letra o cifra, luego cifras con puntos, guiones o espacios, y la
  // letra o cifra de control: «B-35.123.454», «12345678-Z», «ESB35123454».
  const trozos = texto.toUpperCase().match(/(?<![A-Z0-9])(?:ES)?[A-Z0-9](?:[\s.-]?\d){7}[\s.-]?[A-Z0-9](?![A-Z0-9])/g) ?? [];
  for (const t of trozos) {
    const n = normalizarNif(t).replace(/^ES(?=[A-Z0-9]{9}$)/, '');
    if (!RE_NIF_FORMA.test(n) || vistos.has(n)) continue;
    vistos.add(n);
    res.push({ nif: n, valido: isValidNif(n) });
  }
  return res.sort((a, b) => Number(b.valido) - Number(a.valido));
}

/** «LAS PALMAS» o «S/C de Tenerife» → la provincia como la escribe el formulario. */
export function provinciaDelTexto(t: string): string | null {
  const p = plano(t).replace(/[()]/g, '').replace(/^s\/?\s?c\.?\s+de\s+/, 'santa cruz de ').trim();
  if (!p) return null;
  if (p === 'tenerife') return 'Santa Cruz de Tenerife';
  if (p === 'gran canaria' || p === 'lanzarote' || p === 'fuerteventura') return 'Las Palmas';
  if (p === 'la palma' || p === 'la gomera' || p === 'el hierro') return 'Santa Cruz de Tenerife';
  return PROVINCES.find(x => plano(x) === p) ?? null;
}

/** Quita lo que no es el dato: comillas de correo citado, viñetas y espacios de más. */
function lineasDe(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split('\n')
    .flatMap(l => l.split(/\s+[|·•]\s+|\s{3,}/))
    .map(l => l.replace(/^[>\s*•·\-–]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Sin la coma o el punto final, salvo el de una abreviatura («S.L.»). */
const capital = (t: string) => t.replace(/\s*[,;]\s*$/, '').replace(/(?<!\b[A-Za-z])\.\s*$/, '').trim();

/** Lo que va detrás del código postal: «Arrecife (Las Palmas)», «Telde - Gran Canaria». */
function lugarTrasCp(resto: string): { municipio?: string; provincia?: string } {
  const r = resto.replace(/^[\s,.\-–]+/, '').trim();
  if (!r) return {};
  const parentesis = r.match(/^([^()]+?)\s*\(([^)]+)\)/);
  if (parentesis) return { municipio: capital(parentesis[1]), provincia: provinciaDelTexto(parentesis[2]) ?? undefined };
  const [primero, ...demas] = r.split(/\s*[,\-–/]\s*/).filter(Boolean);
  const provincia = demas.map(provinciaDelTexto).find(Boolean) ?? undefined;
  return { municipio: primero ? capital(primero) : undefined, provincia };
}

/**
 * ¿Parece el nombre de una persona? Dos a cuatro palabras con mayúscula,
 * sin cifras, sin forma jurídica y sin nombre de negocio.
 */
function pareceNombreDePersona(l: string): boolean {
  if (/[\d@:/]/.test(l) || formaJuridicaDelNombre(l.toUpperCase()) || NEGOCIOS.test(plano(l)) || CARGOS.test(plano(l))) return false;
  const palabras = l.split(' ');
  if (palabras.length < 2 || palabras.length > 5) return false;
  return palabras.every(p => /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'-]+$/.test(p) || /^(de|del|la|las|los|y)$/.test(p));
}

/** Lee el bloque pegado y saca lo que haya. */
export function leerFichaPegada(texto: string): FichaDetectada {
  const lineas = lineasDe(texto);
  const ficha: FichaDetectada = {};
  /** Las líneas ya usadas para algo: no sirven de razón social ni de contacto. */
  const usadas = new Set<number>();

  // 1. Con rótulo.
  lineas.forEach((l, i) => {
    const m = l.match(/^([^:]{1,30}?)\s*[:=]\s*(.+)$/);
    if (!m) return;
    const rotulo = plano(m[1]);
    const valor = m[2].trim();
    const r = ROTULOS.find(x => x.patron.test(rotulo));
    if (!r) return;
    usadas.add(i);
    if (r.campo === 'nif') {
      const n = nifsEnTexto(valor)[0];
      if (n && !ficha.nif) { ficha.nif = n.nif; ficha.nifValido = n.valido; }
      return;
    }
    if (r.campo === 'telefono') {
      const t = valor.match(RE_TELEFONO);
      if (t && !ficha.telefono) ficha.telefono = limpiarTelefono(t[0]);
      return;
    }
    if (r.campo === 'email') {
      const e = valor.match(RE_EMAIL);
      if (e && !ficha.email) ficha.email = e[0].toLowerCase();
      return;
    }
    if (r.campo === 'codigoPostal') {
      const cp = valor.match(RE_CP);
      if (cp && esCpValido(cp[1]) && !ficha.codigoPostal) {
        ficha.codigoPostal = cp[1];
        const lugar = lugarTrasCp(valor.slice((cp.index ?? 0) + 5));
        if (lugar.municipio && !ficha.municipio) ficha.municipio = lugar.municipio;
        if (lugar.provincia && !ficha.provincia) ficha.provincia = lugar.provincia;
      }
      return;
    }
    if (r.campo === 'provincia') {
      ficha.provincia ??= provinciaDelTexto(valor) ?? capital(valor);
      return;
    }
    if (r.campo === 'direccion') {
      // «Dirección: C/ Real 5, 35500 Arrecife»: el código y el municipio, aparte.
      const cp = valor.match(RE_CP);
      if (cp && esCpValido(cp[1])) {
        ficha.direccion ??= capital(valor.slice(0, cp.index));
        ficha.codigoPostal ??= cp[1];
        const lugar = lugarTrasCp(valor.slice((cp.index ?? 0) + 5));
        if (lugar.municipio) ficha.municipio ??= lugar.municipio;
        if (lugar.provincia) ficha.provincia ??= lugar.provincia;
      } else {
        ficha.direccion ??= capital(valor);
      }
      return;
    }
    if (!ficha[r.campo]) ficha[r.campo] = capital(valor);
  });

  // 2. Por su forma, en lo que queda.
  lineas.forEach((l, i) => {
    let resto = l;
    const e = resto.match(RE_EMAIL);
    if (e) {
      ficha.email ??= e[0].toLowerCase();
      resto = resto.replace(e[0], ' ');
      usadas.add(i);
    }
    // Las webs no son de la ficha, pero tampoco razón social.
    if (/\b(www\.|https?:\/\/)\S+/i.test(resto)) {
      resto = resto.replace(/\b(www\.|https?:\/\/)\S+/gi, ' ');
      usadas.add(i);
    }
    const t = resto.match(RE_TELEFONO);
    if (t) {
      ficha.telefono ??= limpiarTelefono(t[0]);
      resto = resto.replace(t[0], ' ');
      usadas.add(i);
    }
    const n = nifsEnTexto(resto)[0];
    if (n) {
      if (!ficha.nif || (!ficha.nifValido && n.valido)) { ficha.nif = n.nif; ficha.nifValido = n.valido; }
      usadas.add(i);
      return;
    }
    if (usadas.has(i)) return;
    const cp = resto.match(RE_CP);
    if (cp && esCpValido(cp[1])) {
      usadas.add(i);
      ficha.codigoPostal ??= cp[1];
      const antes = capital(resto.slice(0, cp.index).replace(/\b(c\.?\s?p\.?|codigo postal)\s*$/i, ''));
      const lugar = lugarTrasCp(resto.slice((cp.index ?? 0) + 5));
      if (lugar.municipio) ficha.municipio ??= lugar.municipio;
      if (lugar.provincia) ficha.provincia ??= lugar.provincia;
      // «C/ Real 5, 35500 Arrecife»: lo de delante es la dirección.
      if (antes && /[a-z]/i.test(antes)) ficha.direccion ??= antes;
      return;
    }
    if (CALLES.test(plano(resto)) && /\d/.test(resto)) {
      ficha.direccion ??= capital(resto);
      usadas.add(i);
    }
  });

  // 3. Por el sitio que ocupa.
  const libres = lineas
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => !usadas.has(i) && !SALUDOS.test(plano(l)) && !/\d{3,}/.test(l));

  if (!ficha.razonSocial) {
    const conForma = libres.find(({ l }) => formaJuridicaDelNombre(l.toUpperCase()));
    const deNegocio = libres.find(({ l }) => NEGOCIOS.test(plano(l)) && !DESPEDIDAS.test(plano(l)));
    const elegida = conForma ?? deNegocio;
    if (elegida) {
      ficha.razonSocial = capital(elegida.l);
      usadas.add(elegida.i);
    }
  }

  if (!ficha.contacto) {
    // Quien firma: la línea que sigue a la despedida, o la primera que
    // parezca un nombre de persona.
    const despedida = lineas.findIndex(l => DESPEDIDAS.test(plano(l)));
    const trasDespedida = despedida >= 0 ? libres.find(({ i }) => i > despedida && !usadas.has(i)) : undefined;
    const elegida = trasDespedida && pareceNombreDePersona(trasDespedida.l)
      ? trasDespedida
      : libres.find(({ l, i }) => !usadas.has(i) && pareceNombreDePersona(l));
    if (elegida) {
      ficha.contacto = capital(elegida.l);
      usadas.add(elegida.i);
    }
  }

  // Lo que dice el código postal manda sobre la provincia; en Canarias,
  // con un solo municipio posible, también lo pone.
  if (ficha.codigoPostal) {
    const provincia = provinciaDeCp(ficha.codigoPostal);
    if (provincia) ficha.provincia = provincia;
    const municipios = municipiosDeCp(ficha.codigoPostal);
    if (!ficha.municipio && municipios.length === 1) ficha.municipio = municipios[0];
  }

  // Nada vacío en el resultado.
  for (const k of Object.keys(ficha) as (keyof FichaDetectada)[]) {
    if (ficha[k] === '' || ficha[k] === undefined) delete ficha[k];
  }
  return ficha;
}

export interface FilaPropuesta {
  campo: CampoFicha;
  etiqueta: string;
  valor: string;
  /** Lo que hay ahora en esa casilla, si hay algo distinto. */
  actual?: string;
  /** Si se aplica sin tocar nada: sí cuando la casilla está vacía. */
  marcada: boolean;
  aviso?: string;
}

/**
 * Lo que se enseña antes de aplicar: cada dato encontrado con lo que hay
 * ahora en su casilla. Lo que iría a una casilla vacía va marcado; lo que
 * cambiaría algo ya escrito se enseña pero sin marcar, para que lo decida
 * quien rellena la ficha. Lo que ya está igual no se repite.
 */
export function propuestaDeFicha(detectada: FichaDetectada, actual: Partial<Record<CampoFicha, string>>): FilaPropuesta[] {
  const filas: FilaPropuesta[] = [];
  for (const { campo, etiqueta } of CAMPOS_FICHA) {
    const valor = detectada[campo];
    if (!valor) continue;
    const ahora = (actual[campo] ?? '').trim();
    if (plano(ahora) === plano(valor)) continue;
    filas.push({
      campo,
      etiqueta,
      valor,
      ...(ahora ? { actual: ahora } : {}),
      marcada: !ahora,
      ...(campo === 'nif' && detectada.nifValido === false
        ? { aviso: 'La letra o cifra de control no cuadra: revísalo antes de guardar.' }
        : {}),
    });
  }
  return filas;
}
