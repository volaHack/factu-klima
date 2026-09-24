/**
 * UN GASTO A PARTIR DE LA FOTO DEL TICKET
 *
 * El modelo lee la foto y devuelve los datos en JSON; aquí se le dice qué
 * buscar y, sobre todo, se desconfía de lo que devuelve. Un modelo que lee
 * mal un 1 por un 7 no avisa, así que:
 *
 *  - las cuentas tienen que cuadrar (base + cuota = total); si no cuadran
 *    se rehacen desde el total, que es lo que se lee con más seguridad;
 *  - el tipo de IVA tiene que ser uno que exista;
 *  - el NIF sólo se da si pasa la letra de control;
 *  - la fecha tiene que ser una fecha, y no del futuro.
 *
 * Lo que no se sabe se deja vacío, y la persona lo revisa en el formulario
 * antes de guardar: nunca se guarda un gasto sin que nadie lo vea.
 */

import { isValidNif } from '../validation/nif';
import type { GastoCategoria } from '../types';

export interface DatosTicket {
  proveedor?: string;
  nif?: string;
  fecha?: string;
  concepto?: string;
  categoria: GastoCategoria;
  base: number;
  tipo: number;
  cuota: number;
  total: number;
  /** Avisos para la persona: lo que no se ha podido leer bien. */
  avisos: string[];
}

const TIPOS_IVA = [0, 4, 5, 10, 21];
const TIPOS_IGIC = [0, 3, 5, 7, 9.5, 15];
const CATEGORIAS: GastoCategoria[] = ['alquiler', 'suministros', 'personal', 'vehiculo', 'material', 'servicios', 'impuestos', 'seguros', 'otros'];

export function instruccionesTicket(igic: boolean, hoy: string): string {
  const imp = igic ? 'IGIC' : 'IVA';
  return [
    `Eres un asistente contable español. La imagen es un ticket o una factura de un GASTO de una empresa. Hoy es ${hoy}.`,
    'Lee sólo lo que aparece en la imagen. No inventes nada: si un dato no se ve o no se lee bien, déjalo vacío o a 0.',
    'Devuelve SOLO un objeto JSON con estas claves:',
    '  "proveedor": nombre del comercio o empresa que emite el ticket (texto)',
    '  "nif": su NIF/CIF tal como aparece, sin espacios (texto, vacío si no aparece)',
    '  "fecha": fecha del ticket en formato AAAA-MM-DD (texto)',
    '  "concepto": qué se ha comprado, en pocas palabras (texto, máximo 60 caracteres)',
    `  "categoria": una de ${CATEGORIAS.join(', ')}`,
    `  "base": base imponible total en euros, sin ${imp} (número)`,
    `  "tipo": el tipo de ${imp} en % (número). Si hay varios tipos, el que tenga más base.`,
    `  "cuota": la cuota de ${imp} total en euros (número)`,
    '  "total": el importe total pagado en euros (número)',
    'Los importes con punto decimal (12.50), sin símbolo de moneda.',
    'Si el ticket sólo trae el total con impuestos incluidos, pon el total y el tipo, y deja base y cuota a 0.',
  ].join('\n');
}

export const ESQUEMA_TICKET = {
  type: 'OBJECT',
  properties: {
    proveedor: { type: 'STRING' },
    nif: { type: 'STRING' },
    fecha: { type: 'STRING' },
    concepto: { type: 'STRING' },
    categoria: { type: 'STRING', enum: CATEGORIAS },
    base: { type: 'NUMBER' },
    tipo: { type: 'NUMBER' },
    cuota: { type: 'NUMBER' },
    total: { type: 'NUMBER' },
  },
  required: ['total'],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function numero(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.replace(/[€\s]/g, '');
    const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Lo que devuelve el modelo, pasado por el filtro. `crudo` es el texto JSON. */
export function interpretarTicket(crudo: string, igic: boolean, hoy: string): DatosTicket {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(crudo);
  } catch {
    const m = /\{[\s\S]*\}/.exec(crudo);
    if (!m) throw new Error('No se ha podido leer el ticket.');
    d = JSON.parse(m[0]);
  }
  const avisos: string[] = [];
  const tipos = igic ? TIPOS_IGIC : TIPOS_IVA;
  const imp = igic ? 'IGIC' : 'IVA';

  let total = r2(Math.abs(numero(d.total)));
  let base = r2(Math.abs(numero(d.base)));
  let cuota = r2(Math.abs(numero(d.cuota)));
  let tipo = numero(d.tipo);

  // Un tipo que no existe: el más cercano que sí, si se puede deducir de base y cuota.
  if (!tipos.includes(tipo)) {
    const deducido = base > 0 ? (cuota / base) * 100 : tipo;
    const cercano = tipos.reduce((a, b) => (Math.abs(b - deducido) < Math.abs(a - deducido) ? b : a), tipos[tipos.length - 1]);
    if (Math.abs(cercano - deducido) <= 1.5) tipo = cercano;
    else { tipo = igic ? 7 : 21; avisos.push(`No se lee el tipo de ${imp}: se ha puesto el general. Revísalo.`); }
  }

  if (!total && base) total = r2(base + cuota);
  if (!total) avisos.push('No se lee el total. Escríbelo a mano.');

  // Que cuadre. Manda el total: es la cifra más grande y la que más se ve.
  if (total && Math.abs(base + cuota - total) > 0.02) {
    if (base || cuota) avisos.push('La base y la cuota leídas no sumaban el total: se han recalculado desde el total.');
    base = r2(total / (1 + tipo / 100));
    cuota = r2(total - base);
  }

  let nif = texto(d.nif, 20).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES/, '');
  if (nif && !isValidNif(nif)) {
    avisos.push(`El NIF leído (${nif}) no es válido: puede estar mal leído.`);
    nif = '';
  }

  let fecha = texto(d.fecha, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    if (fecha) avisos.push('No se entiende la fecha del ticket: se ha dejado la de hoy.');
    fecha = '';
  } else if (fecha > hoy) {
    avisos.push('La fecha leída es del futuro: se ha dejado la de hoy.');
    fecha = '';
  }

  const cat = texto(d.categoria, 20).toLowerCase() as GastoCategoria;
  return {
    proveedor: texto(d.proveedor, 80) || undefined,
    nif: nif || undefined,
    fecha: fecha || undefined,
    concepto: texto(d.concepto, 60) || undefined,
    categoria: CATEGORIAS.includes(cat) ? cat : 'otros',
    base, tipo, cuota, total, avisos,
  };
}
