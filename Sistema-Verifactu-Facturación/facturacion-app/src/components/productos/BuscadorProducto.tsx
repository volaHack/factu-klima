'use client';

/**
 * EL BUSCADOR DE ARTÍCULO
 *
 * En lugar del desplegable con todo el catálogo: se escribe la referencia,
 * un trozo del nombre, la referencia del proveedor o se pasa el escáner, y
 * salen los que casan (lib/buscarProductos). Si lo escrito no deja duda
 * (un código de barras, una referencia exacta) Intro lo coge directamente.
 */

import { useCallback } from 'react';
import type { Product } from '@/lib/types';
import { buscarProductos, unicoProducto } from '@/lib/buscarProductos';
import { formatCurrency } from '@/lib/utils';
import BuscadorEnLista from '@/components/ui/BuscadorEnLista';
import type { ColumnaVentana, FiltroVentana } from '@/components/ui/VentanaBusqueda';

const precioCompra = (p: Product) => [p.purchasePrice, p.costeUltimaCompra, p.costePmp].find(v => (v ?? 0) > 0) ?? 0;

const FILTROS: FiltroVentana<Product>[] = [
  { id: 'activos', etiqueta: 'Solo activos', aplica: p => p.active !== false },
  { id: 'stock', etiqueta: 'Con existencias', aplica: p => (p.stockQuantity ?? 0) > 0 },
  { id: 'sinstock', etiqueta: 'Sin existencias o en negativo', aplica: p => (p.stockQuantity ?? 0) <= 0 },
];

export const etiquetaProducto = (p: Pick<Product, 'ref' | 'name'>) => (p.ref ? `[${p.ref}] ${p.name}` : p.name);

export default function BuscadorProducto({
  products, value, onSelect, placeholder = 'Buscar artículo: referencia, nombre o código', ariaLabel, className, autoFocus, disabled, sentido = 'venta', sugeridos,
}: {
  /** Lo que se ofrece con la caja vacía: lo que suele pedir este cliente. */
  sugeridos?: readonly Product[];
  /** En una compra la lista enseña el precio de compra, no el de venta. */
  sentido?: 'venta' | 'compra';
  products: Product[];
  /** El id del producto elegido; vacío si ninguno. */
  value: string;
  onSelect: (productId: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const idDe = useCallback((p: Product) => p.id, []);
  const columnas: ColumnaVentana<Product>[] = [
    { titulo: 'Ref.', valor: p => p.ref, pintar: p => <span className="mono">{p.ref}</span> },
    { titulo: 'Artículo', valor: p => p.name, pintar: p => <strong>{p.name}</strong> },
    { titulo: 'Familia', valor: p => p.category },
    { titulo: 'Stock', valor: p => p.stockQuantity ?? 0, num: true },
    sentido === 'compra'
      ? { titulo: 'P. compra', valor: precioCompra, num: true, pintar: p => formatCurrency(precioCompra(p)) }
      : { titulo: 'PVP', valor: p => p.unitPrice, num: true, pintar: p => formatCurrency(p.unitPrice) },
    { titulo: 'Ref. prov.', valor: p => p.supplierRef ?? '' },
    { titulo: 'Cód. barras', valor: p => p.barcode ?? '' },
  ];
  return (
    <BuscadorEnLista
      items={products}
      value={value}
      onSelect={onSelect}
      idDe={idDe}
      etiqueta={etiquetaProducto}
      buscar={buscarProductos}
      unico={unicoProducto}
      opcion={p => ({
        nombre: <>{p.ref && <span className="mono">{p.ref}</span>} {p.name}</>,
        datos: <>
          {sentido === 'compra'
            ? <>Compra {formatCurrency([p.purchasePrice, p.costeUltimaCompra, p.costePmp].find(v => (v ?? 0) > 0) ?? 0)}</>
            : formatCurrency(p.unitPrice)}
          {p.stockQuantity != null && <> · {p.stockQuantity} {p.unit}</>}
          {p.supplierRef && <> · Prov. {p.supplierRef}</>}
          {p.active === false && <> · de baja</>}
        </>,
        baja: p.active === false,
      })}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      autoFocus={autoFocus}
      disabled={disabled}
      pista="Escribe la referencia, parte del nombre o pasa el escáner."
      ventana={{ titulo: 'Buscar artículo', columnas, filtros: FILTROS }}
      sugeridos={sugeridos}
      tituloSugeridos="Lo que suele pedir este cliente"
    />
  );
}
