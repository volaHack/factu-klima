'use client';

/**
 * EL BOTÓN DE AYUDA DEL MOSTRADOR
 *
 * Un TPV se aprende en dos días, pero el tercer día llega el caso raro: el
 * cliente quiere pagar la mitad en efectivo, hay que devolver algo de ayer,
 * el precio estaba mal. Y entonces no hay a quién preguntar, porque el
 * encargado no está y el manual —si existe— no lo ha leído nadie.
 *
 * Esto es esa persona a la que preguntar. Con dos condiciones que lo
 * distinguen de un chat pegado con cinta adhesiva:
 *
 * 1. SABE DÓNDE ESTÁ. Le llega lo que hay en el carrito, si la caja está
 *    abierta, cuántas ventas hay aparcadas y si hay conexión. Así puede
 *    decir «tienes la caja cerrada, ábrela primero» en vez de contestar en
 *    abstracto.
 *
 * 2. NO TOCA NADA. Responde texto. No cobra, no anula, no cambia el
 *    carrito. En una caja registradora, cada operación es un registro
 *    fiscal: quien la ejecuta tiene que ser la persona, siempre.
 *
 * Las preguntas de ejemplo no son decorado. Un cajero con un cliente
 * delante no se pone a escribir: pulsa una.
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2, CornerDownLeft } from 'lucide-react';

export interface ContextoAyuda {
  lineas: number;
  total: number;
  cajaAbierta: boolean;
  aparcadas: number;
  modo: string;
  sinConexion: boolean;
}

interface Props {
  contexto: ContextoAyuda;
  onClose: () => void;
}

/** Lo que de verdad se pregunta detrás de un mostrador. */
const EJEMPLOS = [
  'El cliente quiere pagar mitad en efectivo y mitad con tarjeta',
  'Me he equivocado de precio y ya he cobrado',
  'Quiero atender a otro cliente sin perder esta venta',
  'Cómo cobro algo que no está en el catálogo',
  'El código de barras no lo reconoce',
  'Cómo cierro la caja al acabar el turno',
];

export default function TpvAyudaModal({ contexto, onClose }: Props) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    campoRef.current?.focus();
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const preguntar = async (texto: string) => {
    const limpia = texto.trim();
    if (!limpia || cargando) return;
    setPregunta(limpia);
    setCargando(true);
    setError('');
    setRespuesta('');
    try {
      const res = await fetch('/api/tpv/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'duda', pregunta: limpia, contexto }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos?.error || 'No se ha podido responder.');
      setRespuesta(String(datos.texto ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido responder.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-ayuda-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Ayuda del TPV">
        <div className="modal-header">
          <div className="tpv-ayuda-titulo">
            <span className="tpv-ayuda-chispa"><Sparkles size={18} /></span>
            <div>
              <h3 className="modal-title">Ayuda</h3>
              <p className="tpv-ayuda-sub">Pregunta lo que necesites. Sabe cómo tienes el mostrador ahora mismo.</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="modal-body tpv-ayuda-cuerpo">
          {!respuesta && !cargando && !error && (
            <div className="tpv-ayuda-ejemplos">
              {EJEMPLOS.map(e => (
                <button key={e} type="button" className="tpv-ayuda-ejemplo" onClick={() => preguntar(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {cargando && (
            <div className="tpv-ayuda-cargando">
              <Loader2 size={18} className="spin" />
              <span>Pensando…</span>
            </div>
          )}

          {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}

          {respuesta && (
            <div className="tpv-ayuda-respuesta">
              <p className="tpv-ayuda-pregunta-eco">{pregunta}</p>
              {/* El modelo contesta con saltos de línea y a veces con pasos
                  numerados. Se respetan tal cual: reformatearlos aquí sería
                  adivinar, y `white-space: pre-wrap` ya lo pinta bien. */}
              <div className="tpv-ayuda-texto">{respuesta}</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setRespuesta(''); setPregunta(''); campoRef.current?.focus(); }}
              >
                Preguntar otra cosa
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer tpv-ayuda-pie">
          <textarea
            ref={campoRef}
            className="form-textarea tpv-ayuda-campo"
            rows={2}
            placeholder="Escribe tu duda…"
            value={pregunta}
            onChange={e => setPregunta(e.target.value)}
            onKeyDown={e => {
              // Enter envía; Mayús+Enter hace salto de línea. Detrás de un
              // mostrador se escribe con una mano y sin buscar botones.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void preguntar(pregunta); }
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => void preguntar(pregunta)}
            disabled={cargando || !pregunta.trim()}
          >
            {cargando ? <Loader2 size={16} className="spin" /> : <CornerDownLeft size={16} />}
            Preguntar
          </button>
        </div>
      </div>
    </div>
  );
}
