'use client';

/**
 * DAR DE ALTA UN CLIENTE O PROVEEDOR SIN SALIR DE DONDE SE ESTÁ
 *
 * Desde el buscador de una factura, un albarán o un cobro: si el cliente no
 * existe, se crea aquí con lo imprescindible y queda elegido. Lo demás
 * (tarifa, ruta, condiciones…) se completa luego en su ficha.
 *
 * Con «Pegar datos» se rellena de la firma de un correo; el código postal
 * pone la provincia (y en Canarias el municipio), y si ya hay una ficha con
 * ese NIF o un nombre muy parecido se avisa antes de crear otra.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, AlertTriangle, ClipboardPaste } from 'lucide-react';
import type { Client } from '@/lib/types';
import { PaymentMethod } from '@/lib/types';
import { saveClient } from '@/lib/storage';
import { isValidNif } from '@/lib/validation/nif';
import { generateId } from '@/lib/utils';
import { PROVINCES } from '@/lib/constants';
import { fichasParecidas } from '@/lib/clienteRepetido';
import type { CampoFicha } from '@/lib/fichaPegada';
import type { CasillasLugar } from '@/lib/codigosPostales';
import AvisoFichaRepetida from './AvisoFichaRepetida';
import PegarDatosFicha from './PegarDatosFicha';
import { MunicipiosParaElegir, useRellenoPorCp } from './RellenoPorCp';

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
  const [provincia, setProvincia] = useState('');
  const [contacto, setContacto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [pegando, setPegando] = useState(false);
  const [crearIgualmente, setCrearIgualmente] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const avisoRepetida = useRef<HTMLDivElement>(null);

  const nifLimpio = nif.toUpperCase().replace(/[\s-]/g, '');
  // Antes solo se miraba el NIF; ahora también el nombre (lib/clienteRepetido.ts).
  const parecidas = useMemo(
    () => (crearIgualmente ? [] : fichasParecidas({ nif: nifLimpio, nombre }, existentes)),
    [crearIgualmente, nifLimpio, nombre, existentes],
  );
  const nifRaro = nifLimpio && !isValidNif(nifLimpio);
  const quien = esProveedor ? 'proveedor' : 'cliente';

  const lugar = useRellenoPorCp(useCallback((c: Partial<CasillasLugar>) => {
    if (c.provincia !== undefined) setProvincia(c.provincia);
    if (c.municipio !== undefined) setPoblacion(c.municipio);
  }, []));

  const aplicarPegado = (d: Partial<Record<CampoFicha, string>>) => {
    if (d.razonSocial !== undefined) setNombre(d.razonSocial);
    if (d.nif !== undefined) setNif(d.nif);
    if (d.email !== undefined) setEmail(d.email);
    if (d.telefono !== undefined) setTelefono(d.telefono);
    if (d.contacto !== undefined) setContacto(d.contacto);
    if (d.direccion !== undefined) setDireccion(d.direccion);
    if (d.codigoPostal !== undefined) setCp(d.codigoPostal);
    if (d.municipio !== undefined) setPoblacion(d.municipio);
    if (d.provincia !== undefined) setProvincia(d.provincia);
    setPegando(false);
  };

  const guardar = async (forzar = false) => {
    if (!nombre.trim()) { setError('Pon al menos el nombre.'); return; }
    if (!forzar && parecidas.length > 0) { avisoRepetida.current?.focus(); return; }
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
      contactPerson: contacto.trim(),
      address: direccion.trim(),
      city: poblacion.trim(),
      postalCode: cp.trim(),
      province: provincia,
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
        ref={caja}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Nuevo ${quien}`}
        style={{ maxWidth: 560 }}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => {
          // Las teclas de la ventana de «Pegar datos» son suyas.
          if (e.target instanceof HTMLElement && e.target.closest('.dialogo-rapido')) return;
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar(); }
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); void guardar(); }
          // El tabulador no se escapa a la factura de detrás.
          if (e.key === 'Tab' && caja.current) {
            const enfocables = [...caja.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea')];
            const primero = enfocables[0];
            const ultimo = enfocables[enfocables.length - 1];
            if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
          }
        }}
      >
        <div className="modal-header">
          <h3 className="modal-title">Nuevo {quien}</h3>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="pegar-datos-fila">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPegando(true)}>
              <ClipboardPaste size={13} aria-hidden /> Pegar datos
            </button>
            <span className="form-hint">La firma de un correo o un WhatsApp con los datos.</span>
          </div>
          {pegando && (
            <PegarDatosFicha
              actual={{ razonSocial: nombre, nif, email, telefono, contacto, direccion, codigoPostal: cp, municipio: poblacion, provincia }}
              onAplicar={aplicarPegado}
              onCerrar={() => setPegando(false)}
            />
          )}
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
          <AvisoFichaRepetida
            ref={avisoRepetida}
            parecidas={parecidas}
            textoUsar="Usar su ficha"
            onUsar={f => { const c = existentes.find(x => x.id === f.id); if (c) onElegirExistente(c); }}
            onCrearIgualmente={() => { setCrearIgualmente(true); void guardar(true); }}
          />
          {nifRaro && !parecidas.some(x => x.motivo === 'nif') && (
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
              <input
                id="alta-cp"
                className="form-input"
                inputMode="numeric"
                value={cp}
                onChange={e => { setCp(e.target.value); lugar.alCambiarCp(e.target.value, { provincia, municipio: poblacion }); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="alta-pob">Población</label>
              <input id="alta-pob" className="form-input" value={poblacion} onChange={e => setPoblacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="alta-prov">Provincia</label>
              <select id="alta-prov" className="form-select" value={provincia} onChange={e => setProvincia(e.target.value)}>
                <option value="">—</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <MunicipiosParaElegir municipios={lugar.elegir} onElegir={lugar.elegirMunicipio} />
          <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-label" htmlFor="alta-contacto">Persona de contacto</label>
            <input id="alta-contacto" className="form-input" value={contacto} onChange={e => setContacto(e.target.value)} />
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
