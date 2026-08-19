'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { BUSINESS_SECTORS, GRUPOS_SECTOR } from '@/lib/constants';
import type { BusinessSector } from '@/lib/types';

interface Props {
  valor?: BusinessSector;
  onElegir: (sector: BusinessSector) => void;
}

/**
 * A qué se dedica quien factura.
 *
 * Con cinco sectores bastaba una rejilla plana. Con treinta y seis no: hay
 * que poder llegar al tuyo sin repasar los treinta y cinco que no son, así
 * que van agrupados por familia y con un buscador encima.
 *
 * El buscador mira también la descripción, no sólo el nombre. Quien teclea
 * «minuta» busca el sector de abogacía aunque esa palabra no esté en el
 * rótulo, y quien teclea «bono» debería encontrar fisioterapia y estética.
 */
export default function SelectorSector({ valor, onElegir }: Props) {
  const [busqueda, setBusqueda] = useState('');

  const porGrupo = useMemo(() => {
    const limpia = busqueda.trim().toLowerCase();
    const coincide = (s: (typeof BUSINESS_SECTORS)[number]) =>
      !limpia
      || s.label.toLowerCase().includes(limpia)
      || s.description.toLowerCase().includes(limpia);

    return GRUPOS_SECTOR
      .map(g => ({ ...g, sectores: BUSINESS_SECTORS.filter(s => s.grupo === g.value && coincide(s)) }))
      .filter(g => g.sectores.length > 0);
  }, [busqueda]);

  return (
    <div className="selector-sector">
      <div className="selector-sector-buscar">
        <Search size={15} />
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Busca tu actividad: fontanero, clínica, abogado…"
          aria-label="Buscar sector de actividad"
        />
      </div>

      {porGrupo.length === 0 && (
        <p className="selector-sector-vacio">
          Nada con ese nombre. Elige el que más se parezca: sólo decide qué
          categorías y conceptos vienen puestos de fábrica, y todo se puede
          cambiar después.
        </p>
      )}

      {porGrupo.map(grupo => (
        <section key={grupo.value} className="selector-sector-grupo">
          <h4 className="selector-sector-titulo">{grupo.label}</h4>
          <div className="choice-grid" role="radiogroup" aria-label={grupo.label}>
            {grupo.sectores.map(sec => (
              <button
                key={sec.value}
                type="button"
                role="radio"
                aria-checked={valor === sec.value}
                className={`choice-card ${valor === sec.value ? 'active' : ''}`}
                onClick={() => onElegir(sec.value)}
              >
                <span className="choice-card-icon"><CategoryIcon name={sec.icon} size={22} /></span>
                <span className="choice-card-title">{sec.label}</span>
                <span className="choice-card-text">{sec.description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
