'use client';

/**
 * Rectificar una factura emitida: qué tipo de rectificativa, por qué y
 * cuánto de cada línea. Lo que se puede rectificar lo dice
 * lib/rectificativas.ts (nunca más de lo que queda, nunca dos borradores a
 * la vez); aquí solo se elige.
 *
 * La rectificativa nace en borrador. Prepararla funciona sin conexión;
 * emitirla, desde su ficha, necesita conexión como cualquier factura.
 */

import { useMemo, useState } from 'react';
import { FileDiff, X } from 'lucide-react';
import type { CompanySettings, Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { rectificar } from '@/lib/documentos';
import { lineasPorRectificar, TIPOS_RECTIFICATIVA, type TipoRectificativa } from '@/lib/rectificativas';
import { crearRectificativa } from '@/lib/storage';

interface Props {
  factura: Invoice;
  docs: Invoice[];
  settings: CompanySettings;
  onClose: () => void;
  onCreada: (rectificativa: Invoice) => void;
}

export default function RectificarModal({ factura, docs, settings, onClose, onCreada }: Props) {
  const simplificada = Boolean(factura.posSessionId) || factura.tipoFacturaFiscal === 'F2' || factura.tipoFacturaFiscal === 'F3';
  const lineas = useMemo(() => lineasPorRectificar(factura, docs).filter(l => l.queda !== 0), [factura, docs]);
  const [tipo, setTipo] = useState<TipoRectificativa>(simplificada ? 'R5' : 'R1');
  const [motivo, setMotivo] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>(
    () => Object.fromEntries(lineas.map(l => [l.linea.id, Math.abs(l.queda)])),
  );
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');
  const sinConexion = typeof navigator !== 'undefined' && !navigator.onLine;

  // La vista previa sale de la misma función que la crea: lo que se ve es
  // lo que se guarda.
  const previa = useMemo(() => {
    try {
      return { rect: rectificar(factura, settings, { docs, tipo, motivo, cantidades }), error: '' };
    } catch (e) {
      return { rect: null, error: e instanceof Error ? e.message : 'No se puede rectificar así.' };
    }
  }, [factura, settings, docs, tipo, motivo, cantidades]);

  const totalPrevio = previa.rect?.lineItems.reduce((s, l) => s + l.total, 0) ?? 0;
  const tipos = TIPOS_RECTIFICATIVA.filter(t => (t.tipo === 'R5') === simplificada);
  const ayuda = TIPOS_RECTIFICATIVA.find(t => t.tipo === tipo)?.cuando;

  const guardar = async () => {
    if (!motivo.trim()) {
      setFallo('Escribe el motivo: va impreso en la rectificativa y es lo primero que mira el cliente.');
      return;
    }
    if (previa.error) {
      setFallo(previa.error);
      return;
    }
    setGuardando(true);
    setFallo('');
    try {
      const rect = await crearRectificativa(factura.id, { tipo, motivo, cantidades });
      onCreada(rect);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo crear la rectificativa.');
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 680, padding: 0, overflow: 'hidden' }} role="dialog" aria-labelledby="rectificar-titulo">
        <div style={{
          padding: 'var(--space-5) var(--space-6)', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 id="rectificar-titulo" className="card-title" style={{ margin: 0 }}>
              <FileDiff size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Rectificar {factura.number}
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {factura.clientName} · emitida el {formatDate(factura.issueDate)} · {formatCurrency(factura.total)}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <p style={{ marginTop: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            La factura original no cambia: la rectificativa resta lo que elijas (por diferencias) y queda en borrador para que la emitas.
          </p>

          <div className="form-row">
            <div className="form-group rectificar-tipo">
              <label className="form-label required" htmlFor="rectificar-tipo">Tipo</label>
              <select id="rectificar-tipo" className="form-select" value={tipo} onChange={e => setTipo(e.target.value as TipoRectificativa)} disabled={simplificada}>
                {tipos.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
              </select>
              {ayuda && <small>{ayuda}</small>}
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="rectificar-motivo">Motivo</label>
              <input
                id="rectificar-motivo" type="text" className="form-input" value={motivo} maxLength={200}
                onChange={e => setMotivo(e.target.value)} placeholder="Ej.: devolución de 2 cajas rotas"
              />
            </div>
          </div>

          <table className="rectificar-lineas" style={{ marginTop: 'var(--space-4)' }}>
            <thead>
              <tr><th>Producto</th><th className="num">Precio</th><th className="num">Queda</th><th className="num">A rectificar</th></tr>
            </thead>
            <tbody>
              {lineas.map(({ linea, queda }) => (
                <tr key={linea.id}>
                  <td>{linea.productName}</td>
                  <td className="num">{formatCurrency(linea.unitPrice)}</td>
                  <td className="num">{queda}</td>
                  <td className="num">
                    <input
                      type="number" className="form-input" min={0} max={Math.abs(queda)} step="any"
                      aria-label={`Unidades a rectificar de ${linea.productName}`}
                      value={cantidades[linea.id] ?? 0}
                      onChange={e => setCantidades(c => ({ ...c, [linea.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rectificar-total">
            <span>La rectificativa quedará en</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalPrevio)}</strong>
          </div>

          {(fallo || (previa.error && !/motivo/i.test(previa.error))) && (
            <div className="callout callout-danger" role="alert" style={{ marginTop: 'var(--space-3)' }}>
              <p>{fallo || previa.error}</p>
            </div>
          )}
          {sinConexion && (
            <div className="callout callout-info" role="status" style={{ marginTop: 'var(--space-3)' }}>
              <p>Sin conexión: puedes prepararla ahora. Para emitirla hará falta conexión, porque la huella y el registro Veri*Factu los pone el servidor.</p>
            </div>
          )}
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando || Boolean(previa.error)}>
            {guardando ? 'Creando…' : 'Crear rectificativa en borrador'}
          </button>
        </div>
      </div>
    </div>
  );
}
