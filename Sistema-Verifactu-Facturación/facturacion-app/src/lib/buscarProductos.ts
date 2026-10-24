/**
 * BUSCAR UN PRODUCTO PARA UNA LÍNEA
 *
 * Con 1.469 artículos, un desplegable no sirve: hay que bajar la lista
 * entera para encontrar uno. Esto busca por lo que se tenga a mano —la
 * referencia, un trozo del nombre, la referencia del proveedor o el
 * código de barras que lee el escáner— sin tildes ni mayúsculas, y pone
 * primero lo que más se parece.
 */

import type { Product } from './types';

type ProductoBuscable = Pick<Product, 'id' | 'ref' | 'name' | 'active'> &
  Partial<Pick<Product, 'supplierRef' | 'barcode' | 'category' | 'description'>>;

/** En minúsculas y sin tildes: «jamón» se encuentra escribiendo «jamon». */
export function plano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Lo que vale cada coincidencia (más es mejor; 0 = no casa). La referencia
 * o el código de barras exactos ganan a todo: es lo que manda el escáner.
 */
export function puntuacion(p: ProductoBuscable, texto: string): number {
  const t = plano(texto);
  if (!t) return 0;
  const ref = plano(p.ref ?? '');
  const codigo = plano(p.barcode ?? '');
  const refProv = plano(p.supplierRef ?? '');
  const nombre = plano(p.name ?? '');
  if (t === ref || (codigo && t === codigo)) return 100;
  if (refProv && t === refProv) return 90;
  // Cada palabra tiene que estar en algún sitio: «choco 500» encuentra
  // «CHOCOLATE CON LECHE 500 G».
  const todo = `${ref} ${nombre} ${refProv} ${codigo} ${plano(p.category ?? '')} ${plano(p.description ?? '')}`;
  const palabras = t.split(/\s+/);
  if (!palabras.every(w => todo.includes(w))) return 0;
  if (ref.startsWith(t)) return 80;
  if (nombre.startsWith(t)) return 70;
  if (codigo.startsWith(t) || refProv.startsWith(t)) return 60;
  if (nombre.split(/\s+/).some(w => w.startsWith(palabras[0]))) return 50;
  return 30;
}

/** Los que casan: los activos antes que los dados de baja, el mejor primero y, a igualdad, por nombre. */
export function buscarProductos<T extends ProductoBuscable>(productos: readonly T[], texto: string, max = 50): T[] {
  if (!plano(texto)) return [];
  return productos
    .map(p => ({ p, n: puntuacion(p, texto) }))
    .filter(x => x.n > 0)
    .sort((a, b) => Number(b.p.active !== false) - Number(a.p.active !== false)
      || b.n - a.n
      || a.p.name.localeCompare(b.p.name, 'es', { sensitivity: 'base' }))
    .slice(0, max)
    .map(x => x.p);
}

/**
 * El que se coge con Intro sin bajar por la lista: solo si no hay duda
 * (referencia o código de barras exactos, o un único resultado).
 */
export function unicoProducto<T extends ProductoBuscable>(productos: readonly T[], texto: string): T | null {
  const t = plano(texto);
  if (!t) return null;
  const exactos = productos.filter(p => puntuacion(p, texto) >= 90);
  if (exactos.length === 1) return exactos[0];
  const todos = buscarProductos(productos, texto, 2);
  return todos.length === 1 ? todos[0] : null;
}
