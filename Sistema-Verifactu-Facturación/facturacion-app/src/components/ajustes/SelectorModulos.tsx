'use client';

import { useMemo } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import {
  MODULOS, GRUPOS_MODULO, encender, apagar, modulosPorDefecto, type ModuloId,
} from '@/lib/modulos';
import type { BusinessSector } from '@/lib/types';

interface Props {
  activos?: ModuloId[];
  sector?: BusinessSector;
  onCambiar: (modulos: ModuloId[]) => void;
}

/**
 * QUÉ PARTES DEL PROGRAMA VE ESTA EMPRESA
 *
 * Al fontanero le sobra la trazabilidad por lotes y al distribuidor de
 * alimentación le sobran las órdenes de trabajo. Un programa que se lo enseña
 * todo a todo el mundo obliga a los dos a esquivar cada día el menú del otro.
 *
 * Los módulos que aún no están construidos SE ENSEÑAN, apagados y marcados.
 * Es información honesta —dice hacia dónde va el programa— y evita que
 * alguien monte una hoja de cálculo aparte para algo que llega el mes que
 * viene. Lo que no se hace es dejar encenderlos: un menú que abre una
 * pantalla en blanco es peor que no tenerlo.
 */
export default function SelectorModulos({ activos, sector, onCambiar }: Props) {
  // Sin configurar todavía, manda lo que trae de fábrica su sector.
  const encendidos = useMemo(
    () => activos ?? modulosPorDefecto(sector),
    [activos, sector],
  );

  const alternar = (id: ModuloId) => {
    onCambiar(encendidos.includes(id) ? apagar(encendidos, id) : encender(encendidos, id));
  };

  // Qué se apagaría en cadena, para avisarlo antes de que pase.
  const arrastra = (id: ModuloId) =>
    MODULOS.filter(m => encendidos.includes(m.id) && (m.requiere ?? []).includes(id));

  return (
    <div className="modulos">
      {GRUPOS_MODULO.map(grupo => {
        const delGrupo = MODULOS.filter(m => m.grupo === grupo.id);
        if (delGrupo.length === 0) return null;

        return (
          <section key={grupo.id} className="modulos-grupo">
            <h4 className="modulos-titulo">{grupo.nombre}</h4>
            <div className="modulos-lista">
              {delGrupo.map(m => {
                const activo = encendidos.includes(m.id);
                const cae = activo ? arrastra(m.id) : [];
                const necesita = (m.requiere ?? []).filter(r => !encendidos.includes(r));

                return (
                  <label
                    key={m.id}
                    className={`modulos-item ${activo ? 'activo' : ''} ${m.disponible ? '' : 'proximamente'}`}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      disabled={!m.disponible}
                      onChange={() => alternar(m.id)}
                    />
                    <span className="modulos-texto">
                      <span className="modulos-nombre">
                        {m.nombre}
                        {!m.disponible && (
                          <span className="modulos-pronto"><Sparkles size={11} /> En camino</span>
                        )}
                      </span>
                      <span className="modulos-desc">{m.descripcion}</span>

                      {/* Lo que se enciende o se apaga de rebote, dicho antes
                          de que ocurra y no después. */}
                      {necesita.length > 0 && (
                        <span className="modulos-nota">
                          <Lock size={11} /> Encenderlo activa también{' '}
                          {necesita.map(r => MODULOS.find(x => x.id === r)?.nombre).join(', ')}.
                        </span>
                      )}
                      {cae.length > 0 && (
                        <span className="modulos-nota">
                          <Lock size={11} /> Apagarlo desactiva{' '}
                          {cae.map(x => x.nombre).join(', ')}, que lo necesita
                          {cae.length > 1 ? 'n' : ''}.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
