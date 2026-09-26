/**
 * VARIAS EMPRESAS — LO QUE NO NECESITA BASE DE DATOS
 *
 * Reglas puras del grupo de empresas, aparte para poder probarlas.
 */

/** Tope de empresas por grupo: de sobra para una persona o una gestoría pequeña. */
export const MAX_EMPRESAS = 10;

/** Minutos que vale un código para unir una cuenta que ya existe. */
export const MINUTOS_CODIGO = 15;

/** Sin letras que se confundan al dictarlas (0/O, 1/I/L). */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Un código tipo «K7PM-3QXA» a partir de bytes aleatorios. */
export function codigoDesdeBytes(bytes: Uint8Array): string {
  let c = '';
  for (let i = 0; i < 8; i++) c += ALFABETO[bytes[i] % ALFABETO.length];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Lo que escribe la persona, a la forma guardada; null si no puede ser un código. */
export function normalizarCodigo(entrada: string): string | null {
  const limpio = entrada.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.length !== 8 || [...limpio].some(ch => !ALFABETO.includes(ch))) return null;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

/**
 * El correo de la cuenta de una empresa nueva: el del titular con una
 * etiqueta (nombre+empresa-xxxx@dominio). Así los avisos de esa cuenta
 * (recibos del plan, por ejemplo) le llegan a él, y no choca con nadie.
 */
export function correoParaEmpresaNueva(correoTitular: string, nombreEmpresa: string, sufijo: string): string {
  const [local, dominio] = correoTitular.trim().toLowerCase().split('@');
  if (!local || !dominio) throw new Error('La cuenta no tiene un correo válido.');
  const base = local.split('+')[0];
  const etiqueta = nombreEmpresa
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 20).replace(/-+$/g, '') || 'empresa';
  return `${base}+${etiqueta}-${sufijo.toLowerCase()}@${dominio}`;
}

/**
 * Qué hacer al unir dos cuentas según el grupo en que ya esté cada una.
 * - ninguna en grupo → grupo nuevo con las dos
 * - una en grupo     → la otra entra en ese
 * - las dos, iguales → nada
 * - las dos, distintos → se funden en el de la primera
 */
export type Union =
  | { tipo: 'nada' }
  | { tipo: 'nuevo'; grupo: string; entran: string[] }
  | { tipo: 'entra'; grupo: string; entran: string[] }
  | { tipo: 'fundir'; grupo: string; desde: string };

export function planDeUnion(
  a: { id: string; grupo: string | null },
  b: { id: string; grupo: string | null },
  grupoNuevo: string,
): Union {
  if (a.id === b.id) return { tipo: 'nada' };
  if (a.grupo && a.grupo === b.grupo) return { tipo: 'nada' };
  if (!a.grupo && !b.grupo) return { tipo: 'nuevo', grupo: grupoNuevo, entran: [a.id, b.id] };
  if (a.grupo && !b.grupo) return { tipo: 'entra', grupo: a.grupo, entran: [b.id] };
  if (!a.grupo && b.grupo) return { tipo: 'entra', grupo: b.grupo, entran: [a.id] };
  return { tipo: 'fundir', grupo: a.grupo!, desde: b.grupo! };
}
