'use client';

/**
 * LA VENTANA DE «SUBIR PRECIOS»
 *
 * Cuánto (en % o en euros), cómo redondear y, debajo, cada artículo con su
 * precio de antes, el de después y el margen que le queda. Nada se guarda
 * hasta «Aplicar»; después, la pantalla ofrece deshacer unos segundos. La
 * cuenta está en lib/subidaPrecios.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { X, AlertTriangle, Loader2, TrendingUp } from 'lucide-react';
import type { Product } from '@/lib/types';
import { previsualizarSubida, resumirSubida, type Subida, type Redondeo, type ModoSubida } from '@/lib/subidaPrecios';
import { formatCurrency } from '@/lib/utils';

const REDONDEOS: { valor: Redondeo; texto: string; ejemplo: string }[] = [
  { valor: 'ninguno', texto: 'Sin redondear', ejemplo: '2,31' },
  { valor: 'x5', texto: 'Acabado en 5', ejemplo: '2,35' },
  { valor: 'x9', texto: 'Acabado en 9', ejemplo: '2,39' },
  { valor: 'x0', texto: 'Acabado en 0', ejemplo: '2,40' },
];

const margenTexto = (m: number | null) => (m === null ? '—' : `${m.toFixed(1).replace('.', ',')} %`);

export default function SubidaPrecios({ productos, queSon, onCerrar, onAplicar }: {
  productos: readonly Product[];
  /** «los 12 seleccionados», «los 40 de Bebidas»… */
  queSon: string;
  onCerrar: () => void;
  onAplicar: (subida: Subida) => Promise<void>;
}) {
  const id = useId();
  const [modo, setModo] = useState<ModoSubida>('porcentaje');
  const [texto, setTexto] = useState('5');
  const [redondeo, setRedondeo] = useState<Redondeo>('ninguno');
  const [tambienTarifas, setTambienTarifas] = useState(true);
  const [aplicando, setAplicando] = useState(false);

  const valor = Number(texto.replace(',', '.'));
  const valido = Number.isFinite(valor) && valor !== 0;
  const hayTarifas = productos.some(p => p.tarifaPrices && Object.keys(p.tarifaPrices).length > 0);
  const subida = useMemo<Subida>(
    () => ({ modo, valor: valido ? valor : 0, redondeo, tambienTarifas: hayTarifas && tambienTarifas }),
    [modo, valido, valor, redondeo, hayTarifas, tambienTarifas],
  );
  const filas = useMemo(() => previsualizarSubida(productos, subida), [productos, subida]);
  const resumen = resumirSubida(filas);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && !aplicando) onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [aplicando, onCerrar]);

  const aplicar = async () => {
    if (!valido || !resumen.cambian) return;
    setAplicando(true);
    try {
      await onAplicar(subida);
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !aplicando && onCerrar()}>
      <div className="modal modal-lg subida-precios" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" id={`${id}-titulo`}><TrendingUp size={18} /> Subir precios</h3>
          <button className="modal-close" onClick={onCerrar} disabled={aplicando} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="subida-que">Se aplica a {queSon}. Las facturas ya emitidas no cambian.</p>

          <div className="subida-controles">
            <div className="form-group">
              <label className="form-label" htmlFor={`${id}-valor`}>Cuánto</label>
              <div className="subida-valor">
                <input
                  id={`${id}-valor`}
                  className="form-input mono"
                  inputMode="decimal"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  aria-describedby={`${id}-ayuda`}
                  autoFocus
                />
                <div className="segmentos" role="group" aria-label="En qué">
                  <button type="button" className="btn btn-sm" aria-pressed={modo === 'porcentaje'} onClick={() => setModo('porcentaje')}>%</button>
                  <button type="button" className="btn btn-sm" aria-pressed={modo === 'euros'} onClick={() => setModo('euros')}>€</button>
                </div>
              </div>
              <p className="form-hint" id={`${id}-ayuda`}>En negativo, baja: −3 es un 3 % menos.</p>
            </div>

            <fieldset className="form-group subida-redondeo">
              <legend className="form-label">Redondeo</legend>
              <div className="segmentos" role="group" aria-label="Redondeo">
                {REDONDEOS.map(r => (
                  <button key={r.valor} type="button" className="btn btn-sm" aria-pressed={redondeo === r.valor} onClick={() => setRedondeo(r.valor)} title={`Ejemplo: ${r.ejemplo} €`}>
                    {r.texto}
                  </button>
                ))}
              </div>
              <p className="form-hint">Siempre hacia arriba: 2,31 acabado en 9 es 2,39.</p>
            </fieldset>
          </div>

          {hayTarifas && (
            <label className="subida-tarifas">
              <input type="checkbox" checked={tambienTarifas} onChange={e => setTambienTarifas(e.target.checked)} />
              Subir también los precios fijados por tarifa
            </label>
          )}

          <div className="subida-resumen" aria-live="polite">
            {valido ? (
              <>
                <strong>{resumen.cambian} {resumen.cambian === 1 ? 'precio cambia' : 'precios cambian'}</strong>
                {resumen.mediaPct !== null && <span> · de media {resumen.mediaPct > 0 ? '+' : ''}{resumen.mediaPct.toFixed(1).replace('.', ',')} %</span>}
                {resumen.bajoCoste > 0 && (
                  <span className="subida-alerta"><AlertTriangle size={14} /> {resumen.bajoCoste} por debajo de lo que cuestan</span>
                )}
              </>
            ) : <span>Escribe cuánto subir.</span>}
          </div>

          <div className="subida-tabla table-container">
            <table className="table">
              <caption className="solo-lectores">Precio de cada artículo antes y después</caption>
              <thead>
                <tr>
                  <th scope="col">Artículo</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Antes</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Después</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.id} data-bajo-coste={f.bajoCoste || undefined}>
                    <td>
                      <span className="subida-nombre">{f.nombre}</span>
                      <small className="mono">{f.ref}</small>
                    </td>
                    <td className="amount">{formatCurrency(f.antes)}</td>
                    <td className="amount"><strong>{formatCurrency(f.despues)}</strong></td>
                    <td className="amount subida-margen">
                      {f.coste > 0
                        ? <><span className="subida-margen-antes">{margenTexto(f.margenAntes)} <span aria-hidden="true">→</span><span className="solo-lectores"> pasa a </span></span> <strong>{margenTexto(f.margenDespues)}</strong></>
                        : <span className="subida-sin-coste">sin coste</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCerrar} disabled={aplicando}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void aplicar()} disabled={aplicando || !valido || !resumen.cambian}>
            {aplicando ? <Loader2 size={15} className="spin" /> : null}
            {aplicando ? 'Aplicando…' : `Aplicar a ${resumen.cambian}`}
          </button>
        </div>
      </div>
    </div>
  );
}
