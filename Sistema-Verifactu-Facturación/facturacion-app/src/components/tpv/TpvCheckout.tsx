'use client';

/**
 * COBRAR
 *
 * Es la pantalla que más veces se abre al día, así que está pensada para
 * hacerse sin ratón y sin pensar:
 *  - El total, enorme, arriba: es lo que se le dice al cliente.
 *  - Efectivo viene elegido (es lo más habitual en mostrador); E, T y B
 *    cambian a efectivo, tarjeta y Bizum. Letras y no números: los
 *    números son para teclear lo entregado, y «20» no puede acabar
 *    cambiando el cobro a tarjeta.
 *  - Con efectivo se teclea lo entregado con los números del teclado, o
 *    se toca un billete sugerido: no «+5 €», sino los importes que de
 *    verdad da la gente (lo justo, el siguiente euro, el siguiente
 *    billete…). El cambio sale grande y en verde: es lo que hay que
 *    devolver y lo que no se puede equivocar.
 *  - Intro cobra. Esc vuelve atrás o cierra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Smartphone, Loader2, Delete, Wallet, CheckCircle2 } from 'lucide-react';

import { PaymentMethod } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import TpvDialogo from './TpvDialogo';

interface TpvCheckoutProps {
  total: number;
  onConfirm: (method: PaymentMethod, cashGiven?: number) => Promise<void>;
  onClose: () => void;
}

const METODOS = [
  { id: PaymentMethod.EFECTIVO, nombre: 'Efectivo', icono: Banknote, tecla: 'E' },
  { id: PaymentMethod.TARJETA, nombre: 'Tarjeta', icono: CreditCard, tecla: 'T' },
  { id: PaymentMethod.BIZUM, nombre: 'Bizum', icono: Smartphone, tecla: 'B' },
] as const;

/**
 * Los importes que de verdad entrega un cliente para pagar `total`: el
 * siguiente euro, y los billetes de 5, 10, 20, 50 y 100 que lo cubren.
 * Sin repetir y sin el importe exacto, que tiene su propio botón.
 */
export function billetesSugeridos(total: number): number[] {
  const candidatos = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    20, 50, 100,
  ].filter(v => v > total + 0.001);
  return [...new Set(candidatos)].sort((a, b) => a - b).slice(0, 4);
}

export default function TpvCheckout({ total, onConfirm, onClose }: TpvCheckoutProps) {
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [cashInput, setCashInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const esEfectivo = method === PaymentMethod.EFECTIVO;
  const cashGiven = Number(cashInput.replace(',', '.')) || 0;
  const falta = Math.max(0, total - cashGiven);
  const change = useMemo(() => Math.max(0, cashGiven - total), [cashGiven, total]);
  // Sin teclear nada, efectivo se da por exacto: el caso de «me lo da justo».
  const canConfirm = !esEfectivo || !cashInput || cashGiven >= total - 0.001;
  const sugeridos = useMemo(() => billetesSugeridos(total), [total]);

  const appendDigit = useCallback((d: string) => {
    setCashInput(prev => {
      if ((d === '.' || d === ',') && /[.,]/.test(prev)) return prev;
      const siguiente = prev + (d === ',' ? '.' : d);
      // Dos decimales como mucho.
      if (/\.\d{3,}$/.test(siguiente)) return prev;
      return siguiente.slice(0, 9);
    });
  }, []);
  const backspace = useCallback(() => setCashInput(prev => prev.slice(0, -1)), []);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const entregado = esEfectivo ? (cashInput ? cashGiven : total) : undefined;
      await onConfirm(method, entregado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar la venta.');
      setSubmitting(false);
    }
  }, [canConfirm, submitting, esEfectivo, cashInput, cashGiven, total, method, onConfirm]);

  // El teclado del mostrador: números, coma, borrar, Intro, y E-T-B para
  // el método.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || submitting) return;
      if (e.key === 'Enter') { e.preventDefault(); void handleConfirm(); return; }
      const m = METODOS.find(x => x.tecla === e.key.toUpperCase());
      if (m) { e.preventDefault(); setMethod(m.id); setError(''); return; }
      if (!esEfectivo) return;
      if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') { e.preventDefault(); appendDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (e.key === 'Delete') { e.preventDefault(); setCashInput(''); }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [appendDigit, backspace, cashInput, esEfectivo, handleConfirm, submitting]);

  const textoBoton = submitting
    ? 'Cobrando…'
    : esEfectivo && cashInput && change > 0
      ? `Cobrar · devolver ${formatCurrency(change)}`
      : `Cobrar ${formatCurrency(total)}`;

  return (
    <TpvDialogo
      titulo="Cobrar"
      subtitulo="Elige cómo paga y confirma con Intro"
      icono={<Wallet size={20} />}
      ancho="lg"
      onClose={onClose}
      bloqueado={submitting}
      className="tpvc"
      pie={
        <>
          <span className="tpvd-pie-pista"><kbd>Esc</kbd> cerrar · <kbd>Intro</kbd> cobrar</span>
          <button
            type="button"
            className="tpvd-boton tpvd-boton--principal tpvc-cobrar"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
          >
            {submitting ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} />}
            {textoBoton}
          </button>
        </>
      }
    >
      <div className="tpvc-rejilla">
        {/* ── Izquierda: el importe y el método ── */}
        <div className="tpvc-izquierda">
          <div className="tpvc-total">
            <span>Total a cobrar</span>
            <strong>{formatCurrency(total)}</strong>
          </div>

          <div className="tpvc-metodos" role="radiogroup" aria-label="Forma de pago">
            {METODOS.map(m => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={method === m.id}
                className={`tpvc-metodo ${method === m.id ? 'is-activo' : ''}`}
                onClick={() => { setMethod(m.id); setError(''); }}
              >
                <m.icono size={22} />
                <span>{m.nombre}</span>
                <kbd>{m.tecla}</kbd>
              </button>
            ))}
          </div>
        </div>

        {/* ── Derecha: lo que pide cada método ── */}
        <div className="tpvc-derecha">
          {esEfectivo ? (
            <>
              <div className="tpvc-pantalla">
                <div>
                  <span>Entregado</span>
                  <strong>{cashInput ? formatCurrency(cashGiven) : formatCurrency(total)}</strong>
                  {!cashInput && <small>Justo · teclea otra cantidad si no</small>}
                </div>
                <div className={`tpvc-cambio ${cashInput && falta > 0 ? 'is-falta' : ''}`}>
                  <span>{cashInput && falta > 0 ? 'Falta' : 'Cambio'}</span>
                  <strong>{formatCurrency(cashInput && falta > 0 ? falta : change)}</strong>
                </div>
              </div>

              <div className="tpvc-billetes">
                <button type="button" onClick={() => setCashInput(total.toFixed(2))}>Justo</button>
                {sugeridos.map(v => (
                  <button key={v} type="button" onClick={() => setCashInput(v.toFixed(2))}>{formatCurrency(v)}</button>
                ))}
              </div>

              <div className="tpvc-teclado">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map(k => (
                  <button key={k} type="button" onClick={() => appendDigit(k)}>{k}</button>
                ))}
                <button type="button" onClick={backspace} aria-label="Borrar" onDoubleClick={() => setCashInput('')}>
                  <Delete size={20} />
                </button>
              </div>
            </>
          ) : (
            <div className="tpvc-datafono">
              <span className="tpvc-datafono-icono">
                {method === PaymentMethod.TARJETA ? <CreditCard size={34} /> : <Smartphone size={34} />}
              </span>
              <strong>
                {method === PaymentMethod.TARJETA
                  ? `Pasa ${formatCurrency(total)} por el datáfono`
                  : `Pide un Bizum de ${formatCurrency(total)}`}
              </strong>
              <p>
                {method === PaymentMethod.TARJETA
                  ? 'Cuando el datáfono dé la operación por aprobada, confirma aquí. Si la deniega, vuelve a Efectivo o prueba otra tarjeta.'
                  : 'Cuando veas el pago recibido en el móvil, confirma aquí. No confirmes con la captura del cliente: espera a que llegue.'}
              </p>
            </div>
          )}

          {error && <div className="tpvc-error" role="alert">{error}</div>}
        </div>
      </div>
    </TpvDialogo>
  );
}
