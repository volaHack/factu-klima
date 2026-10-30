'use client';

/**
 * «Reclamar»: el texto de reclamación ya escrito, con las facturas vencidas
 * de ese cliente, en el tono que pide su retraso. Se puede cambiar el tono,
 * retocar el texto y mandarlo por WhatsApp, por correo o copiarlo.
 *
 * Cada envío queda anotado en el mismo registro que los recordatorios
 * (`anotar`), así la pantalla de Recordatorios sabe que ya se le reclamó y
 * no lo vuelve a proponer al día siguiente.
 */

import { useEffect, useId, useState } from 'react';
import { Copy, Mail, MessageCircle, Send, X } from 'lucide-react';
import Portal from '@/components/ui/Portal';
import { useToast } from '@/hooks/useToast';
import type { Deudor, Remitente } from '@/lib/recordatorios/textos';
import { anotar } from '@/lib/recordatorios/registro';
import {
  TONOS, enlaceCorreo, enlaceWhatsApp, textoReclamacion, tonoReclamacion,
  type CanalReclamacion, type TonoReclamacion,
} from '@/lib/reclamar';
import { formatCurrency } from '@/lib/utils';

export interface ContactoReclamar {
  telefono?: string;
  email?: string;
}

interface Props {
  deudor: Deudor;
  contacto: ContactoReclamar;
  remitente: Remitente;
  /** Texto del botón; por defecto, «Reclamar». */
  etiqueta?: string;
  className?: string;
}

export default function ReclamarCobro({ deudor, contacto, remitente, etiqueta = 'Reclamar', className = 'btn btn-secondary btn-sm' }: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setAbierto(true)}
        aria-label={`${etiqueta} a ${deudor.cliente} ${formatCurrency(deudor.total)}`}
      >
        <Send size={14} aria-hidden /> {etiqueta}
      </button>
      {abierto && <DialogoReclamar deudor={deudor} contacto={contacto} remitente={remitente} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function DialogoReclamar({ deudor, contacto, remitente, onCerrar }: Omit<Props, 'etiqueta' | 'className'> & { onCerrar: () => void }) {
  const { success, error: toastError } = useToast();
  const titulo = useId();
  const propuesto = tonoReclamacion(deudor.maxRetraso);
  const [tono, setTono] = useState<TonoReclamacion>(propuesto);
  const whatsapp = enlaceWhatsApp(contacto.telefono, '') !== null;
  const [canal, setCanal] = useState<CanalReclamacion>(whatsapp ? 'whatsapp' : 'correo');
  // El texto se puede retocar a mano; al cambiar de tono o de canal se vuelve a escribir.
  const [editado, setEditado] = useState<{ clave: string; texto: string } | null>(null);
  const claveTexto = `${tono}|${canal}`;
  const generado = textoReclamacion(deudor, remitente, tono, canal);
  const texto = editado?.clave === claveTexto ? editado.texto : generado.texto;
  const actual = { asunto: generado.asunto, texto };

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  const apuntar = (via: 'whatsapp' | 'manual', destinatario?: string) =>
    anotar({
      clienteId: deudor.clienteId, clienteNombre: deudor.cliente, canal: via, asunto: actual.asunto, importe: deudor.total,
      facturaIds: deudor.facturas.map(v => v.factura.id), destinatario,
    }, true).catch(() => {});

  const porWhatsApp = () => {
    const url = enlaceWhatsApp(contacto.telefono, actual.texto);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    void apuntar('whatsapp', contacto.telefono);
    onCerrar();
  };
  const porCorreo = () => {
    const url = enlaceCorreo(contacto.email, actual);
    if (!url) return;
    window.location.assign(url);
    void apuntar('manual', contacto.email);
    onCerrar();
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(canal === 'correo' ? `${actual.asunto}\n\n${actual.texto}` : actual.texto);
      success('Texto copiado', 'Pégalo donde quieras mandarlo');
      void apuntar('manual');
    } catch {
      toastError('No se ha podido copiar', 'Selecciona el texto y cópialo a mano.');
    }
  };

  const correoValido = enlaceCorreo(contacto.email, actual) !== null;

  return (
    <Portal>
      <div className="modal-overlay" onClick={onCerrar}>
        <div className="modal reclamar" role="dialog" aria-modal="true" aria-labelledby={titulo} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" id={titulo}>Reclamar a {deudor.cliente}</h3>
            <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
          </div>
          <div className="modal-body">
            <p className="reclamar-resumen">
              <strong>{formatCurrency(deudor.total)}</strong> en {deudor.facturas.length === 1 ? '1 factura vencida' : `${deudor.facturas.length} facturas vencidas`}
              {' · '}la más antigua, hace {deudor.maxRetraso} {deudor.maxRetraso === 1 ? 'día' : 'días'}
            </p>

            <div className="reclamar-opciones">
              <div className="segmentos" role="group" aria-label="Tono del mensaje">
                {TONOS.map(t => (
                  <button key={t.id} type="button" className="btn btn-sm" aria-pressed={tono === t.id} onClick={() => setTono(t.id)}>
                    {t.nombre}{t.id === propuesto && <span className="reclamar-sugerido"> · sugerido</span>}
                  </button>
                ))}
              </div>
              <div className="segmentos" role="group" aria-label="Formato del mensaje">
                <button type="button" className="btn btn-sm" aria-pressed={canal === 'whatsapp'} onClick={() => setCanal('whatsapp')}>
                  <MessageCircle size={14} aria-hidden /> Corto
                </button>
                <button type="button" className="btn btn-sm" aria-pressed={canal === 'correo'} onClick={() => setCanal('correo')}>
                  <Mail size={14} aria-hidden /> Correo
                </button>
              </div>
            </div>

            {canal === 'correo' && <p className="reclamar-asunto"><span>Asunto:</span> {actual.asunto}</p>}
            <label className="solo-lectores" htmlFor={`${titulo}-texto`}>Texto de la reclamación</label>
            <textarea
              id={`${titulo}-texto`}
              className="form-textarea reclamar-texto"
              rows={canal === 'correo' ? 14 : 9}
              value={texto}
              onChange={e => setEditado({ clave: claveTexto, texto: e.target.value })}
            />
            {(!whatsapp || !correoValido) && (
              <p className="form-hint">
                {!whatsapp && !correoValido ? 'Su ficha no tiene ni móvil ni correo: copia el texto y mándalo como prefieras.'
                  : !whatsapp ? 'Su ficha no tiene un móvil válido para WhatsApp.'
                  : 'Su ficha no tiene un correo válido.'}
              </p>
            )}
          </div>
          <div className="modal-footer reclamar-acciones">
            <button type="button" className="btn btn-ghost" onClick={() => void copiar()}>
              <Copy size={15} aria-hidden /> Copiar
            </button>
            <button type="button" className="btn btn-secondary" onClick={porCorreo} disabled={!correoValido}>
              <Mail size={15} aria-hidden /> Correo
            </button>
            <button type="button" className="btn btn-primary" onClick={porWhatsApp} disabled={!whatsapp}>
              <MessageCircle size={15} aria-hidden /> WhatsApp
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
