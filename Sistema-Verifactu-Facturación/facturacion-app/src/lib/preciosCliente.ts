// Precios especiales por cliente (migración 067): leerlos sin fiarse de lo
// que venga en la base de datos y encontrar el que toca a cada artículo.
// El cálculo de la línea está en `condicionesDeVenta` (documentos.ts).
import type { Client, DescuentoFamilia, PrecioEspecial } from './types';

const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Un descuento es un porcentaje entre 0 y 100; lo demás no se aplica. */
const porcentaje = (v: unknown): number | null => {
  const n = numeroONulo(v);
  return n !== null && n > 0 && n <= 100 ? n : null;
};

/**
 * La lista tal y como la guarda la base de datos, limpia: sin entradas sin
 * artículo, sin precios negativos, sin descuentos imposibles, y con un solo
 * apunte por artículo (el último manda, que es el que se tocó después).
 */
export function leerPreciosEspeciales(raw: unknown): PrecioEspecial[] {
  if (!Array.isArray(raw)) return [];
  const porProducto = new Map<string, PrecioEspecial>();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const productId = typeof o.productId === 'string' ? o.productId.trim() : '';
    if (!productId) continue;
    const precio = numeroONulo(o.precio);
    const descuento = porcentaje(o.descuento);
    const limpio: PrecioEspecial = {
      productId,
      precio: precio !== null && precio > 0 ? precio : null,
      descuento,
      activo: o.activo !== false,
    };
    if (limpio.precio === null && limpio.descuento === null) continue;
    porProducto.set(productId, limpio);
  }
  return [...porProducto.values()];
}

export function leerDescuentosFamilia(raw: unknown): DescuentoFamilia[] {
  if (!Array.isArray(raw)) return [];
  const porFamilia = new Map<string, DescuentoFamilia>();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const categoria = typeof o.categoria === 'string' ? o.categoria.trim() : '';
    const descuento = porcentaje(o.descuento);
    if (!categoria || descuento === null) continue;
    porFamilia.set(categoria, { categoria, descuento, activo: o.activo !== false });
  }
  return [...porFamilia.values()];
}

type ConPrecios = Pick<Client, 'preciosEspeciales' | 'descuentosFamilia'> | null | undefined;

/** El precio especial ENCENDIDO de este cliente para este artículo, si lo hay. */
export function precioEspecialDe(cliente: ConPrecios, productId: string | undefined): PrecioEspecial | undefined {
  if (!cliente || !productId) return undefined;
  return cliente.preciosEspeciales?.find(p => p.productId === productId && p.activo);
}

/** El descuento ENCENDIDO de este cliente para esta familia, si lo hay. */
export function descuentoFamiliaDe(cliente: ConPrecios, categoria: string | undefined): DescuentoFamilia | undefined {
  if (!cliente || !categoria) return undefined;
  return cliente.descuentosFamilia?.find(d => d.categoria === categoria && d.activo);
}
