'use client';

/**
 * EL BUSCADOR DE CLIENTE O PROVEEDOR
 *
 * Sustituye al desplegable con todas las fichas: se escribe el nombre, el
 * NIF, el teléfono o la ciudad y salen las que casan (lib/buscarFichas).
 * Con la caja vacía sugiere las más usadas, si se le pasan.
 */

import { useCallback } from 'react';
import type { Client } from '@/lib/types';
import { buscarFichasPorTexto, nombreDeFicha, unicaFicha } from '@/lib/buscarFichas';
import BuscadorEnLista from '@/components/ui/BuscadorEnLista';

export default function BuscadorFicha({
  fichas, value, onSelect, placeholder = 'Buscar por nombre, NIF, teléfono o ciudad', ariaLabel, className, autoFocus, disabled, sugeridas,
}: {
  fichas: readonly Client[];
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Las que se ofrecen con la caja vacía (p. ej. las de más movimiento). */
  sugeridas?: readonly Client[];
}) {
  const idDe = useCallback((c: Client) => c.id, []);
  const etiqueta = useCallback((c: Client) => `${nombreDeFicha(c)}${c.nif ? ` (${c.nif})` : ''}`, []);
  return (
    <BuscadorEnLista
      items={fichas}
      value={value}
      onSelect={onSelect}
      idDe={idDe}
      etiqueta={etiqueta}
      buscar={buscarFichasPorTexto}
      unico={unicaFicha}
      opcion={c => ({
        nombre: nombreDeFicha(c),
        datos: [c.tradeName && c.businessName !== c.tradeName ? c.businessName : '', c.nif, c.city, c.phone, c.esProveedor ? 'proveedor' : '']
          .filter(Boolean).join(' · '),
        baja: c.active === false,
      })}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      autoFocus={autoFocus}
      disabled={disabled}
      sugeridos={sugeridas}
      pista="Escribe parte del nombre, el NIF, el teléfono o la ciudad."
    />
  );
}
