'use client';

/**
 * FACTURAR LOS ALBARANES MARCADOS
 *
 * La barra que sale al marcar albaranes en una lista (Albaranes o
 * Documentos), la ventana que enseña qué facturas van a salir antes de
 * crearlas y la que enseña las que han salido, con su enlace para
 * revisarlas y emitirlas. Lo que decide cuántas facturas y de qué está en
 * `lib/albaranes/aFactura.ts`; aquí sólo se enseña y se confirma.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Loader2, WifiOff, X } from 'lucide-react';

import type { Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ErrorAlFacturar, explicarRechazados, planDeFacturas, resumenDelPlan, revisarSeleccion,
  type AlbaranParaFacturar,
} from '@/lib/albaranes/aFactura';

const albaranesTexto = (n: number) => `${n} ${n === 1 ? 'albarán' : 'albaranes'}`;

export function BarraFacturarSeleccion({
  seleccion,
  facturar,
  confirmando,
  onConfirmando,
  onQuitar,
  onLimpiar,
  onCreadas,
}: {
  /** Lo marcado, tal como está ahora (si la lista se refresca, con su estado nuevo). */
  seleccion: AlbaranParaFacturar[];
  facturar: (ids: string[]) => Promise<Invoice[]>;
  /** Si la ventana de confirmar está abierta (la abre también el menú de una fila). */
  confirmando: boolean;
  onConfirmando: (abierta: boolean) => void;
  onQuitar: (ids: string[]) => void;
  onLimpiar: () => void;
  onCreadas: (facturas: Invoice[], error?: string) => void;
}) {
  const { facturables, rechazados } = useMemo(() => revisarSeleccion(seleccion), [seleccion]);
  const plan = useMemo(() => planDeFacturas(facturables), [facturables]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un doble clic llega antes de que React pinte el botón desactivado.
  const enCurso = useRef(false);

  if (seleccion.length === 0 && !confirmando) return null;

  // Lo que van a sumar las facturas, con su redondeo por tipo: sumar los
  // totales de cada albarán puede dar un céntimo distinto del que luego
  // sale en la ventana de confirmar.
  const totalMarcado = rechazados.length === 0
    ? plan.total
    : seleccion.reduce((s, a) => s + (a.total || 0), 0);
  const sinConexion = typeof navigator !== 'undefined' && !navigator.onLine;
  const puede = rechazados.length === 0 && facturables.length > 0;

  const cerrar = () => {
    if (trabajando) return;
    setError(null);
    onConfirmando(false);
  };

  const crear = async () => {
    if (enCurso.current || !puede) return;
    enCurso.current = true;
    setTrabajando(true);
    setError(null);
    try {
      const facturas = await facturar(facturables.map(a => a.id));
      onConfirmando(false);
      onCreadas(facturas);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se han podido crear las facturas.';
      if (e instanceof ErrorAlFacturar && e.creadas.length > 0) {
        onConfirmando(false);
        onCreadas(e.creadas, mensaje);
      } else {
        setError(mensaje);
      }
    } finally {
      enCurso.current = false;
      setTrabajando(false);
    }
  };

  return (
    <>
      {seleccion.length > 0 && (
        <div className="bulk-bar facturar-seleccion" role="region" aria-label="Facturar los albaranes marcados">
          <span className="bulk-bar-count">
            {albaranesTexto(seleccion.length)} · {formatCurrency(totalMarcado)}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => { setError(null); onConfirmando(true); }}
            disabled={!puede || trabajando}
          >
            <FileText size={14} /> Facturar…
          </button>
          <span className="bulk-bar-spacer" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onLimpiar}>
            Deseleccionar
          </button>
          {rechazados.length > 0 && (
            <p className="facturar-seleccion-aviso" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                {rechazados.length === seleccion.length ? 'Ninguno se puede facturar' : `${rechazados.length} no se ${rechazados.length === 1 ? 'puede' : 'pueden'} facturar`}
                {': '}{explicarRechazados(rechazados)}. Así no se factura nada.
              </span>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => onQuitar(rechazados.map(r => r.albaran.id))}>
                Quitar {rechazados.length === 1 ? 'ese' : `esos ${rechazados.length}`}
              </button>
            </p>
          )}
        </div>
      )}

      {confirmando && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal facturar-ventana" role="dialog" aria-modal="true" aria-labelledby="facturar-titulo" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id="facturar-titulo">Facturar {albaranesTexto(facturables.length)}</h3>
              <button type="button" className="modal-close" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {!puede ? (
                <p className="facturar-ventana-error" role="alert">
                  {rechazados.length > 0
                    ? `No se puede: ${explicarRechazados(rechazados)}.`
                    : 'No hay albaranes que facturar.'}
                </p>
              ) : (
                <>
                  <p className="facturar-ventana-resumen">{resumenDelPlan(plan)}</p>
                  <ul className="facturar-ventana-lista">
                    {plan.grupos.map(g => (
                      <li key={g.clave}>
                        <span className="facturar-ventana-cliente">
                          <strong>{g.clientName || 'Sin nombre'}</strong>
                          <span>
                            {g.clientNif || 'sin NIF'} · {albaranesTexto(g.albaranes.length)}:{' '}
                            {g.albaranes.map(a => a.number).join(', ')}
                          </span>
                          <span>
                            {g.primeraEntrega === g.ultimaEntrega
                              ? `Entrega del ${formatDate(g.primeraEntrega)}`
                              : `Entregas del ${formatDate(g.primeraEntrega)} al ${formatDate(g.ultimaEntrega)}`}
                            {g.retencionPct ? ` · retención ${g.retencionPct} %` : ''}
                            {g.descuentosPie.some(Boolean) ? ` · dto. pie ${g.descuentosPie.filter(Boolean).join(' + ')} %` : ''}
                          </span>
                        </span>
                        <span className="facturar-ventana-importe">{formatCurrency(g.total)}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.separados.map(s => (
                    <p key={s.clientName} className="facturar-ventana-nota">
                      {s.clientName} va en {s.facturas} facturas: {s.motivo}.
                    </p>
                  ))}
                  <p className="facturar-ventana-nota">
                    Cada factura cita sus albaranes con su fecha y sus líneas. Se crean como <strong>borrador</strong>:
                    revísalas y emítelas desde cada una. Los albaranes quedan como facturados.
                  </p>
                  {sinConexion && (
                    <p className="facturar-ventana-nota facturar-ventana-nota--sinred">
                      <WifiOff size={14} aria-hidden="true" />
                      Sin conexión: se guardan en este equipo y suben solas al volver la conexión. Para emitirlas hará falta conexión.
                    </p>
                  )}
                  {error && <p className="facturar-ventana-error" role="alert">{error}</p>}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={cerrar} disabled={trabajando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={crear} disabled={!puede || trabajando}>
                {trabajando ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
                {trabajando
                  ? 'Creando…'
                  : `Crear ${plan.grupos.length} ${plan.grupos.length === 1 ? 'factura borrador' : 'facturas borrador'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Lo que ha salido: cada factura con su enlace para revisarla y emitirla. */
export function VentanaFacturasCreadas({
  facturas,
  error,
  onCerrar,
}: {
  facturas: Invoice[];
  error?: string;
  onCerrar: () => void;
}) {
  const total = facturas.reduce((s, f) => s + (f.total || 0), 0);
  const n = facturas.length;
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal facturar-ventana" role="dialog" aria-modal="true" aria-labelledby="facturas-creadas-titulo" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" id="facturas-creadas-titulo">
            {n === 1 ? 'Factura borrador creada' : `${n} facturas borrador creadas`}
          </h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="facturar-ventana-resumen">
            <CheckCircle2 size={16} aria-hidden="true" /> {n === 1 ? '1 factura' : `${n} facturas`} · total {formatCurrency(total)}
          </p>
          {error && <p className="facturar-ventana-error" role="alert">{error}</p>}
          <ul className="facturar-ventana-lista">
            {facturas.map(f => (
              <li key={f.id}>
                <span className="facturar-ventana-cliente">
                  <strong className="mono">{f.number}</strong>
                  <span>{f.clientName || 'Sin nombre'} · vence el {formatDate(f.dueDate)}</span>
                </span>
                <span className="facturar-ventana-importe">{formatCurrency(f.total)}</span>
                <Link href={`/facturas/${f.id}`} className="btn btn-sm btn-secondary">
                  Revisar y emitir <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
          <p className="facturar-ventana-nota">
            Están en borrador: todavía no cuentan para Hacienda. Ábrelas, revísalas y pulsa «Emitir y sellar» en cada una
            (emitir necesita conexión).
          </p>
        </div>
        <div className="modal-footer">
          <Link href="/facturas" className="btn btn-ghost">Ver todas las facturas</Link>
          <button type="button" className="btn btn-primary" onClick={onCerrar}>Hecho</button>
        </div>
      </div>
    </div>
  );
}
