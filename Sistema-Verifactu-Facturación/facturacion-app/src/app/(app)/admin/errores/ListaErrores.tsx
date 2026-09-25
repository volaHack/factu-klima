'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { GrupoError } from '@/lib/errores/agrupar';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ListaErrores({ grupos }: { grupos: GrupoError[] }) {
  const router = useRouter();
  const [verResueltos, setVerResueltos] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const visibles = grupos.filter(g => verResueltos || !g.resuelto);
  const pendientes = grupos.filter(g => !g.resuelto).length;

  const marcar = async (huella: string, resuelto: boolean) => {
    setOcupado(huella);
    try {
      await fetch('/api/admin/errores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ huella, resuelto }) });
      router.refresh();
    } finally { setOcupado(null); }
  };

  return (
    <div className="apple-card" style={{ padding: 0 }}>
      <div className="apple-filter-bar" style={{ padding: '0.75rem 1rem', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {pendientes === 0 ? 'Ningún fallo pendiente.' : `${pendientes} ${pendientes === 1 ? 'fallo pendiente' : 'fallos pendientes'}`}
        </span>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.8125rem' }}>
          <input type="checkbox" checked={verResueltos} onChange={e => setVerResueltos(e.target.checked)} /> Ver también los resueltos
        </label>
      </div>
      {visibles.length === 0 ? (
        <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', margin: 0 }}>Nada que revisar.</p>
      ) : (
        <div className="table-responsive">
          <table className="apple-table">
            <thead><tr><th>Fallo</th><th>Dónde</th><th style={{ textAlign: 'right' }}>Veces</th><th style={{ textAlign: 'right' }}>Cuentas</th><th>Última vez</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {visibles.map(g => (
                <tr key={g.huella} style={g.resuelto ? { opacity: 0.55 } : undefined}>
                  <td style={{ maxWidth: 460 }}>
                    <span className={`apple-pill ${g.origen === 'servidor' ? 'apple-pill-purple' : 'apple-pill-blue'}`} style={{ marginRight: 6 }}>{g.origen}</span>
                    <span style={{ fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>{g.mensaje}</span>
                    {g.pila && (
                      <button type="button" onClick={() => setAbierto(abierto === g.huella ? null : g.huella)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6, background: 'none', border: 0, color: 'var(--accent-500)', cursor: 'pointer', fontSize: '0.75rem' }}>
                        {abierto === g.huella ? <ChevronUp size={12} /> : <ChevronDown size={12} />} detalle
                      </button>
                    )}
                    {abierto === g.huella && g.pila && (
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', background: 'var(--bg-tertiary)', padding: 8, borderRadius: 8, marginTop: 6, maxHeight: 240, overflow: 'auto' }}>{g.pila}</pre>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono, monospace)' }}>{g.ruta}</td>
                  <td style={{ textAlign: 'right' }}>{g.veces}</td>
                  <td style={{ textAlign: 'right' }}>{g.cuentas}</td>
                  <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{cuando(g.ultima)}{g.version ? ` · ${g.version}` : ''}</td>
                  <td>
                    <button type="button" className="apple-btn-secondary" disabled={ocupado === g.huella} onClick={() => marcar(g.huella, !g.resuelto)} style={{ whiteSpace: 'nowrap' }}>
                      {g.resuelto ? <><RotateCcw size={14} /> Reabrir</> : <><CheckCircle2 size={14} /> Resuelto</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
