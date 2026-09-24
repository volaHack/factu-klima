'use client';

/**
 * Las facturas que se repiten solas: cuándo toca la próxima, cuántas van y
 * la última que se preparó. Se pausan, se cambian o se borran aquí; se
 * crean desde el detalle de una factura («Repetir»).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pause, Play, Repeat, Trash2, Wand2, Pencil, X } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import {
  PERIODOS, borrarRecurrente, cambiarRecurrente, describirPeriodo, fechasPendientes, getRecurrentes,
  prepararPendientes, type Periodo, type Recurrente,
} from '@/lib/recurrentes';

const fecha = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');

function Acciones({ r, ocupado, editar, pausar, borrar }: {
  r: Recurrente; ocupado: boolean; editar: () => void; pausar: () => void; borrar: () => void;
}) {
  return (
    <div className="recu-acciones">
      <button type="button" className="btn btn-ghost btn-icon" title="Cambiar" aria-label="Cambiar" onClick={editar} disabled={ocupado}>
        <Pencil size={15} />
      </button>
      <button type="button" className="btn btn-ghost btn-icon" title={r.activa ? 'Pausar' : 'Reanudar'} aria-label={r.activa ? 'Pausar' : 'Reanudar'} disabled={ocupado} onClick={pausar}>
        {r.activa ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button type="button" className="btn btn-ghost btn-icon" title="Dejar de repetir" aria-label="Dejar de repetir" disabled={ocupado} onClick={borrar}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function FacturasRecurrentes() {
  const { success, error: toastError } = useToast();
  const [lista, setLista] = useState<Recurrente[] | null>(null);
  const [fallo, setFallo] = useState('');
  const [editando, setEditando] = useState<Recurrente | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await getRecurrentes());
    } catch (err) {
      setFallo(err instanceof Error ? err.message : 'No se han podido leer.');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const leer = () => getRecurrentes()
      .then(l => { if (vivo) setLista(l); })
      .catch(err => { if (vivo) setFallo(err instanceof Error ? err.message : 'No se han podido leer.'); });
    leer();
    // Al entrar en el programa se preparan solas las que tocan: si pasa
    // con esta pantalla abierta, la lista se pone al día.
    window.addEventListener('klima-invoices-updated', leer);
    return () => { vivo = false; window.removeEventListener('klima-invoices-updated', leer); };
  }, []);

  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = (lista ?? []).reduce((t, r) => t + fechasPendientes(r, hoy).length, 0);

  const accion = async (hacer: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await hacer();
      success(ok);
    } catch (err) {
      toastError('No se ha podido guardar', err instanceof Error ? err.message : '');
    } finally {
      await cargar();
      setOcupado(false);
    }
  };

  const prepararYa = () => accion(async () => {
    const creadas = await prepararPendientes();
    if (!creadas.length) throw new Error('No queda ninguna por preparar: puede que ya se hayan preparado al entrar.');
  }, 'Borradores preparados. Están en Facturas.');

  const pausar = (r: Recurrente) => accion(() => cambiarRecurrente(r.id, { activa: !r.activa }), r.activa ? 'En pausa' : 'Reanudada');
  const borrar = (r: Recurrente) => {
    if (window.confirm(`¿Dejar de repetir ${r.origenNumero}? Las facturas ya preparadas se quedan.`)) accion(() => borrarRecurrente(r.id), 'Ya no se repite');
  };

  const guardarEdicion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const r = editando;
    setEditando(null);
    accion(() => cambiarRecurrente(r.id, { periodo: r.periodo, proxima: r.proxima, hasta: r.hasta }), 'Cambios guardados');
  };

  if (fallo) return <div className="page"><p className="equipo-error" role="alert">{fallo}</p></div>;
  if (!lista) return <PageSkeleton label="Cargando las recurrentes" />;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/facturas" className="page-back"><ArrowLeft /> Facturas</Link>
          <h1 className="page-title">Facturas recurrentes</h1>
          <p className="page-subtitle">
            Cuotas, alquileres, igualas: cuando llega la fecha, la factura se prepara sola en borrador con su número.
            Tú la revisas y la emites.
          </p>
        </div>
        {pendientes > 0 && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-primary" onClick={prepararYa} disabled={ocupado}>
              <Wand2 size={16} /> Preparar {pendientes === 1 ? 'la que toca' : `las ${pendientes} que tocan`}
            </button>
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><Repeat strokeWidth={1.6} /></span>
          <h2 className="empty-state-title">Todavía no se repite ninguna factura</h2>
          <p className="empty-state-description">
            Abre una factura que emitas siempre igual y pulsa «Repetir». Eliges cada cuánto y desde cuándo.
          </p>
          <div className="empty-state-actions"><Link href="/facturas" className="btn btn-primary">Ir a Facturas</Link></div>
        </div>
      ) : (
        <>
        <div className="recu-tarjetas">
          {lista.map(r => (
            <div key={r.id} className={`card recu-tarjeta ${r.activa ? '' : 'is-pausa'}`}>
              <div className="recu-tarjeta-cabeza">
                <strong>{r.cliente}</strong>
                <span className="mono">{formatCurrency(r.importe)}</span>
              </div>
              <p className="recu-tarjeta-dato">
                {describirPeriodo(r.periodo)} · copia de <Link href={`/facturas/${r.origenId}`} className="mono">{r.origenNumero}</Link>
              </p>
              <p className="recu-tarjeta-dato">
                {r.activa ? <>Próxima: <strong>{fecha(r.proxima)}</strong>{r.hasta ? ` (hasta el ${fecha(r.hasta)})` : ''}</> : <span className="badge badge-neutral">En pausa</span>}
                {' · '}{r.creadas} {r.creadas === 1 ? 'hecha' : 'hechas'}
              </p>
              <Acciones r={r} ocupado={ocupado} editar={() => setEditando({ ...r })} pausar={() => pausar(r)} borrar={() => borrar(r)} />
            </div>
          ))}
        </div>
        <div className="card recu-tabla">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Cliente</th><th>Se copia de</th><th>Cada</th><th>Próxima</th><th className="num">Importe</th><th>Hechas</th><th><span className="sr-only">Acciones</span></th></tr>
              </thead>
              <tbody>
                {lista.map(r => (
                  <tr key={r.id} style={r.activa ? undefined : { opacity: 0.6 }}>
                    <td className="primary">{r.cliente}</td>
                    <td className="mono"><Link href={`/facturas/${r.origenId}`}>{r.origenNumero}</Link></td>
                    <td>{describirPeriodo(r.periodo)}</td>
                    <td className="mono">
                      {r.activa ? fecha(r.proxima) : <span className="badge badge-neutral">En pausa</span>}
                      {r.activa && r.hasta ? <span className="form-hint">hasta el {fecha(r.hasta)}</span> : null}
                    </td>
                    <td className="num mono">{formatCurrency(r.importe)}</td>
                    <td>{r.creadas}{r.ultima ? <span className="form-hint">última {r.ultima}</span> : null}</td>
                    <td><Acciones r={r} ocupado={ocupado} editar={() => setEditando({ ...r })} pausar={() => pausar(r)} borrar={() => borrar(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando.cliente} · {editando.origenNumero}</h3>
              <button type="button" className="modal-close" onClick={() => setEditando(null)}><X size={18} /></button>
            </div>
            <form onSubmit={guardarEdicion}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="e-periodo">Cada cuánto</label>
                    <select id="e-periodo" className="form-select" value={editando.periodo} onChange={e => setEditando({ ...editando, periodo: e.target.value as Periodo })}>
                      {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required" htmlFor="e-proxima">Próxima factura</label>
                    <input id="e-proxima" type="date" className="form-input" required value={editando.proxima} onChange={e => setEditando({ ...editando, proxima: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="e-hasta">Hasta (opcional)</label>
                  <input id="e-hasta" type="date" className="form-input" min={editando.proxima} value={editando.hasta ?? ''} onChange={e => setEditando({ ...editando, hasta: e.target.value || undefined })} />
                  <p className="form-hint">Para cambiar las líneas o el precio, emite una factura nueva con los cambios y repítela a ella.</p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
