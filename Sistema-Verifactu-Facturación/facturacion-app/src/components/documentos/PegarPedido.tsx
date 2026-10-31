'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ClipboardPaste, HelpCircle, Sparkles, X } from 'lucide-react';
import {
  conCajasElegidas, elegirCandidato, leerPedido, textoCantidad,
  type HabitualParaPedido, type PedidoLeido, type RenglonPedido,
} from '@/lib/pedidoPegado';
import type { Product } from '@/lib/types';
import DialogoRapido from './DialogoRapido';

const EJEMPLO = '10 cajas aceite\n5 queso curado\nagua 1,5 x 20\n2 cj vino tinto';

/**
 * «Pegar pedido»: se pega el WhatsApp o el correo del cliente y sale cada
 * renglón con el artículo que se ha entendido (lib/pedidoPegado.ts). Antes
 * de añadir nada se repasa: lo reconocido va marcado, lo dudoso se elige
 * entre dos o tres, y lo no encontrado se dice para ponerlo a mano.
 */
export default function PegarPedido({ productos, habituales, onAnadir, onCerrar }: {
  productos: readonly Product[];
  habituales: readonly HabitualParaPedido[];
  /** Los renglones elegidos, ya con su artículo y sus cantidades. */
  onAnadir: (renglones: RenglonPedido[], noEncontrados: string[]) => void;
  onCerrar: () => void;
}) {
  const idTexto = useId();
  const [texto, setTexto] = useState('');
  const [leido, setLeido] = useState<PedidoLeido | null>(null);
  // Qué renglones se añaden (por posición). Lo dudoso también va marcado,
  // con el candidato más probable: se ve al lado y se cambia de un toque.
  const [fuera, setFuera] = useState<ReadonlySet<number>>(() => new Set());

  // Al pasar del texto a la vista previa, el foco va al resumen: el botón
  // que se pulsó ya no está, y sin esto el teclado se quedaría fuera.
  const resumen = useRef<HTMLParagraphElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (leido) resumen.current?.focus();
    else caja.current?.focus();
  }, [leido]);

  const leer = () => {
    setLeido(leerPedido(texto, productos, habituales));
    setFuera(new Set());
  };

  const cambiar = (i: number, cambio: (r: RenglonPedido) => RenglonPedido) => {
    setLeido(l => (l ? { ...l, renglones: l.renglones.map((r, j) => (j === i ? cambio(r) : r)) } : l));
  };

  const alternar = (i: number) => setFuera(prev => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });

  const elegidos = leido?.renglones.filter((r, i) => r.elegido && !fuera.has(i)) ?? [];
  const noEncontrados = leido?.renglones.filter(r => r.estado === 'no-encontrado').map(r => r.original) ?? [];
  const cuenta = (estado: RenglonPedido['estado']) => leido?.renglones.filter(r => r.estado === estado).length ?? 0;

  const pie = leido ? (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setLeido(null)}>Volver al texto</button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!elegidos.length}
        onClick={() => onAnadir(elegidos, noEncontrados)}
      >
        <Check size={16} aria-hidden /> {elegidos.length === 1 ? 'Añadir 1 línea' : `Añadir ${elegidos.length} líneas`}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={!texto.trim()} onClick={leer}>
        <Sparkles size={16} aria-hidden /> Leer el pedido
      </button>
    </>
  );

  return createPortal(
    <DialogoRapido titulo="Pegar pedido" icono={<ClipboardPaste size={18} aria-hidden />} onCerrar={onCerrar} pie={pie} className="pegar-pedido">
      {!leido ? (
        <>
          <label className="form-label" htmlFor={idTexto}>Pega aquí el WhatsApp o el correo con el pedido</label>
          <textarea
            id={idTexto}
            ref={caja}
            className="form-input pegar-caja"
            rows={8}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={EJEMPLO}
            data-foco-inicial
            onKeyDown={e => {
              // Ctrl/⌘+Intro lee sin ir al botón.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) { e.preventDefault(); leer(); }
            }}
          />
          <p className="form-hint">
            Un artículo por línea. Entiende «10 cajas», «2 cj», «3 pack» (cajas por las unidades que trae cada una), «6 uds» y «agua 1,5 x 20».
            Lo que suele pedir este cliente va primero.
          </p>
        </>
      ) : (
        <>
          <p className="pegar-resumen" role="status" tabIndex={-1} ref={resumen}>
            {cuenta('reconocido') > 0 && <span className="pegar-chip es-ok">{cuenta('reconocido')} reconocidos</span>}
            {cuenta('dudoso') > 0 && <span className="pegar-chip es-duda">{cuenta('dudoso')} con dudas</span>}
            {cuenta('no-encontrado') > 0 && <span className="pegar-chip es-falta">{cuenta('no-encontrado')} sin encontrar</span>}
            {!leido.renglones.length && <span>No he encontrado ningún artículo en ese texto.</span>}
          </p>
          <ul className="pegar-lista">
            {leido.renglones.map((r, i) => {
              const elegido = r.candidatos.find(c => c.productId === r.elegido);
              const tieneUc = !!elegido?.unitsPerPackage;
              const incluido = !!r.elegido && !fuera.has(i);
              return (
                <li key={i} className={`pegar-renglon es-${r.estado}${incluido ? '' : ' esta-fuera'}`}>
                  <div className="pegar-renglon-cabeza">
                    {r.estado === 'no-encontrado' ? (
                      <X size={16} className="pegar-icono" aria-hidden />
                    ) : (
                      <input
                        type="checkbox"
                        checked={incluido}
                        onChange={() => alternar(i)}
                        aria-label={`Añadir «${r.original}»`}
                      />
                    )}
                    <span className="pegar-original">«{r.original}»</span>
                    {r.estado === 'dudoso' && <HelpCircle size={14} className="pegar-icono" aria-label="Con dudas" />}
                  </div>

                  {r.estado === 'no-encontrado' ? (
                    <p className="pegar-detalle">No lo encuentro en tus artículos: añádelo a mano después.</p>
                  ) : r.estado === 'dudoso' ? (
                    <fieldset className="pegar-opciones">
                      <legend className="pegar-detalle">¿Cuál es?</legend>
                      {r.candidatos.map(c => (
                        <label key={c.productId} className={`pegar-opcion${c.productId === r.elegido ? ' es-elegida' : ''}`}>
                          <input
                            type="radio"
                            name={`pegar-${i}`}
                            checked={c.productId === r.elegido}
                            onChange={() => cambiar(i, x => elegirCandidato(x, c.productId, habituales))}
                          />
                          <span className="pegar-opcion-nombre">{c.nombre}</span>
                          <span className="pegar-opcion-ref">{c.ref}{c.habitual ? ' · lo suele pedir' : ''}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="pegar-detalle">
                      <strong>{elegido?.nombre}</strong>
                      {elegido?.habitual && <span className="pegar-opcion-ref"> · lo suele pedir</span>}
                    </p>
                  )}

                  {r.elegido && (
                    <div className="pegar-cantidad">
                      <span>{textoCantidad(r)}</span>
                      {tieneUc && (
                        <span className="pegar-segmento" role="group" aria-label={`Cajas o unidades de «${r.original}»`}>
                          <button type="button" aria-pressed={r.cajasFinal} onClick={() => cambiar(i, x => conCajasElegidas(x, true))}>Cajas</button>
                          <button type="button" aria-pressed={!r.cajasFinal} onClick={() => cambiar(i, x => conCajasElegidas(x, false))}>Uds.</button>
                        </span>
                      )}
                    </div>
                  )}
                  {r.nota && <p className="pegar-nota">{r.nota}</p>}
                </li>
              );
            })}
          </ul>
          {leido.apartados.length > 0 && (
            <p className="pegar-apartados">Sin tener en cuenta: {leido.apartados.map(a => `«${a}»`).join(', ')}</p>
          )}
        </>
      )}
    </DialogoRapido>,
    document.body,
  );
}
