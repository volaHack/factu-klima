'use client';

/**
 * BANDEJA DE ERRORES DE SINCRONIZACIÓN
 *
 * Lo que el servidor rechazó de forma definitiva (número repetido, regla
 * antifraude, suscripción…) ya no se tira: queda aquí, entero, hasta que
 * alguien decide qué hacer. Se puede reintentar (vuelve a la cola), bajar
 * en un fichero o, con confirmación expresa, descartar.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { descartarError, getSyncErrores, reintentarError, type SyncErrorEntry } from '@/lib/offlineDb';
import { processSyncQueue } from '@/lib/syncEngine';
import { descargar } from '@/lib/exportar';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const QUE_ES: Record<string, string> = {
  invoices: 'Documento', clients: 'Ficha de cliente o proveedor', products: 'Artículo', company_settings: 'Ajustes',
  albaranes: 'Albarán', cobros_pagos: 'Cobro o pago', gastos: 'Gasto', pos_sessions: 'Caja del TPV',
};

function titulo(e: SyncErrorEntry): string {
  const d = e.item.data as { number?: string; client_name?: string; business_name?: string; name?: string };
  const que = QUE_ES[e.item.table] ?? e.item.table;
  const nombre = d.number ? `${d.number}${d.client_name ? ` · ${d.client_name}` : ''}` : (d.business_name ?? d.name ?? '');
  return nombre ? `${que} ${nombre}` : que;
}

export default function SincronizacionPage() {
  const [errores, setErrores] = useState<SyncErrorEntry[] | null>(null);
  const { success, error: avisarError } = useToast();

  const leer = useCallback(() => getSyncErrores(), []);
  const recargar = async () => setErrores(await leer());

  useEffect(() => {
    let vivo = true;
    leer().then(e => { if (vivo) setErrores(e); }).catch(() => { if (vivo) setErrores([]); });
    return () => { vivo = false; };
  }, [leer]);

  const reintentar = async (e: SyncErrorEntry) => {
    await reintentarError(e.id);
    await processSyncQueue();
    const quedan = await leer();
    setErrores(quedan);
    if (quedan.some(q => q.item.id === e.item.id)) avisarError('Sigue rechazado', 'El servidor lo ha vuelto a rechazar. Revisa el motivo.');
    else success('Subido', `${titulo(e)} ya está en el servidor.`);
  };

  const bajar = (e: SyncErrorEntry) => descargar({
    nombre: `rechazado-${e.item.table}-${(e.item.data.number as string | undefined) ?? e.item.data.id ?? e.id}.json`,
    contenido: JSON.stringify(e, null, 2),
    tipo: 'application/json',
  });

  const descartar = async (e: SyncErrorEntry) => {
    const ok = confirm(
      `Vas a descartar «${titulo(e)}».\n\nNo está en el servidor: si lo descartas, desaparece también de este equipo y no se puede recuperar. `
      + 'Descárgalo antes si puede hacerte falta.\n\n¿Descartarlo definitivamente?',
    );
    if (!ok) return;
    await descartarError(e.id);
    await recargar();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cambios rechazados</h1>
          <p className="page-subtitle">
            Lo que el servidor no ha aceptado se guarda aquí, entero, en este equipo. Nada se borra solo.
          </p>
        </div>
      </div>

      {errores === null ? null : errores.length === 0 ? (
        <div className="card" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} />
          <span>No hay nada rechazado. Todo lo hecho en este equipo está en el servidor o esperando a subir.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {errores.map(e => {
            const total = e.item.data.total as number | undefined;
            return (
              <div key={e.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{titulo(e)}</strong>
                    {typeof total === 'number' && <span style={{ marginLeft: 8 }}>{formatCurrency(total)}</span>}
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{e.motivo}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Rechazado el {new Date(e.at).toLocaleString('es-ES')}
                      {e.hijos.length > 0 && ` · con ${e.hijos.length} ${e.hijos.length === 1 ? 'línea guardada' : 'líneas guardadas'}`}
                      {e.codigo && ` · código ${e.codigo}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void reintentar(e)} disabled={!navigator.onLine}>
                    <RefreshCw size={14} /> Reintentar
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => bajar(e)}>
                    <Download size={14} /> Descargar
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => void descartar(e)}>
                    <Trash2 size={14} /> Descartar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
