'use client';

/**
 * LISTADOS, IMPRESOS Y RELACIONES
 *
 * Como en el menú de siempre de un programa de gestión:
 *
 *   · Listados: fichas, compras y ventas, rentabilidad, estadísticas,
 *     caja, libros de facturas, impuestos, inventario e historial.
 *   · Impresos: los documentos impresos de una vez, con el diseño propio.
 *   · Relaciones: la lista de documentos de un tipo, con sus totales.
 *
 * La pestaña va en la dirección (?tab=), para que el menú lleve directo.
 */

import { Suspense } from 'react';
import { ListOrdered, Printer, ClipboardList } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { usePestanaDeLaDireccion } from '@/hooks/useDireccion';
import ListadosGenerales from './_componentes/ListadosGenerales';
import Impresos from './_componentes/Impresos';
import Relaciones from './_componentes/Relaciones';

type Pestana = 'listados' | 'impresos' | 'relaciones';

const PESTANAS: { id: Pestana; nombre: string; icono: React.ComponentType<{ size?: number }> }[] = [
  { id: 'listados', nombre: 'Listados', icono: ListOrdered },
  { id: 'impresos', nombre: 'Impresos', icono: Printer },
  { id: 'relaciones', nombre: 'Relaciones', icono: ClipboardList },
];

function ListadosContenido() {
  const [pestana, setPestana] = usePestanaDeLaDireccion<Pestana>(['listados', 'impresos', 'relaciones'], 'listados');
  return (
    <div className="animate-fade-in">
      <div className="tabs listados-pestanas" role="tablist" aria-label="Listados, impresos y relaciones">
        {PESTANAS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={`tab ${pestana === p.id ? 'active' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            <p.icono size={15} /> {p.nombre}
          </button>
        ))}
      </div>
      {pestana === 'listados' && <ListadosGenerales />}
      {pestana === 'impresos' && <Impresos />}
      {pestana === 'relaciones' && <Relaciones />}
    </div>
  );
}

export default function ListadosPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" label="Cargando listados" />}>
      <ListadosContenido />
    </Suspense>
  );
}
