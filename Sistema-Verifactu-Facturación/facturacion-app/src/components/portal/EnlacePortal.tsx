'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Loader2, Mail, MessageCircle, RefreshCw, X } from 'lucide-react';
import { enlacePortal, renovarEnlacePortal } from '@/lib/storage';

/**
 * EL ENLACE DEL PORTAL DE UN CLIENTE
 *
 * Un botón que saca el enlace personal del cliente para que vea sus
 * facturas y las pague, con las formas habituales de mandárselo. El mismo
 * enlace sirve siempre; «Cambiar enlace» anula el anterior (por si se ha
 * mandado a quien no era).
 */
export default function EnlacePortal({ clientId, clienteNombre, telefono, email, factura, compacto = false }: {
  clientId: string;
  clienteNombre: string;
  telefono?: string;
  email?: string;
  /** Si se abre desde una factura, el mensaje la menciona. */
  factura?: { numero: string; importe: string };
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState('');
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [copiado, setCopiado] = useState(false);

  const abrir = async (renovar = false) => {
    setAbierto(true);
    setCargando(true);
    setFallo('');
    try {
      setUrl(await (renovar ? renovarEnlacePortal(clientId) : enlacePortal(clientId)));
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido crear el enlace.');
    } finally {
      setCargando(false);
    }
  };

  const mensaje = factura
    ? `Hola, ${clienteNombre}. Aquí tienes la factura ${factura.numero} (${factura.importe}). Puedes verla, descargarla y pagarla en este enlace: ${url}`
    : `Hola, ${clienteNombre}. En este enlace tienes todas tus facturas, para verlas, descargarlas y pagarlas: ${url}`;
  const asunto = factura ? `Factura ${factura.numero}` : 'Tus facturas';
  const movil = (telefono ?? '').replace(/\D/g, '');
  const wa = `https://wa.me/${movil.length === 9 ? `34${movil}` : movil}?text=${encodeURIComponent(mensaje)}`;

  return (
    <>
      <button
        type="button"
        className={compacto ? 'btn btn-ghost btn-xs' : 'btn btn-secondary'}
        onClick={() => void abrir()}
        title="Enlace para que el cliente vea y pague sus facturas"
      >
        <Globe size={compacto ? 14 : 16} />{!compacto && ' Enlace de pago'}
      </button>

      {abierto && (
        <div className="modal-overlay animate-fade-in" onClick={() => setAbierto(false)}>
          <div className="modal enlace-portal" role="dialog" aria-label="Enlace del portal del cliente" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Portal de {clienteNombre}</h2>
              <button className="modal-close" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="form-hint" style={{ marginTop: 0 }}>
                Con este enlace ve todas sus facturas, las descarga y las paga (con tarjeta si tienes activado el cobro online, o por transferencia).
                No necesita cuenta ni contraseña.
              </p>
              {cargando ? (
                <p className="form-hint"><Loader2 size={14} className="spin" /> Preparando el enlace…</p>
              ) : fallo ? (
                <p className="equipo-error" role="alert">{fallo}</p>
              ) : (
                <>
                  <div className="enlace-portal-url">
                    <input className="form-input mono" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Enlace del portal" />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => { try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* */ } }}
                    >
                      {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <div className="enlace-portal-acciones">
                    <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
                    <a className="btn btn-secondary btn-sm" href={`mailto:${email ?? ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`}><Mail size={15} /> Correo</a>
                    <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver como el cliente</a>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm enlace-portal-renovar" onClick={() => {
                    if (confirm('¿Cambiar el enlace? El que ya tiene el cliente dejará de funcionar.')) void abrir(true);
                  }}>
                    <RefreshCw size={14} /> Cambiar enlace
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
