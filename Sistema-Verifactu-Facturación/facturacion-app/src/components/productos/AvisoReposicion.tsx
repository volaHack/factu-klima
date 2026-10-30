'use client';

/**
 * EL PANEL DE «REPÓN ESTO» Y «SIN MOVIMIENTO», ENCIMA DEL CATÁLOGO
 *
 * Lo que se va a acabar a su ritmo de venta, con la cantidad a pedir (en
 * cajas si va por cajas), y lo que lleva meses parado en el almacén. La
 * cuenta está en lib/reposicion; aquí solo se enseña. Cada fila abre la
 * ficha del artículo. Si no hay nada que decir, no se pinta.
 */

import { useMemo, useState } from 'react';
import { PackageSearch, Hourglass, ChevronDown } from 'lucide-react';
import type { Invoice, Product } from '@/lib/types';
import { calcularReposicion, sinMovimiento } from '@/lib/reposicion';
import { formatCurrency, formatDate } from '@/lib/utils';

const CUANTOS = 5;
const PLAZOS = [15, 30, 60] as const;

const num = (n: number, dec = 0) => n.toLocaleString('es-ES', { maximumFractionDigits: dec });

export default function AvisoReposicion({ productos, documentos, pendientes, onAbrir }: {
  productos: readonly Product[];
  documentos: readonly Invoice[];
  pendientes: ReadonlyMap<string, { pendienteRecibir: number }>;
  onAbrir: (p: Product) => void;
}) {
  const [vista, setVista] = useState<'reponer' | 'parado'>('reponer');
  const [cubrir, setCubrir] = useState<(typeof PLAZOS)[number]>(30);
  const [todos, setTodos] = useState(false);

  const reponer = useMemo(() => calcularReposicion(productos, documentos, { cubrirDias: cubrir, pendientes }), [productos, documentos, cubrir, pendientes]);
  const parados = useMemo(() => sinMovimiento(productos, documentos), [productos, documentos]);
  if (!reponer.length && !parados.length) return null;

  // Si lo elegido se ha quedado vacío, se enseña lo otro.
  const actual = vista === 'reponer' && !reponer.length ? 'parado' : vista === 'parado' && !parados.length ? 'reponer' : vista;
  const filas = actual === 'reponer' ? reponer : parados;
  const abrir = (id: string) => { const p = productos.find(x => x.id === id); if (p) onAbrir(p); };
  const valorParado = parados.reduce((n, s) => n + s.valorParado, 0);

  return (
    <section className="aviso-stock" aria-labelledby="aviso-stock-titulo" data-vista={actual}>
      <header className="aviso-stock-cabecera">
        <h2 id="aviso-stock-titulo" className="solo-lectores">Avisos del almacén</h2>
        <div className="segmentos" role="group" aria-label="Qué aviso ver">
          <button type="button" className="btn btn-sm" aria-pressed={actual === 'reponer'} onClick={() => { setVista('reponer'); setTodos(false); }} disabled={!reponer.length}>
            <PackageSearch size={15} /> Repón esto <span className="segmentos-num">{reponer.length}</span>
          </button>
          <button type="button" className="btn btn-sm" aria-pressed={actual === 'parado'} onClick={() => { setVista('parado'); setTodos(false); }} disabled={!parados.length}>
            <Hourglass size={15} /> Sin movimiento <span className="segmentos-num">{parados.length}</span>
          </button>
        </div>
        {actual === 'reponer' ? (
          <div className="aviso-stock-plazo" role="group" aria-label="Pedir para cuántos días">
            <span>Pedir para</span>
            {PLAZOS.map(d => (
              <button key={d} type="button" className={`filter-chip ${cubrir === d ? 'active' : ''}`} aria-pressed={cubrir === d} onClick={() => setCubrir(d)}>
                {d} días
              </button>
            ))}
          </div>
        ) : (
          <p className="aviso-stock-resumen">Más de 90 días sin venderse: <strong className="mono">{formatCurrency(valorParado)}</strong> parados en el almacén.</p>
        )}
      </header>

      <ul className="aviso-stock-lista">
        {actual === 'reponer'
          ? reponer.slice(0, todos ? undefined : CUANTOS).map(r => (
            <li key={r.id}>
              <button type="button" className="aviso-stock-fila" onClick={() => abrir(r.id)} aria-label={`Abrir ${r.nombre}`}>
                <span className={`aviso-stock-dias badge ${r.urgencia === 'agotado' ? 'badge-danger' : r.urgencia === 'urgente' ? 'badge-warning' : 'badge-info'}`}>
                  {r.urgencia === 'agotado' ? 'Agotado' : r.diasQuedan === 0 ? 'Se acaba hoy' : `${r.diasQuedan} ${r.diasQuedan === 1 ? 'día' : 'días'}`}
                </span>
                <span className="aviso-stock-nombre">
                  <strong>{r.nombre}</strong>
                  <small>
                    <span className="mono">{r.ref}</span> · vende {num(r.porDia, 1)} {r.unidad}/día · quedan {num(r.stock)}
                    {r.porRecibir > 0 && ` (+${num(r.porRecibir)} por recibir)`}
                  </small>
                </span>
                <span className="aviso-stock-pedir">
                  {r.sugerido > 0 ? (
                    <>
                      <small>Pide</small>
                      <strong className="mono">{r.cajas ? `${num(r.cajas)} ${r.cajas === 1 ? 'caja' : 'cajas'}` : `${num(r.sugerido)} ${r.unidad}`}</strong>
                      {r.cajas && r.udsCaja && <small>{num(r.sugerido)} {r.unidad}</small>}
                    </>
                  ) : <small>Ya viene lo que hace falta</small>}
                </span>
              </button>
            </li>
          ))
          : parados.slice(0, todos ? undefined : CUANTOS).map(s => (
            <li key={s.id}>
              <button type="button" className="aviso-stock-fila" onClick={() => abrir(s.id)} aria-label={`Abrir ${s.nombre}`}>
                <span className="aviso-stock-dias badge badge-neutral">{s.ultimaVenta ? `${num(s.dias)} días` : 'Nunca vendido'}</span>
                <span className="aviso-stock-nombre">
                  <strong>{s.nombre}</strong>
                  <small>
                    <span className="mono">{s.ref}</span> · {s.ultimaVenta ? `última venta el ${formatDate(s.ultimaVenta)}` : 'sin ventas en facturas'} · {num(s.stock)} {s.unidad} en almacén
                  </small>
                </span>
                <span className="aviso-stock-pedir">
                  <small>Parado</small>
                  <strong className="mono">{formatCurrency(s.valorParado)}</strong>
                </span>
              </button>
            </li>
          ))}
      </ul>

      {filas.length > CUANTOS && (
        <button type="button" className="btn btn-ghost btn-sm aviso-stock-mas" aria-expanded={todos} onClick={() => setTodos(t => !t)}>
          <ChevronDown size={14} /> {todos ? 'Ver menos' : `Ver los ${filas.length}`}
        </button>
      )}
    </section>
  );
}
