'use client';

import { useId, useState } from 'react';
import { calcularEnCampo, esOperacion, numeroEspanol, numeroParaCasilla } from '@/lib/calculoEnCampo';

/**
 * Una casilla de número que también hace cuentas (ver lib/calculoEnCampo.ts).
 *
 * Un número suelto se aplica según se teclea, como antes, para que el
 * importe de la línea y el total sigan moviéndose al escribir. Una cuenta
 * (`12*3,5`) se queda escrita mientras se escribe, con el resultado en una
 * pista pequeña debajo, y se resuelve al salir de la casilla o con Intro.
 * Si no se entiende, el texto se queda como estaba, marcado, para
 * corregirlo: no se pierde lo escrito ni se pone un cero por sorpresa.
 *
 * Es `type="text"` y no `number` porque un campo numérico del navegador no
 * deja escribir `*` ni la coma decimal en todos los idiomas. El teclado del
 * móvil sigue siendo el numérico (`inputMode="decimal"`).
 */
export default function CampoNumerico({
  valor,
  onValor,
  vacioSiCero = false,
  placeholder,
  ariaLabel,
  maxDecimales = 6,
  className,
}: {
  valor: number;
  onValor: (n: number) => void;
  /** Con 0 la casilla se ve vacía (los descuentos, las cajas). */
  vacioSiCero?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  maxDecimales?: number;
  className?: string;
}) {
  const idPista = useId();
  // Mientras se edita manda lo escrito; fuera de la casilla, el valor.
  const [texto, setTexto] = useState<string | null>(null);
  const [malo, setMalo] = useState<string | null>(null);

  const mostrado = (n: number) => (vacioSiCero && !n ? '' : numeroParaCasilla(n, maxDecimales));
  const enCurso = texto ?? malo;
  const cuenta = enCurso !== null && esOperacion(enCurso);
  const resultado = cuenta ? calcularEnCampo(enCurso) : null;

  const alEscribir = (t: string) => {
    setTexto(t);
    setMalo(null);
    if (!t.trim()) { onValor(0); return; }
    if (esOperacion(t)) return;
    const n = numeroEspanol(t.trim().replace(/^-/, ''));
    if (n !== null) onValor(t.trim().startsWith('-') ? -n : n);
  };

  /** Al salir de la casilla: la cuenta, resuelta; lo que no se entiende, tal cual. */
  const resolver = () => {
    const t = texto ?? malo;
    if (t === null) return;
    const n = t.trim() ? calcularEnCampo(t) : 0;
    if (n === null) {
      // Se queda el texto para corregirlo; el valor no cambia.
      setTexto(null);
      setMalo(t);
      return;
    }
    if (n !== valor) onValor(n);
    setTexto(null);
    setMalo(null);
  };

  return (
    <span className="campo-calculo">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={malo !== null || undefined}
        aria-describedby={cuenta || malo !== null ? idPista : undefined}
        value={enCurso ?? mostrado(valor)}
        onFocus={e => { if (texto === null) setTexto(malo ?? mostrado(valor)); e.currentTarget.select(); }}
        onChange={e => alEscribir(e.target.value)}
        onBlur={resolver}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Con una cuenta, Intro la resuelve y el cursor se queda para
            // ver el resultado; con un número, pasa a la línea siguiente.
            const t = texto ?? malo;
            if (t !== null && esOperacion(t)) {
              e.preventDefault();
              e.stopPropagation();
              const n = calcularEnCampo(t);
              if (n === null) { setMalo(t); return; }
              onValor(n);
              setTexto(numeroParaCasilla(n, maxDecimales));
              setMalo(null);
            }
          } else if (e.key === 'Escape' && texto !== null) {
            setTexto(mostrado(valor));
            setMalo(null);
          }
        }}
      />
      {(cuenta || malo !== null) && (
        <span id={idPista} className={`campo-calculo-pista${malo !== null || resultado === null ? ' es-mala' : ''}`} aria-live="polite">
          {malo !== null
            ? 'No entiendo la cuenta'
            : resultado === null ? '…' : `= ${numeroParaCasilla(resultado, maxDecimales)}`}
        </span>
      )}
    </span>
  );
}
