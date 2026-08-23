/**
 * ESCANDALLOS: LA RECETA DE UN PRODUCTO FABRICADO
 *
 * Fabricar una unidad no es venderla: consume los componentes del almacén y
 * da de alta el producto terminado con su coste real —lo que costaron los
 * componentes, no un precio inventado—. Es el mismo principio que ya rige
 * el precio medio ponderado del resto del catálogo: el coste sale de lo que
 * de verdad se ha pagado, no de una tarifa.
 */

import type { Escandallo, Product } from './types';

/** El coste de un producto, tal y como ya se usa en el resto de la aplicación: el PMP, o el precio de venta si no hay PMP todavía. */
function costeDe(product: Product | undefined): number {
  if (!product) return 0;
  return product.costePmp && product.costePmp > 0 ? product.costePmp : (product.unitPrice || 0);
}

/** Lo que cuesta fabricar UNA unidad: la suma de sus componentes al coste real, más lo adicional. */
export function costeDeEscandallo(escandallo: Escandallo, products: Product[]): number {
  const porId = new Map(products.map(p => [p.id, p]));
  const costeComponentes = escandallo.componentes.reduce(
    (s, c) => s + c.cantidad * costeDe(porId.get(c.productId)),
    0,
  );
  return redondear(costeComponentes + (escandallo.costeAdicional ?? 0));
}

export interface ComponenteFaltante {
  productId: string;
  productName: string;
  necesario: number;
  disponible: number;
  faltan: number;
}

/**
 * Qué falta para fabricar `cantidad` unidades.
 *
 * Lista vacía = se puede fabricar con lo que hay en el almacén. No bloquea
 * nada por su cuenta —quien fabrica puede decidir comprar sobre la marcha—,
 * sólo dice la verdad de las existencias antes de empezar.
 */
export function componentesFaltantes(escandallo: Escandallo, products: Product[], cantidad: number): ComponenteFaltante[] {
  const porId = new Map(products.map(p => [p.id, p]));
  const faltantes: ComponenteFaltante[] = [];

  for (const c of escandallo.componentes) {
    const producto = porId.get(c.productId);
    const disponible = producto?.stockQuantity ?? 0;
    const necesario = c.cantidad * cantidad;
    if (disponible < necesario) {
      faltantes.push({
        productId: c.productId,
        productName: c.productName,
        necesario,
        disponible,
        faltan: redondear(necesario - disponible),
      });
    }
  }

  return faltantes;
}

/** El precio medio ponderado tras sumar unidades fabricadas a un coste conocido: la misma fórmula que rige una compra. */
export function nuevoPmpTrasFabricar(
  stockActual: number,
  pmpActual: number,
  cantidadFabricada: number,
  costeUnitario: number,
): number {
  const total = stockActual + cantidadFabricada;
  if (total <= 0) return costeUnitario;
  return redondear((stockActual * pmpActual + cantidadFabricada * costeUnitario) / total, 4);
}

function redondear(n: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}
