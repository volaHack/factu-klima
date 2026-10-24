'use client';

/**
 * DAR DE ALTA UN CLIENTE O PROVEEDOR SIN SALIR DE DONDE SE ESTÁ
 *
 * Desde el buscador de una factura, un albarán o un cobro: si el cliente no
 * existe, se crea aquí con lo imprescindible y queda elegido. Lo demás
 * (tarifa, ruta, condiciones…) se completa luego en su ficha.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, AlertTriangle } from 'lucide-react';
import type { Client } from '@/lib/types';
import { PaymentMethod } from '@/lib/types';
import { saveClient } from '@/lib/storage';
import { isValidNif } from '@/lib/validation/nif';
import { generateId } from '@/lib/utils';
import { plano } from '@/lib/buscarProductos';

export default function AltaRapidaFicha({ textoInicial, esProveedor, existentes, onCreada, onElegirExistente, onCerrar }: {
  textoInicial: string;
  esProveedor: boolean;
  existentes: readonly Client[];
  onCreada: (c: Client) => void;
  onElegirExistente: (c: Client) => void;
  onCerrar: () => void;
}) {
  // Lo escrito en el buscador: si parece un NIF va al NIF; si no, al nombre.
  const pareceNif = /^[a-z0-9]{8,10}$/i.test(textoInicial.replace(/[\s-]/g, '')) && /\d{5,}/.test(textoInicial);
  const [nombre, setNombre] = useState(pareceNif ? '' : textoInicial);
  const [nif, setNif] = useState(pareceNif ? textoInicial.toUpperCase().replace(/[\s-]/g, '') : '');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [cp, setCp] = useState('');
  const [poblacion, setPoblacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const nifLimpio = nif.toUpperCase().replace(/[\s-]/g, '');
  const repetido = nifLimpio ? existentes.find(c => plano(c.nif ?? '').replace(/[\s-]/g, '') === plano(nifLimpio)) : undefined;
  const nifRaro = nifLimpio && !isValidNif(nifLimpio);
  const quien = esProveedor ? 'proveedor' : 'cliente';

  const guardar = async () => {
    if (!nombre.trim()) { setError('Pon al menos el nombre.'); return; }
    setGuardando(true);
    setError('');
    const ahora = new Date().toISOString();
    const c: Client = {
      id: generateId(),
      nif: nifLimpio,
      businessName: nombre.trim(),
      tradeName: '',
      email: email.trim(),
      phone: telefono.trim(),
      contactPerson: '',
      address: direccion.trim(),
      city: poblacion.trim(),
      postalCode: cp.trim(),
      province: '',
      country: 'España',
      paymentDays: 0,
      defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
      notes: '',
      active: true,
      esProveedor,
      createdAt: ahora,
      updatedAt: ahora,
    };
    try {
      await saveClient(c);
      onCreada(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="ventana-busqueda-fondo" onMouseDown={onCerrar} onClick={e => e.stopPropagation()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Nuevo ${quien}`}
        style={{ maxWidth: 560 }}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar(); }
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); void guardar(); }
        }}
      >
        <div className="modal-header">
          <h3 className="modal-title">Nuevo {quien}</h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required" htmlFor="alta-nombre">Nombre o razón social</label>
            <input id="alta-nombre" className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus={!pareceNif} />
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="alta-nif">NIF</label>
              <input id="alta-nif" className="form-input mono" value={nif} onChange={e => setNif(e.target.value)} autoFocus={pareceNif} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="alta-tel">Teléfono</label>
              <input id="alta-tel" className="form-input" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
            </div>
          </div>
          {repetido && (
            <p className="lineas-doc-aviso" role="status">
              <AlertTriangle size={13} /> Ya tienes a {repetido.tradeName || repetido.businessName} con ese NIF.{' '}
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => onElegirExistente(repetido)}>Elegirlo</button>
            </p>
          )}
          {nifRaro && !repetido && (
            <p className="form-hint">Ese NIF no parece válido; se puede guardar igual y corregirlo luego en la ficha.</p>
          )}
          <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-label" htmlFor="alta-email">Correo</label>
            <input id="alta-email" className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-label" htmlFor="alta-dir">Dirección</label>
            <input id="alta-dir" className="form-input" value={direccion} onChange={e => setDireccion(e.target.value)} />
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
            <div className="form-group" style={{ flex: '0 1 120px' }}>
              <label className="form-label" htmlFor="alta-cp">C.P.</label>
              <input id="alta-cp" className="form-input" inputMode="numeric" value={cp} onChange={e => setCp(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="alta-pob">Población</label>
              <input id="alta-pob" className="form-input" value={poblacion} onChange={e => setPoblacion(e.target.value)} />
            </div>
          </div>
          <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
            Lo demás (forma de pago, tarifa, ruta…) lo completas cuando quieras en su ficha.
          </p>
          {error && <p className="lineas-doc-aviso" role="alert"><AlertTriangle size={13} /> {error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
            <Save size={16} /> {guardando ? 'Guardando…' : `Crear y elegir ${quien}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
