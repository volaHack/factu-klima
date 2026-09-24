'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Unlock, Banknote, Sparkles, CheckCircle2, Coins } from 'lucide-react';
import TpvDialogo from './TpvDialogo';
import { PosSession } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface TpvOpenSessionProps {
  mode: 'open';
  onSubmit: (startingCash: number) => Promise<void>;
  onSkip: () => void;
}

/** Los números del turno, para que la ayuda pueda contar cómo ha ido. */
export interface DatosTurno {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasBizum: number;
  numeroVentas: number;
  masVendidos: { nombre: string; unidades: number }[];
}

interface TpvCloseSessionProps {
  mode: 'close';
  session: PosSession;
  onSubmit: (countedCash: number) => Promise<PosSession>;
  onDone: () => void;
  /**
   * Lo vendido en el turno. Es opcional a propósito: si no llega —porque
   * las facturas no se pudieron leer, o porque no hay conexión— la caja se
   * cierra igual y simplemente no hay resumen. Cerrar la caja no puede
   * depender de que un servicio de IA conteste.
   */
  datosTurno?: DatosTurno;
}

type TpvCashSessionProps = TpvOpenSessionProps | TpvCloseSessionProps;

const QUICK_PRESETS = [0, 50, 100, 150, 200];

/** Billetes y monedas en euros, de mayor a menor: el orden en que se cuenta un cajón. */
const PIEZAS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

export default function TpvCashSession(props: TpvCashSessionProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<PosSession | null>(null);
  const [resumen, setResumen] = useState('');
  const [resumenFallido, setResumenFallido] = useState(false);
  // Una `ref` y no un estado: sólo sirve para no pedir el resumen dos
  // veces, y ponerlo en el estado obligaría a escribirlo dentro del efecto
  // —lo que dispara un render en cascada— para algo que no se pinta.
  const resumenPedido = useRef(false);

  const value = Number(amount.replace(',', '.')) || 0;
  const [porPiezas, setPorPiezas] = useState(true);
  const [piezas, setPiezas] = useState<Record<number, number>>({});
  const sumaPiezas = Math.round(PIEZAS.reduce((suma, v) => suma + (piezas[v] || 0) * v, 0) * 100) / 100;
  const contado = porPiezas ? sumaPiezas : value;

  /**
   * EL RESUMEN DEL TURNO
   *
   * Se pide cuando la caja YA está cerrada, no antes. Así el cierre —que es
   * la operación que de verdad importa— nunca espera por él ni falla por él:
   * si la IA no contesta, la pantalla de cierre sale igual, sólo que sin las
   * dos frases de arriba.
   *
   * Los números salen de las ventas del turno, no del modelo: lo único que
   * pone la IA son las palabras.
   */
  const datosTurno = props.mode === 'close' ? props.datosTurno : undefined;
  useEffect(() => {
    if (!closed || !datosTurno || resumenPedido.current) return;
    resumenPedido.current = true;

    let vivo = true;
    fetch('/api/ayuda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modo: 'turno',
        turno: {
          efectivoInicial: closed.startingCash ?? 0,
          efectivoContado: closed.countedCash ?? 0,
          descuadre: (closed.countedCash ?? 0) - (closed.expectedCash ?? 0),
          ...datosTurno,
        },
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (!vivo) return;
        if (d?.texto) setResumen(String(d.texto));
        else setResumenFallido(true);
      })
      // Sin resumen; la caja ya está cerrada, que es lo que importa.
      .catch(() => { if (vivo) setResumenFallido(true); });

    return () => { vivo = false; };
  }, [closed, datosTurno]);

  if (props.mode === 'open') {
    const handleOpen = async () => {
      if (submitting) return;
      setSubmitting(true);
      setError('');
      try {
        await props.onSubmit(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo abrir la caja.');
        setSubmitting(false);
      }
    };

    return (
      <TpvDialogo
        titulo="Abrir caja"
        subtitulo="Cuenta el fondo con el que empiezas: al cerrar se compara con lo que haya."
        icono={<Unlock size={20} />}
        ancho="sm"
        onClose={props.onSkip}
        bloqueado={submitting}
        pie={
          <>
            <button type="button" className="tpvd-boton" onClick={props.onSkip} disabled={submitting}>Vender sin turno</button>
            <button type="submit" form="tpv-abrir" className="tpvd-boton tpvd-boton--principal" style={{ flex: 1 }} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} Abrir con {formatCurrency(value)}
            </button>
          </>
        }
      >
        <form id="tpv-abrir" className="tpvx-pila" onSubmit={e => { e.preventDefault(); void handleOpen(); }}>
          <label className="tpvx-campo-grande">
            <span>Fondo inicial</span>
            <div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                data-autofocus
                aria-label="Fondo inicial en euros"
              />
              <em>€</em>
            </div>
          </label>
          <div className="tpvx-chips">
            {QUICK_PRESETS.map(preset => (
              <button key={preset} type="button" className={amount !== '' && value === preset ? 'is-activo' : ''} onClick={() => setAmount(String(preset))}>
                {preset === 0 ? 'Sin fondo' : formatCurrency(preset)}
              </button>
            ))}
          </div>
          {error && <div className="tpvc-error" role="alert">{error}</div>}
        </form>
      </TpvDialogo>
    );
  }

  const handleClose = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await props.onSubmit(contado);
      setClosed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
      setSubmitting(false);
    }
  };

  if (closed) {
    const diff = closed.cashDifference ?? 0;
    const cuadra = Math.abs(diff) < 0.005;
    const estado = cuadra ? 'cuadra' : diff > 0 ? 'sobra' : 'falta';
    const total = datosTurno ? datosTurno.ventasEfectivo + datosTurno.ventasTarjeta + datosTurno.ventasBizum : null;
    return (
      <TpvDialogo
        titulo="Caja cerrada"
        subtitulo="El arqueo queda registrado con su hora y su diferencia."
        icono={<CheckCircle2 size={22} />}
        tono={cuadra ? 'exito' : 'aviso'}
        ancho="md"
        onClose={props.onDone}
        pie={<button type="button" className="tpvd-boton tpvd-boton--principal" style={{ flex: 1 }} onClick={props.onDone} data-autofocus>Hecho</button>}
      >
        <div className="tpvx-pila">
          <div className={`tpvs-veredicto tpvs-veredicto--${estado}`}>
            <span>{cuadra ? 'La caja cuadra' : diff > 0 ? 'Sobra dinero' : 'Falta dinero'}</span>
            <strong>{cuadra ? formatCurrency(0) : `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}`}</strong>
            <small>Esperado {formatCurrency(closed.expectedCash ?? 0)} · Contado {formatCurrency(closed.countedCash ?? 0)}</small>
          </div>

          {datosTurno && (
            <div className="tpvs-cifras">
              <div><span>Ventas</span><strong>{datosTurno.numeroVentas}</strong></div>
              <div><span>Total vendido</span><strong>{formatCurrency(total ?? 0)}</strong></div>
              <div><span>Efectivo</span><strong>{formatCurrency(datosTurno.ventasEfectivo)}</strong></div>
              <div><span>Tarjeta</span><strong>{formatCurrency(datosTurno.ventasTarjeta)}</strong></div>
              <div><span>Bizum</span><strong>{formatCurrency(datosTurno.ventasBizum)}</strong></div>
              <div><span>Ticket medio</span><strong>{formatCurrency(datosTurno.numeroVentas ? (total ?? 0) / datosTurno.numeroVentas : 0)}</strong></div>
            </div>
          )}

          {datosTurno && datosTurno.masVendidos.length > 0 && (
            <div className="tpvs-top">
              <span>Lo más vendido</span>
              <ol>{datosTurno.masVendidos.slice(0, 3).map(m => <li key={m.nombre}><b>{m.nombre}</b> · {m.unidades} ud</li>)}</ol>
            </div>
          )}

          {datosTurno && !resumenFallido && (
            <div className="tpv-turno-resumen">
              <div className="tpv-turno-resumen-titulo"><Sparkles size={13} /> Cómo ha ido el turno</div>
              {resumen
                ? <p className="tpv-turno-resumen-texto">{resumen}</p>
                : <p className="tpv-turno-resumen-texto" style={{ opacity: 0.7 }}>Repasando el turno…</p>}
            </div>
          )}
        </div>
      </TpvDialogo>
    );
  }

  return (
    <TpvDialogo
      titulo="Cerrar caja"
      subtitulo={<>Turno abierto a las {new Date(props.session.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} con {formatCurrency(props.session.startingCash)} de fondo</>}
      icono={<Lock size={20} />}
      ancho="lg"
      onClose={props.onDone}
      bloqueado={submitting}
      pie={
        <>
          <span className="tpvd-pie-pista">Arqueo ciego: lo esperado se ve al cerrar, para que el recuento sea limpio.</span>
          <button type="submit" form="tpv-cerrar" className="tpvd-boton tpvd-boton--principal" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="spin" /> : <Lock size={18} />} Cerrar con {formatCurrency(contado)}
          </button>
        </>
      }
    >
      <form id="tpv-cerrar" className="tpvx-pila" onSubmit={e => { e.preventDefault(); void handleClose(); }}>
        <div className="tpvs-modo" role="tablist" aria-label="Cómo contar">
          <button type="button" role="tab" aria-selected={porPiezas} className={porPiezas ? 'is-activo' : ''} onClick={() => setPorPiezas(true)}>
            <Coins size={16} /> Contar billetes y monedas
          </button>
          <button type="button" role="tab" aria-selected={!porPiezas} className={!porPiezas ? 'is-activo' : ''} onClick={() => setPorPiezas(false)}>
            <Banknote size={16} /> Escribir el total
          </button>
        </div>

        {porPiezas ? (
          <>
            <div className="tpvs-piezas">
              {PIEZAS.map(v => (
                <label key={v} className={`tpvs-pieza ${v >= 5 ? 'es-billete' : ''}`}>
                  <span className="tpvs-pieza-valor">{v >= 1 ? `${v} €` : `${Math.round(v * 100)} c`}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={piezas[v] || ''}
                    placeholder="0"
                    onChange={e => setPiezas(p => ({ ...p, [v]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    onFocus={e => e.target.select()}
                    aria-label={`Cantidad de ${v >= 1 ? `${v} euros` : `${Math.round(v * 100)} céntimos`}`}
                  />
                  <small>{formatCurrency((piezas[v] || 0) * v)}</small>
                </label>
              ))}
            </div>
            <div className="tpvx-resultado"><span>Total contado</span><strong>{formatCurrency(contado)}</strong></div>
          </>
        ) : (
          <label className="tpvx-campo-grande">
            <span>Efectivo contado en el cajón</span>
            <div>
              <input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} data-autofocus aria-label="Efectivo contado" />
              <em>€</em>
            </div>
          </label>
        )}

        {error && <div className="tpvc-error" role="alert">{error}</div>}
      </form>
    </TpvDialogo>
  );
}
