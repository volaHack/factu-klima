'use client';

/**
 * EL BUSCADOR DE CLIENTE O PROVEEDOR
 *
 * Sustituye al desplegable con todas las fichas: se escribe el nombre, el
 * NIF, el teléfono o la ciudad y salen las que casan (lib/buscarFichas).
 * Con la caja vacía sugiere las más usadas, si se le pasan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getInvoices } from '@/lib/storage';
import { fichasFrecuentes } from '@/lib/documentos';
import type { Client } from '@/lib/types';
import { buscarFichasPorTexto, nombreDeFicha, unicaFicha } from '@/lib/buscarFichas';
import BuscadorEnLista from '@/components/ui/BuscadorEnLista';
import type { ColumnaVentana, FiltroVentana } from '@/components/ui/VentanaBusqueda';
import AltaRapidaFicha from './AltaRapidaFicha';

const COLUMNAS: ColumnaVentana<Client>[] = [
  { titulo: 'Código', valor: c => c.codigo ?? '' },
  { titulo: 'Nombre', valor: c => nombreDeFicha(c), pintar: c => <strong>{nombreDeFicha(c)}</strong> },
  { titulo: 'Razón social', valor: c => (c.tradeName && c.businessName !== c.tradeName ? c.businessName : '') },
  { titulo: 'NIF', valor: c => c.nif },
  { titulo: 'Población', valor: c => c.city },
  { titulo: 'Teléfono', valor: c => c.phone },
  { titulo: 'Tipo', valor: c => (c.esProveedor ? 'Proveedor' : 'Cliente') },
];

export default function BuscadorFicha({
  fichas, value, onSelect, placeholder = 'Buscar por nombre, NIF, teléfono o ciudad', ariaLabel, className, autoFocus, disabled, sugeridas,
  alCrear, esProveedor,
}: {
  /**
   * Con esto, si no existe se puede dar de alta al momento («Crear nuevo»)
   * y queda elegido. Recibe la ficha nueva para añadirla a la lista.
   */
  alCrear?: (c: Client) => void;
  /** Lo que se crea con «Crear nuevo»: proveedor o cliente. */
  esProveedor?: boolean;
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
  const [alta, setAlta] = useState<string | null>(null);
  // Con la caja vacía se ofrecen las de más movimiento estos meses.
  const [frecuentes, setFrecuentes] = useState<string[]>([]);
  useEffect(() => {
    if (sugeridas) return;
    let vivo = true;
    getInvoices().then(d => { if (vivo) setFrecuentes(fichasFrecuentes(d, 12)); }).catch(() => {});
    return () => { vivo = false; };
  }, [sugeridas]);
  const sugeridasFinal = useMemo(
    () => sugeridas ?? frecuentes.map(id => fichas.find(f => f.id === id)).filter((f): f is Client => !!f).slice(0, 8),
    [sugeridas, frecuentes, fichas],
  );
  const hayDeLosDos = fichas.some(c => c.esProveedor) && fichas.some(c => !c.esProveedor);
  const filtros: FiltroVentana<Client>[] = [
    { id: 'activos', etiqueta: 'Solo activos', aplica: c => c.active !== false },
    ...(hayDeLosDos ? [
      { id: 'clientes', etiqueta: 'Clientes', aplica: (c: Client) => !c.esProveedor },
      { id: 'proveedores', etiqueta: 'Proveedores', aplica: (c: Client) => !!c.esProveedor },
    ] : []),
  ];
  const quien = esProveedor ? 'proveedor' : 'cliente';
  const etiqueta = useCallback((c: Client) => `${nombreDeFicha(c)}${c.nif ? ` (${c.nif})` : ''}`, []);
  return (
    <>
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
      sugeridos={sugeridasFinal}
      tituloSugeridos="Los de más movimiento"
      pista="Escribe parte del nombre, el NIF, el teléfono o la ciudad."
      ventana={{ titulo: esProveedor ? 'Buscar proveedor' : hayDeLosDos ? 'Buscar cliente o proveedor' : 'Buscar cliente', columnas: COLUMNAS, filtros }}
      crear={alCrear ? { etiqueta: `Crear ${quien}`, accion: t => setAlta(t) } : undefined}
    />
    {alta !== null && alCrear && (
      <AltaRapidaFicha
        textoInicial={alta}
        esProveedor={!!esProveedor}
        existentes={fichas}
        onCreada={c => { setAlta(null); alCrear(c); }}
        onElegirExistente={c => { setAlta(null); onSelect(c.id); }}
        onCerrar={() => setAlta(null)}
      />
    )}
    </>
  );
}
