'use client';

import { useState } from 'react';
import { FileCode2, FileSignature, Loader2, X } from 'lucide-react';
import { getClientById } from '@/lib/storage';

/**
 * FACTURA ELECTRÓNICA (FACTURAE)
 *
 * Las Administraciones sólo aceptan facturas en Facturae por FACe, y
 * muchas empresas grandes también las piden. Aquí se baja firmada con el
 * certificado de la empresa (lista para subir) o sin firmar, para quien
 * prefiera firmarla con AutoFirma.
 */
export default function BotonFacturae({ facturaId, numero, clientId }: {
  facturaId: string;
  numero: string;
  clientId?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  // Si el cliente tiene códigos DIR3 es una Administración: se le habla de FACe.
  const [dir3, setDir3] = useState(false);
  const [bajando, setBajando] = useState<'' | 'firmada' | 'xml'>('');
  const [fallo, setFallo] = useState('');

  const bajar = async (firmada: boolean) => {
    setBajando(firmada ? 'firmada' : 'xml');
    setFallo('');
    try {
      const r = await fetch(`/api/facturae/${facturaId}${firmada ? '?firmar=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => null);
        throw new Error(cuerpo?.error || 'No se ha podido generar la factura electrónica.');
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(numero || 'factura').replace(/[^A-Za-z0-9_-]+/g, '_')}.${firmada ? 'xsig' : 'xml'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido generar la factura electrónica.');
    } finally {
      setBajando('');
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => {
        setAbierto(true);
        setFallo('');
        if (clientId) void getClientById(clientId).then(c => setDir3(Boolean(c?.dir3?.oficinaContable || c?.dir3?.organoGestor || c?.dir3?.unidadTramitadora))).catch(() => {});
      }} title="Factura electrónica en formato Facturae (FACe)">
        <FileCode2 size={16} /> Facturae
      </button>

      {abierto && (
        <div className="modal-overlay animate-fade-in" onClick={() => setAbierto(false)}>
          <div className="modal" style={{ maxWidth: 520 }} role="dialog" aria-label="Factura electrónica" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Factura electrónica {numero}</h2>
              <button className="modal-close" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="form-hint" style={{ marginTop: 0 }}>
                Formato Facturae 3.2.2, el oficial en España. Es el que piden FACe (Administraciones públicas),
                los portales de las comunidades y cada vez más empresas grandes.
              </p>
              {dir3 ? (
                <p className="form-hint">Este cliente tiene códigos DIR3: ya van dentro. Sube el fichero firmado en <a href="https://face.gob.es/es/proveedores" target="_blank" rel="noreferrer">face.gob.es</a>.</p>
              ) : (
                <p className="form-hint">Si es para una Administración, pon antes sus tres códigos DIR3 en la ficha del cliente: sin ellos FACe la rechaza.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <button type="button" className="btn btn-primary" disabled={!!bajando} onClick={() => void bajar(true)}>
                  {bajando === 'firmada' ? <Loader2 size={16} className="spin" /> : <FileSignature size={16} />} Descargar firmada (.xsig)
                </button>
                <button type="button" className="btn btn-ghost" disabled={!!bajando} onClick={() => void bajar(false)}>
                  {bajando === 'xml' ? <Loader2 size={16} className="spin" /> : <FileCode2 size={16} />} XML sin firmar (para firmarlo con AutoFirma)
                </button>
              </div>
              <p className="form-hint" style={{ marginBottom: 0 }}>Se firma con el certificado digital que tienes subido en Veri*Factu.</p>
              {fallo && <p className="equipo-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>{fallo}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
