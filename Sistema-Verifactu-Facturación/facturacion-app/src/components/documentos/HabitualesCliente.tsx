'use client';

import { Check, Plus, Sparkles } from 'lucide-react';
import type { ArticuloHabitual } from '@/lib/pedidoHabitual';
import { formatCurrency } from '@/lib/utils';

const cantidad = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });

/**
 * «Lo que suele pedir este cliente»: sus artículos más frecuentes como
 * botones, con la cantidad y el precio de la última vez, para ponerlos de
 * un toque (ver lib/pedidoHabitual.ts). Lo que ya está en el documento se
 * marca y no se vuelve a añadir: para repetirlo está «Añadir línea».
 */
export default function HabitualesCliente({ habituales, puestos, sentido, onAnadir }: {
  habituales: readonly ArticuloHabitual[];
  puestos: ReadonlySet<string>;
  sentido: 'venta' | 'compra';
  onAnadir: (h: ArticuloHabitual) => void;
}) {
  if (!habituales.length) return null;
  return (
    <section className="habituales" aria-label={sentido === 'compra' ? 'Lo que sueles comprarle' : 'Lo que suele pedir este cliente'}>
      <p className="habituales-titulo">
        <Sparkles size={14} aria-hidden />
        {sentido === 'compra' ? 'Lo que sueles comprarle' : 'Lo que suele pedir'}
        <span className="habituales-ayuda">· un toque y se añade con lo de la última vez</span>
      </p>
      <div className="habituales-chips">
        {habituales.map(h => {
          const puesto = puestos.has(h.productId);
          const ultima = `${cantidad(h.ultimaCantidad)} × ${formatCurrency(h.ultimoPrecio)}`;
          return (
            <button
              key={h.productId}
              type="button"
              className={`habitual${puesto ? ' es-puesto' : ''}`}
              disabled={puesto}
              onClick={() => onAnadir(h)}
              aria-label={puesto
                ? `${h.nombre}: ya está en el documento`
                : `Añadir ${h.nombre}: la última vez ${ultima}, ${h.veces === 1 ? 'pedido 1 vez' : `pedido ${h.veces} veces`}`}
              title={`${h.veces === 1 ? '1 vez' : `${h.veces} veces`} · la última, el ${h.ultimaFecha.split('-').reverse().join('/')}`}
            >
              {puesto ? <Check size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
              <span className="habitual-nombre">{h.nombre}</span>
              <span className="habitual-ultima">{ultima}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
