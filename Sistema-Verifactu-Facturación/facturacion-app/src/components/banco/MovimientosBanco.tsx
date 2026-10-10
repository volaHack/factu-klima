'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, EyeOff, RotateCcw, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { filtrarMovimientos, ibanCorto, type FiltroMovimientos } from '@/lib/banco/vista';
import type { MovimientoVista } from './tipos';

export interface MovimientosBancoProps {
  readonly movimientos: readonly MovimientoVista[];
  readonly onApartar: (m: MovimientoVista, apartar: boolean) => void;
}

const FILTROS: { id: FiltroMovimientos; texto: string }[] = [
  { id: 'pendientes', texto: 'Sin conciliar' },
  { id: 'conciliados', texto: 'Conciliados' },
  { id: 'apartados', texto: 'Apartados' },
  { id: 'todos', texto: 'Todos' },
];

const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** Los movimientos guardados del banco, con su estado de conciliación. */
export default function MovimientosBanco({ movimientos, onApartar }: MovimientosBancoProps) {
  const [filtro, setFiltro] = useState<FiltroMovimientos>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const varias = useMemo(() => new Set(movimientos.map(m => m.cuenta)).size > 1, [movimientos]);
  const visibles = filtrarMovimientos([...movimientos], filtro, busqueda);
  const cuantos = (f: FiltroMovimientos) => filtrarMovimientos([...movimientos], f, '').length;

  return (
    <section className="banco-movimientos" aria-labelledby="banco-mov-titulo">
      <div className="banco-movimientos-cabecera">
        <h2 id="banco-mov-titulo">Movimientos</h2>
        <div className="tabs" role="tablist" aria-label="Qué movimientos ver">
          {FILTROS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id}
              className={`tab ${filtro === f.id ? 'active' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.texto} <span className="banco-cuenta-num">{cuantos(f.id)}</span>
            </button>
          ))}
        </div>
        <label className="banco-buscar banco-buscar--compacto">
          <Search size={14} aria-hidden="true" />
          <input className="form-input form-input-sm" placeholder="Buscar concepto o importe" value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar movimientos" />
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="banco-vacio">
          {filtro === 'pendientes' && !busqueda ? 'Todo conciliado. Los movimientos nuevos llegan solos cada mañana.' : 'Nada que enseñar con este filtro.'}
        </p>
      ) : (
        <ul className="banco-mov-lista">
          {visibles.slice(0, 400).map(m => (
            <li key={m.id} className={m.ignorado ? 'is-apartado' : ''}>
              <span className="banco-mov-fecha">{fechaCorta(m.fecha)}</span>
              <span className="banco-mov-concepto">
                <span>{m.concepto}</span>
                {varias && <span className="banco-mov-cuenta mono">{ibanCorto(m.iban)}</span>}
              </span>
              <span className={`banco-mov-importe ${m.importe < 0 ? 'is-salida' : 'is-entrada'}`}>
                {m.importe > 0 ? '+' : ''}{formatCurrency(m.importe)}
              </span>
              <span className="banco-mov-estado">
                {m.conciliado ? (
                  <span className="banco-mov-hecho"><CheckCircle2 size={13} /> {m.conciliado}</span>
                ) : m.ignorado ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onApartar(m, false)}><RotateCcw size={13} /> Recuperar</button>
                ) : (
                  <>
                    <Link href="/conciliacion" className="btn btn-secondary btn-sm">Conciliar <ArrowRight size={13} /></Link>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onApartar(m, true)}
                      title="Apartar: traspasos entre cuentas propias o movimientos que no son de la empresa" aria-label="Apartar">
                      <EyeOff size={13} />
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
