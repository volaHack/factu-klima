/**
 * LOS DATOS DEL PRODUCTOR, COMPROBADOS
 *
 * Lo usan la tarjeta de Administración (para avisar mientras se escribe) y
 * la API que los guarda (para no guardar nada que la AEAT vaya a rechazar
 * de entrada). Sin dependencias de servidor.
 */

import { isValidNif } from '@/lib/validation/nif';

export interface ProductorFormulario {
  nombre: string;
  nif: string;
  domicilio: string;
  email: string;
  soporte_email: string;
  sistema_nombre: string;
  sistema_id: string;
  sistema_version: string;
  lugar: string;
  fecha: string;
}

export type ErroresProductor = Partial<Record<keyof ProductorFormulario, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** DNI o NIE: persona física. */
const PERSONA_FISICA = /^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$/;

export const limpiarNif = (nif: string) => nif.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Qué está mal, campo a campo. Vacío = se puede guardar. */
export function erroresDelProductor(p: ProductorFormulario): ErroresProductor {
  const e: ErroresProductor = {};
  const nif = limpiarNif(p.nif);
  if (nif && !isValidNif(nif)) e.nif = `${nif} no es un NIF válido: revisa la letra.`;
  for (const campo of ['email', 'soporte_email'] as const) {
    if (p[campo].trim() && !EMAIL.test(p[campo].trim())) e[campo] = 'Correo no válido.';
  }
  if (p.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) e.fecha = 'Fecha no válida.';
  if (p.sistema_id.trim() && !/^[A-Za-z0-9]{2}$/.test(p.sistema_id.trim())) e.sistema_id = 'Dos letras o cifras (p. ej. FK).';
  if (p.sistema_nombre.trim().length > 30) e.sistema_nombre = 'Máximo 30 caracteres.';
  return e;
}

/**
 * Avisos que no impiden guardar pero sí harían que la AEAT rechazara el
 * envío (código 1110): con un DNI, el nombre tiene que ser el del censo
 * completo, «APELLIDO1 APELLIDO2 NOMBRE», no sólo el nombre de pila.
 */
export function avisoNombreProductor(p: Pick<ProductorFormulario, 'nombre' | 'nif'>): string | null {
  const nif = limpiarNif(p.nif);
  const palabras = p.nombre.trim().split(/\s+/).filter(Boolean);
  if (PERSONA_FISICA.test(nif) && palabras.length > 0 && palabras.length < 2) {
    return 'Con un DNI o NIE la AEAT espera los apellidos y el nombre tal como figuran en Hacienda (p. ej. «GARCIA LOPEZ ALEXANDER»). Sólo el nombre de pila hace que rechace los envíos.';
  }
  return null;
}

/** Las columnas de `plataforma_config` que salen del formulario. */
export function columnasDelProductor(p: ProductorFormulario) {
  const txt = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : null);
  return {
    productor_nombre: txt(p.nombre, 120),
    productor_nif: limpiarNif(p.nif) || null,
    productor_domicilio: txt(p.domicilio, 300),
    productor_email: txt(p.email, 200),
    soporte_email: txt(p.soporte_email, 200),
    sistema_nombre: txt(p.sistema_nombre, 30) ?? 'FactuKlima',
    sistema_id: txt(p.sistema_id, 2)?.toUpperCase() ?? 'FK',
    sistema_version: txt(p.sistema_version, 50) ?? '1.0',
    declaracion_lugar: txt(p.lugar, 120),
    declaracion_fecha: p.fecha || null,
  };
}

/** Lo que llega por la API, convertido a formulario (todo texto). */
export function productorDesdeJson(v: unknown): ProductorFormulario | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  return {
    nombre: s('nombre'), nif: s('nif'), domicilio: s('domicilio'), email: s('email'), soporte_email: s('soporte_email'),
    sistema_nombre: s('sistema_nombre'), sistema_id: s('sistema_id'), sistema_version: s('sistema_version'),
    lugar: s('lugar'), fecha: s('fecha'),
  };
}
