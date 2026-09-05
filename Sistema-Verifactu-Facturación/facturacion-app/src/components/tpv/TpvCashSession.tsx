'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Unlock, Banknote, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
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
    fetch('/api/tpv/ayuda', {
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
      <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
        <div className="modal tpv-session-modal" style={{ maxWidth: 460, padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
          {/* Header */}
          <div style={{
            padding: 'var(--space-6)',
            background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
            color: '#ffffff',
            textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-xl)',
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
            }}>
              <Unlock size={28} />
            </div>
            <h3 style={{ margin: '0 0 var(--space-1)', fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>
              Apertura de Caja TPV
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85, lineHeight: 1.5, maxWidth: '38ch' }}>
              Indica el fondo inicial en efectivo con el que empieza el turno para cuadrar el arqueo al cerrar.
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Banknote size={16} style={{ color: 'var(--accent-500)' }} /> Fondo inicial en efectivo (€)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  autoFocus
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    padding: '12px 16px',
                    textAlign: 'right',
                    letterSpacing: '-0.02em',
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  fontSize: '1rem',
                }}>
                  EUR (€)
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <span style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--space-2)' }}>
                Importes rápidos
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {QUICK_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setAmount(String(preset))}
                    style={{
                      flex: '1 0 auto',
                      padding: '6px 12px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      background: value === preset ? 'var(--accent-50)' : 'var(--bg-tertiary)',
                      borderColor: value === preset ? 'var(--accent-500)' : 'var(--border-color)',
                      color: value === preset ? 'var(--accent-500)' : 'var(--text-primary)',
                    }}
                  >
                    {preset === 0 ? 'Sin fondo (0 €)' : `${preset} €`}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="status-panel" style={{ background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
                <AlertCircle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', justifyContent: 'center' }}
                onClick={props.onSkip}
              >
                Vender sin turno
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1.3, padding: '12px', justifyContent: 'center', fontWeight: 700 }}
                onClick={handleOpen}
                disabled={submitting}
              >
                {submitting ? <Loader2 size={18} className="spin" /> : <><Sparkles size={18} /> Abrir caja</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleClose = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await props.onSubmit(value);
      setClosed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
      setSubmitting(false);
    }
  };

  if (closed) {
    const diff = closed.cashDifference ?? 0;
    return (
      <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
        <div className="modal tpv-session-modal" style={{ maxWidth: 440, padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
          <div style={{
            padding: 'var(--space-6)',
            background: 'linear-gradient(135deg, #1e7a45 0%, #14522e 100%)',
            color: '#ffffff',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-xl)',
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
            }}>
              <CheckCircle2 size={32} />
            </div>
            <h3 style={{ margin: '0 0 var(--space-1)', fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>
              Caja Cerrada Correctamente
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.9 }}>
              Arqueo de turno finalizado con registro de auditoría.
            </p>
          </div>

          <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Efectivo esperado:</span>
                <strong>{formatCurrency(closed.expectedCash ?? 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Efectivo contado:</span>
                <strong>{formatCurrency(closed.countedCash ?? 0)}</strong>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                paddingTop: 'var(--space-2)',
                borderTop: '1px solid var(--border-color)',
                color: diff === 0 ? 'var(--color-success)' : diff > 0 ? 'var(--color-info)' : 'var(--color-danger)',
              }}>
                <span>Diferencia de caja:</span>
                <span>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
              </div>
            </div>

            {datosTurno && !resumenFallido && (
              <div className="tpv-turno-resumen">
                <div className="tpv-turno-resumen-titulo">
                  <Sparkles size={13} /> Cómo ha ido el turno
                </div>
                {resumen
                  ? <p className="tpv-turno-resumen-texto">{resumen}</p>
                  : <p className="tpv-turno-resumen-texto" style={{ opacity: 0.7 }}>Repasando el turno…</p>}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 700, marginTop: 'var(--space-5)' }}
              onClick={props.onDone}
            >
              Entendido y Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div className="modal tpv-session-modal" style={{ maxWidth: 460, padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
        <div style={{
          padding: 'var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-xl)',
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)',
          }}>
            <Lock size={28} />
          </div>
          <h3 style={{ margin: '0 0 var(--space-1)', fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>
            Cierre y Arqueo de Caja
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
            Fondo inicial: {formatCurrency(props.session.startingCash)} desde las{' '}
            {new Date(props.session.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        </div>

        <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label required" style={{ fontWeight: 600 }}>Efectivo contado en el cajón (€)</label>
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0,00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                padding: '12px 16px',
                textAlign: 'right',
              }}
            />
          </div>

          {error && (
            <div className="status-panel" style={{ background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
              <AlertCircle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', justifyContent: 'center', fontWeight: 700 }}
              onClick={handleClose}
              disabled={submitting}
            >
              {submitting ? <Loader2 size={18} className="spin" /> : 'Finalizar Arqueo y Cerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
