'use client';

/**
 * El objetivo de facturación del mes: cuánto llevas, a dónde llegas a este
 * ritmo y lo que te falta cada día laborable. Sin objetivo puesto, propone
 * uno con lo que ya facturas (ver `objetivoPropuesto`).
 *
 * La barra lleva dos capas: lo facturado, maciza, y lo que se proyecta al
 * ritmo actual, tenue por delante. El texto de debajo dice lo mismo con
 * palabras, para quien no ve la barra.
 */

import { useEffect, useId, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { getCurrentUserId } from '@/lib/storage';
import { guardarObjetivo, leerImporte, leerObjetivo, progresoObjetivo } from '@/lib/objetivoMes';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

export default function ObjetivoMes({ facturado, propuesto, hoy }: { facturado: number; propuesto: number | null; hoy: string }) {
  const { error: toastError } = useToast();
  const campo = useId();
  // `undefined` mientras se averigua la cuenta: así no parpadea la propuesta.
  const [cuenta, setCuenta] = useState<string | null | undefined>(undefined);
  const [objetivo, setObjetivo] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');

  useEffect(() => {
    let vivo = true;
    getCurrentUserId().then(id => {
      if (!vivo) return;
      setCuenta(id);
      if (id) setObjetivo(leerObjetivo(id));
    }).catch(() => { if (vivo) setCuenta(null); });
    return () => { vivo = false; };
  }, []);

  if (cuenta === undefined) return null;

  const guardar = (importe: number | null) => {
    if (cuenta && !guardarObjetivo(cuenta, importe)) {
      toastError('No se ha podido guardar', 'Este navegador no deja guardar datos; el objetivo valdrá hasta que cierres la pestaña.');
    }
    setObjetivo(importe);
    setEditando(false);
  };
  const abrirEdicion = () => {
    setBorrador(String(objetivo ?? propuesto ?? ''));
    setEditando(true);
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    guardar(leerImporte(borrador));
  };

  const nombreMes = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-ES', { month: 'long' });
  const p = objetivo ? progresoObjetivo(objetivo, facturado, hoy) : null;
  const ancho = (n: number) => `${Math.min(100, Math.max(0, n))}%`;

  return (
    <section className="asesor-hoja objetivo-mes" aria-labelledby={`${campo}-titulo`}>
      {/* La misma cabecera que las demás tarjetas del panel: título,
          subtítulo y la acción a la derecha. Sin el icono en su baldosa,
          que sólo llevaban estas dos hojas. */}
      <div className="asesor-hoja-cabeza">
        <div>
          <h2 id={`${campo}-titulo`} className="asesor-hoja-titulo">Objetivo de {nombreMes}</h2>
          <p className="asesor-hoja-sub">{p ? `${formatCurrency(facturado)} de ${formatCurrency(p.objetivo)}` : 'Ponte una meta y te digo si llegas'}</p>
        </div>
        {p && !editando && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm objetivo-editar" onClick={abrirEdicion} aria-label="Cambiar el objetivo del mes" title="Cambiar el objetivo">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {editando ? (
        <form className="objetivo-form" onSubmit={enviar}>
          <label htmlFor={campo} className="solo-lectores">Objetivo de facturación mensual en euros</label>
          <div className="objetivo-campo">
            <input id={campo} className="form-input" inputMode="decimal" autoFocus value={borrador} onChange={e => setBorrador(e.target.value)} placeholder="Por ejemplo, 12000" />
            <span aria-hidden="true">€</span>
          </div>
          <button type="submit" className="btn btn-primary btn-sm"><Check size={14} aria-hidden /> Guardar</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(false)}><X size={14} aria-hidden /> Cancelar</button>
          {objetivo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => guardar(null)}>Quitar objetivo</button>}
        </form>
      ) : p ? (
        <>
          <div
            className={`objetivo-barra${p.llega ? ' llega' : ''}`}
            role="progressbar"
            aria-label={`Facturado en ${nombreMes}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(p.objetivo)}
            aria-valuenow={Math.round(facturado)}
            aria-valuetext={p.texto}
          >
            <span className="objetivo-barra-proyeccion" style={{ width: ancho((p.proyeccion / p.objetivo) * 100) }} />
            <span className="objetivo-barra-hecho" style={{ width: ancho(p.porcentaje) }} />
          </div>
          <p className={`objetivo-texto${p.falta <= 0 ? ' cumplido' : p.llega ? ' llega' : ''}`}>{p.texto}</p>
        </>
      ) : (
        <div className="objetivo-propuesta">
          <p>
            {propuesto
              ? <>Con lo que facturas, una meta razonable para este mes es <strong>{formatCurrency(propuesto)}</strong>: tu media de los tres últimos meses y un 10 % más.</>
              : 'Cuando lleves unos meses facturando te propondré una meta con tu media.'}
          </p>
          <div className="objetivo-propuesta-acciones">
            {propuesto && <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar(propuesto)}><Check size={14} aria-hidden /> Usar {formatCurrency(propuesto)}</button>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={abrirEdicion}><Pencil size={14} aria-hidden /> Poner otra cifra</button>
          </div>
        </div>
      )}
    </section>
  );
}
