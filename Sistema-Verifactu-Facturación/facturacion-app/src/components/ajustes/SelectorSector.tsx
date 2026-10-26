'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
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
  /**
   * Plegado mientras ya haya un oficio elegido.
   *
   * Son treinta y seis fichas con su descripción: desplegadas ocupan
   * media pantalla de Ajustes y hay que pasarlas todas cada vez que se
   * entra a cambiar cualquier otra cosa. Y es una decisión que se toma
   * una vez. Quien todavía no ha elegido lo ve abierto, porque ahí sí
   * es lo que hay que hacer.
   */
  const [abierto, setAbierto] = useState(!valor);
  const actual = BUSINESS_SECTORS.find(s => s.value === valor);
  /**
   * A dónde va el foco al abrir o cerrar.
   *
   * El botón que se pulsa desaparece al cambiar de vista, y sin esto el
   * foco se iba al principio de la página: con teclado había que volver a
   * bajar hasta aquí. Al abrir va al buscador; al cerrar, a «Cambiar
   * sector». Sólo cuando lo pide un clic, nunca al cargar la página.
   */
  const foco = useRef<'buscador' | 'cambiar' | null>(null);
  const enfocarSi = (cual: 'buscador' | 'cambiar') => (el: HTMLElement | null) => {
    if (el && foco.current === cual) { foco.current = null; el.focus(); }
  };
  const abrir = () => { foco.current = 'buscador'; setAbierto(true); };
  const cerrar = () => { foco.current = 'cambiar'; setBusqueda(''); setAbierto(false); };

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

  // Plegado: la actividad que hay puesta y un botón para cambiarla.
  if (!abierto && actual) {
    return (
      <div className="selector-sector-resumen">
        <span className="selector-sector-resumen-icono">
          <CategoryIcon name={actual.icon} size={22} />
        </span>
        <span className="selector-sector-resumen-texto">
          <strong>{actual.label}</strong>
          <span>{actual.description}</span>
        </span>
        <button
          type="button"
          ref={enfocarSi('cambiar')}
          className="btn btn-secondary btn-sm selector-sector-resumen-accion"
          onClick={abrir}
          aria-expanded={false}
        >
          Cambiar sector <ChevronDown size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="selector-sector">
      {/* Abierto con un sector ya puesto: se puede volver sin tocarlo. */}
      {actual && (
        <div className="selector-sector-cabeza">
          <span>Ahora: <strong>{actual.label}</strong>. Elige otro o déjalo como está.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} aria-expanded={true}>
            <X size={14} /> Dejar el actual
          </button>
        </div>
      )}

      <div className="selector-sector-buscar">
        <Search size={15} />
        <input
          ref={enfocarSi('buscador')}
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
                onClick={() => { onElegir(sec.value); cerrar(); }}
              >
                <span className="choice-card-icon"><CategoryIcon name={sec.icon} size={22} /></span>
                <span className="choice-card-title">
                  {sec.label}
                  {valor === sec.value && <Check size={14} className="choice-card-check" />}
                </span>
                <span className="choice-card-text">{sec.description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
