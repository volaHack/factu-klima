/**
 * BUSCAR UN CLIENTE O PROVEEDOR
 *
 * Por lo que se tenga a mano: el nombre comercial o la razón social, el
 * NIF, el teléfono, el correo, la ciudad o la persona de contacto. Sin
 * tildes ni mayúsculas, cada palabra en cualquier orden. Los activos
 * primero; el NIF exacto, antes que nada.
 */

import type { Client } from './types';
import { plano } from './buscarProductos';

type FichaBuscable = Pick<Client, 'id' | 'businessName' | 'tradeName' | 'nif' | 'active'>
  & Partial<Pick<Client, 'phone' | 'email' | 'city' | 'contactPerson' | 'esProveedor'>>;

export function nombreDeFicha(c: Pick<Client, 'businessName' | 'tradeName'>): string {
  return c.tradeName || c.businessName;
}

export function puntuacionFicha(c: FichaBuscable, texto: string): number {
  const t = plano(texto);
  if (!t) return 0;
  if (c.nif && plano(c.nif) === t) return 100;
  const palabras = t.split(/\s+/);
  const pajar = plano([c.tradeName, c.businessName, c.nif, c.phone, c.email, c.city, c.contactPerson].filter(Boolean).join(' '));
  if (!palabras.every(w => pajar.includes(w))) return 0;
  const nombre = plano(nombreDeFicha(c));
  if (nombre === t) return 90;
  if (nombre.startsWith(t)) return 80;
  if (plano(c.businessName).startsWith(t)) return 70;
  if (nombre.split(/\s+/).some(w => w.startsWith(palabras[0]))) return 60;
  return 40;
}

export function buscarFichasPorTexto<T extends FichaBuscable>(fichas: readonly T[], texto: string, max = 50): T[] {
  if (!plano(texto)) return [];
  return fichas
    .map(c => ({ c, n: puntuacionFicha(c, texto) }))
    .filter(x => x.n > 0)
    .sort((a, b) => Number(b.c.active !== false) - Number(a.c.active !== false)
      || b.n - a.n
      || nombreDeFicha(a.c).localeCompare(nombreDeFicha(b.c), 'es', { sensitivity: 'base' }))
    .slice(0, max)
    .map(x => x.c);
}

/** El que se coge con Intro: NIF exacto o un único resultado. */
export function unicaFicha<T extends FichaBuscable>(fichas: readonly T[], texto: string): T | null {
  const exactos = fichas.filter(c => puntuacionFicha(c, texto) >= 90);
  if (exactos.length === 1) return exactos[0];
  const dos = buscarFichasPorTexto(fichas, texto, 2);
  return dos.length === 1 ? dos[0] : null;
}
