'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Receipt } from 'lucide-react';

/**
 * Lo que se hace con el libro de ingresos: bajarlo para la gestoría y,
 * ya con la fecha de alta puesta, emitir las facturas que quedaron
 * pendientes de cobros posteriores a esa fecha.
 */
export default function AccionesIngresos({
  desde,
  hasta,
  facturables,
  conAlta,
}: {
  desde: string;
  hasta: string;
  facturables: number;
  conAlta: boolean;
}) {
  const router = useRouter();
  const [emitiendo, setEmitiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const emitir = async () => {
    if (!window.confirm(`Se van a emitir ${facturables} ${facturables === 1 ? 'factura' : 'facturas'} a tu nombre, con registro Veri*Factu. ¿Seguir?`)) return;
    setEmitiendo(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/admin/ingresos/facturar', { method: 'POST' });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMensaje({ ok: false, texto: datos.error || 'No se han podido emitir.' });
      } else {
        const fallos: string[] = datos.fallos ?? [];
        setMensaje({
          ok: fallos.length === 0,
          texto: `Emitidas ${datos.emitidas}.${fallos.length ? ` ${fallos.length} han quedado en «Revisar».` : ''}`,
        });
        router.refresh();
      }
    } catch {
      setMensaje({ ok: false, texto: 'Sin conexión: inténtalo de nuevo.' });
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <a
        className="apple-btn-secondary"
        href={`/api/admin/ingresos/csv?desde=${desde}&hasta=${hasta}`}
        download
      >
        <Download size={14} />
        <span>CSV para la gestoría</span>
      </a>
      {conAlta && facturables > 0 && (
        <button type="button" className="apple-btn-primary" onClick={emitir} disabled={emitiendo}>
          {emitiendo ? <Loader2 size={14} className="spin" /> : <Receipt size={14} />}
          <span>Emitir {facturables} {facturables === 1 ? 'factura pendiente' : 'facturas pendientes'}</span>
        </button>
      )}
      {mensaje && (
        <span role="status" style={{ fontSize: '0.8125rem', fontWeight: 600, color: mensaje.ok ? '#059669' : '#e11d48' }}>
          {mensaje.texto}
        </span>
      )}
    </div>
  );
}
