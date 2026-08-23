'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Sparkles } from 'lucide-react';
import {
  MODULOS, GRUPOS_MODULO, encender, apagar, modulosPorDefecto, type ModuloId, type GrupoModulo,
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
 *
 * CADA GRUPO SE PLIEGA
 *
 * Veinticuatro módulos en siete grupos es media pantalla de casillas antes
 * de llegar a nada más de Ajustes. Cada grupo es un desplegable, y por
 * defecto sólo se abren los que tienen algo encendido: así se ve de un
 * vistazo lo que ya está configurado sin tener que desplegar los veinte que
 * no se han tocado, y quien quiera mirar el resto lo abre él mismo.
 */
export default function SelectorModulos({ activos, sector, onCambiar }: Props) {
  // Sin configurar todavía, manda lo que trae de fábrica su sector.
  const encendidos = useMemo(
    () => activos ?? modulosPorDefecto(sector),
    [activos, sector],
  );

  const [abiertos, setAbiertos] = useState<Set<GrupoModulo> | null>(null);

  // Los grupos con algo encendido, la primera vez que hay datos. `null` es
  // «todavía no se ha calculado»: sin esto, el primer render (antes de saber
  // qué hay activo) abriría todos los grupos un instante y luego los
  // cerraría de golpe, que es peor que abrirlos plegados desde el principio.
  const abiertosDeSalida = useMemo(
    () => new Set(GRUPOS_MODULO.filter(g => MODULOS.some(m => m.grupo === g.id && encendidos.includes(m.id))).map(g => g.id)),
    [encendidos],
  );
  const abiertosActuales = abiertos ?? abiertosDeSalida;

  const alternarGrupo = (id: GrupoModulo) => {
    const siguiente = new Set(abiertosActuales);
    if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
    setAbiertos(siguiente);
  };

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

        const encendidosDelGrupo = delGrupo.filter(m => encendidos.includes(m.id)).length;
        const abierto = abiertosActuales.has(grupo.id);

        return (
          <section key={grupo.id} className="modulos-grupo">
            <button
              type="button"
              className="modulos-grupo-cabeza"
              onClick={() => alternarGrupo(grupo.id)}
              aria-expanded={abierto}
            >
              <ChevronDown size={16} className={`modulos-grupo-flecha ${abierto ? 'abierta' : ''}`} />
              <h4 className="modulos-titulo">{grupo.nombre}</h4>
              <span className="modulos-grupo-cuenta">
                {encendidosDelGrupo > 0 ? `${encendidosDelGrupo} de ${delGrupo.length} encendidos` : `${delGrupo.length} módulos`}
              </span>
            </button>

            {abierto && (
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
            )}
          </section>
        );
      })}
    </div>
  );
}
