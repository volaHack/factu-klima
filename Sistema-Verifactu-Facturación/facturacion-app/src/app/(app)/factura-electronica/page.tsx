'use client';

/**
 * FACTURA ELECTRÓNICA ENTRE EMPRESAS
 *
 * Las que emites (con su estado y su código), las que recibes (con lo que
 * tienes que comunicar al proveedor y su plazo) y las facturas a empresas
 * que todavía no tienen la suya. Lo urgente va arriba.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CircleSlash, Download, FileCode2, Info, Loader2, Send, Settings, Upload, Wallet, X } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { getClients, getCompanySettings, getInvoices, isSealed } from '@/lib/storage';
import type { Client, Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { alcanceDe, leerConfigFe, obligatoriaDesde, type ConfigFacturaElectronica } from '@/lib/facturaElectronica/ambito';
import {
  comunicarEstado, enviarFacturaElectronica, generarFacturaElectronica, getComunicaciones, getFacturasElectronicas, reintentarComunicacion,
  type FeComunicacion, type FeFactura,
} from '@/lib/facturaElectronica/almacen';
import {
  DIAS_PLAZO, NOMBRE_COMUNICACION, diasHabilesHasta, plazoComunicacion, tareasPendientes, type TipoComunicacion,
} from '@/lib/facturaElectronica/estados';
import { EstadoFeBadge, descargarFicheroFe, fechaCorta, nombreCanal } from '@/components/facturaElectronica/comun';

type Pestaña = 'recibidas' | 'emitidas' | 'faltan';
const hoy = () => new Date().toISOString().slice(0, 10);

interface Dialogo { fe: FeFactura; tipo: TipoComunicacion; fecha: string; motivo: string; importe: string }

/** Todo lo de la pantalla: las facturas electrónicas, sus comunicaciones y las facturas a empresas que aún no tienen la suya. */
async function leerTodo() {
  const [ajustes, facturas, comunicaciones, invoices, clientes] = await Promise.all([
    getCompanySettings(), getFacturasElectronicas(), getComunicaciones(), getInvoices(), getClients(),
  ]);
  const conFe = new Set(facturas.map(f => f.invoiceId).filter(Boolean));
  const porId = new Map<string, Client>(clientes.map(c => [c.id, c]));
  const haceUnAño = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const sinFe = invoices.filter(i => isSealed(i) && i.status !== 'anulada' && !conFe.has(i.id) && i.issueDate >= haceUnAño
    && alcanceDe(i, i.clientId ? porId.get(i.clientId) : undefined).obligatoria)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return { config: leerConfigFe(ajustes.facturaElectronica), facturas, comunicaciones, sinFe };
}

export default function FacturaElectronicaPage() {
  const { success, error: toastError } = useToast();
  const [cargado, setCargado] = useState(false);
  const [fallo, setFallo] = useState('');
  const [config, setConfig] = useState<ConfigFacturaElectronica | null>(null);
  const [facturas, setFacturas] = useState<FeFactura[]>([]);
  const [comunicaciones, setComunicaciones] = useState<FeComunicacion[]>([]);
  const [sinFe, setSinFe] = useState<Invoice[]>([]);
  const [pestaña, setPestaña] = useState<Pestaña>('recibidas');
  const [ocupado, setOcupado] = useState('');
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const aplicar = useCallback((d: Awaited<ReturnType<typeof leerTodo>>) => {
    setConfig(d.config);
    setFacturas(d.facturas);
    setComunicaciones(d.comunicaciones);
    setSinFe(d.sinFe);
  }, []);
  const cargar = useCallback(async () => aplicar(await leerTodo()), [aplicar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await leerTodo();
        if (vivo) aplicar(d);
      } catch (e) {
        if (vivo) setFallo(e instanceof Error ? e.message : 'No se ha podido cargar.');
      }
      if (vivo) setCargado(true);
    })();
    return () => { vivo = false; };
  }, [aplicar]);

  const recibidas = useMemo(() => facturas.filter(f => f.sentido === 'recibida'), [facturas]);
  const emitidas = useMemo(() => facturas.filter(f => f.sentido === 'emitida'), [facturas]);
  const tareas = useMemo(() => tareasPendientes(recibidas.map(f => ({
    id: f.id, sentido: f.sentido, estado: f.estado, numero: f.numero, nombreEmisor: f.nombreEmisor, total: f.total, fecha: f.fecha, vencimiento: f.vencimiento,
  })), hoy()), [recibidas]);
  const sinSalir = comunicaciones.filter(c => c.estado !== 'enviada');
  const porFe = useMemo(() => new Map(facturas.map(f => [f.id, f])), [facturas]);

  if (!cargado) return <PageSkeleton />;

  const accion = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave);
    try { await fn(); await cargar(); } catch (e) { toastError('No se ha podido hacer', e instanceof Error ? e.message : ''); } finally { setOcupado(''); }
  };

  const abrir = (fe: FeFactura, tipo: TipoComunicacion) =>
    setDialogo({ fe, tipo, fecha: hoy(), motivo: '', importe: tipo === 'pago_parcial' ? '' : String(Math.abs(fe.total)) });

  const confirmar = () => {
    if (!dialogo) return;
    const d = dialogo;
    void accion(`com-${d.fe.id}`, async () => {
      const importe = d.importe ? Number(d.importe.replace(',', '.')) : undefined;
      const r = await comunicarEstado(d.fe, d.tipo, d.fecha, { motivo: d.motivo, importe: importe !== undefined && Number.isFinite(importe) ? importe : undefined });
      setDialogo(null);
      success(`${NOMBRE_COMUNICACION[d.tipo]} comunicado`, r.entrega?.mensaje ?? '');
    });
  };

  const generarTodas = () => void accion('todas', async () => {
    let n = 0;
    const errores: string[] = [];
    for (const f of sinFe) {
      const r = await generarFacturaElectronica(f);
      if (r.fe) n++; else errores.push(`${f.number}: ${r.problemas?.join(' ')}`);
    }
    if (n) success(`${n} ${n === 1 ? 'factura electrónica generada' : 'facturas electrónicas generadas'}`);
    if (errores.length) toastError(`${errores.length} no se han podido generar`, errores.slice(0, 3).join(' · '));
  });

  const desde = config ? obligatoriaDesde(config) : null;
  const simulado = config?.canal !== 'spfe';

  return (
    <div className="page-container fe-pagina">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Factura electrónica</h1>
          <p className="page-subtitle">
            Entre empresas y autónomos es obligatoria desde {desde?.texto ?? 'octubre de 2028'}. Aquí están las que emites y las que
            recibes, con lo que tienes que comunicar y su plazo.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/gastos/buzon" className="btn btn-secondary"><Upload size={16} /> Subir recibidas</Link>
          <Link href="/ajustes#factura-electronica" className="btn btn-ghost"><Settings size={16} /> Ajustes</Link>
        </div>
      </div>

      {fallo && <div className="callout callout-danger"><AlertTriangle size={16} /><div><strong>No se ha podido cargar</strong><p>{fallo}</p></div></div>}

      {simulado && (
        <div className="callout callout-info">
          <Info size={16} />
          <div>
            <strong>Modo de pruebas</strong>
            <p>
              Las facturas electrónicas se generan en UBL (EN 16931), se validan y se guardan como se haría de verdad, pero no se envía nada a la
              AEAT ni a tus clientes. El envío por la solución pública de la AEAT se activará cuando la AEAT abra el servicio.
            </p>
          </div>
        </div>
      )}

      {(tareas.length > 0 || sinSalir.length > 0) && (
        <section className="card fe-tareas" aria-label="Pendiente">
          <h2 className="card-title">Pendiente</h2>
          <ul>
            {tareas.map(t => {
              const fe = porFe.get(t.feId)!;
              return (
                <li key={`${t.feId}-${t.tipo}`} className={t.urgente ? 'is-urgente' : ''}>
                  {t.urgente ? <AlertTriangle size={16} aria-hidden="true" /> : <FileCode2 size={16} aria-hidden="true" />}
                  <span>{t.texto}</span>
                  <span className="fe-tareas-acciones">
                    {t.tipo === 'decidir' ? (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(fe, 'aceptacion')}><Check size={14} /> Aceptar</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(fe, 'rechazo')}><X size={14} /> Rechazar</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => abrir(fe, 'pago')}><Wallet size={14} /> Comunicar pago</button>
                    )}
                  </span>
                </li>
              );
            })}
            {sinSalir.map(c => {
              const fe = porFe.get(c.feFacturaId);
              const quedan = diasHabilesHasta(c.plazo, hoy());
              return (
                <li key={c.id} className={quedan <= 1 ? 'is-urgente' : ''}>
                  <Send size={16} aria-hidden="true" />
                  <span>
                    {NOMBRE_COMUNICACION[c.tipo]} de la factura {fe?.numero ?? ''} sin salir.{' '}
                    {quedan >= 0 ? `Plazo: ${fechaCorta(c.plazo)} (${quedan === 0 ? 'hoy' : `${quedan} ${quedan === 1 ? 'día hábil' : 'días hábiles'}`}).` : `Fuera de plazo desde el ${fechaCorta(c.plazo)}.`}
                    {c.mensaje ? ` ${c.mensaje}` : ''}
                  </span>
                  <span className="fe-tareas-acciones">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado}
                      onClick={() => void accion(`reintentar-${c.id}`, async () => { const r = await reintentarComunicacion(c.id); if (!r.ok) throw new Error(r.mensaje); })}>
                      {ocupado === `reintentar-${c.id}` ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Reintentar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="tabs" role="tablist" aria-label="Qué facturas ver">
        {([['recibidas', `Recibidas (${recibidas.length})`], ['emitidas', `Emitidas (${emitidas.length})`], ['faltan', `Sin factura electrónica (${sinFe.length})`]] as const)
          .map(([id, texto]) => (
            <button key={id} type="button" role="tab" aria-selected={pestaña === id} className={`tab ${pestaña === id ? 'active' : ''}`} onClick={() => setPestaña(id)}>{texto}</button>
          ))}
      </div>

      {pestaña === 'recibidas' && (recibidas.length === 0 ? (
        <p className="fe-vacio">
          Todavía no has recibido ninguna. Cuando un proveedor te mande una factura electrónica (UBL, Facturae, CII o EDIFACT), súbela en{' '}
          <Link href="/gastos/buzon">Facturas de proveedores</Link> o reenvíala al correo del buzón: se lee sola y el gasto sale sin teclear.
        </p>
      ) : (
        <div className="table-container">
          <table className="table fe-tabla">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Número</th><th className="num">Total</th><th>Vence</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {recibidas.map(f => (
                <tr key={f.id}>
                  <td>{fechaCorta(f.fecha)}</td>
                  <td>{f.nombreEmisor || f.nifEmisor}<small className="fe-sub">{f.nifEmisor}</small></td>
                  <td className="mono">{f.numero}</td>
                  <td className="num">{formatCurrency(f.total)}</td>
                  <td>{fechaCorta(f.vencimiento)}</td>
                  <td><EstadoFeBadge estado={f.estado} />{f.estado === 'rechazada' && f.motivo && <small className="fe-sub">{f.motivo}</small>}</td>
                  <td className="fe-acciones">
                    {f.estado === 'recibida' && <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(f, 'aceptacion')} title="Aceptar"><Check size={14} /> Aceptar</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(f, 'rechazo')} title="Rechazar"><X size={14} /> Rechazar</button>
                    </>}
                    {['recibida', 'aceptada', 'impagada'].includes(f.estado) && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(f, 'pago')} title="Comunicar el pago"><Wallet size={14} /> Pagada</button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void descargarFicheroFe(f.id).catch(() => toastError('No se ha podido descargar'))} title="Descargar el fichero"><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {pestaña === 'emitidas' && (emitidas.length === 0 ? (
        <p className="fe-vacio">
          Aún no hay ninguna. {config?.automatica ? 'Se generan solas al emitir una factura a una empresa o a un autónomo.' : 'Genéralas desde cada factura o desde la pestaña «Sin factura electrónica».'}
        </p>
      ) : (
        <div className="table-container">
          <table className="table fe-tabla">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Número</th><th className="num">Total</th><th>Estado</th><th>Canal</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {emitidas.map(f => (
                <tr key={f.id}>
                  <td>{fechaCorta(f.fecha)}</td>
                  <td>{f.nombreReceptor || f.nifReceptor}<small className="fe-sub">{f.nifReceptor}</small></td>
                  <td className="mono">{f.invoiceId ? <Link href={`/facturas/${f.invoiceId}`}>{f.numero}</Link> : f.numero}</td>
                  <td className="num">{formatCurrency(f.total)}</td>
                  <td><EstadoFeBadge estado={f.estado} />{f.estado === 'error' && f.motivo && <small className="fe-sub">{f.motivo}</small>}</td>
                  <td><small>{nombreCanal(f.canal)}</small>{f.codigo && <small className="fe-sub mono">{f.codigo}</small>}</td>
                  <td className="fe-acciones">
                    {(f.estado === 'generada' || f.estado === 'error') && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado}
                        onClick={() => void accion(`enviar-${f.id}`, async () => { const r = await enviarFacturaElectronica(f.id); if (!r.ok && !r.pendiente) throw new Error(r.mensaje); })}>
                        {ocupado === `enviar-${f.id}` ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Enviar
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void descargarFicheroFe(f.id).catch(() => toastError('No se ha podido descargar'))} title="Descargar el fichero UBL"><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {pestaña === 'faltan' && (sinFe.length === 0 ? (
        <p className="fe-vacio"><Check size={16} /> Todas las facturas a empresas y autónomos del último año tienen su factura electrónica.</p>
      ) : (
        <>
          <div className="fe-faltan-cabeza">
            <p className="form-hint">
              Facturas del último año a empresas y autónomos de España que no tienen factura electrónica. Hasta {desde?.texto} no es obligatoria,
              pero generarlas ya deja todo preparado.
            </p>
            <button type="button" className="btn btn-primary btn-sm" disabled={!!ocupado} onClick={generarTodas}>
              {ocupado === 'todas' ? <Loader2 size={14} className="spin" /> : <FileCode2 size={14} />} Generar las {sinFe.length}
            </button>
          </div>
          <div className="table-container">
            <table className="table fe-tabla">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Número</th><th className="num">Total</th><th aria-label="Acciones" /></tr></thead>
              <tbody>
                {sinFe.map(f => (
                  <tr key={f.id}>
                    <td>{fechaCorta(f.issueDate)}</td>
                    <td>{f.clientName}<small className="fe-sub">{f.clientNif}</small></td>
                    <td className="mono"><Link href={`/facturas/${f.id}`}>{f.number}</Link></td>
                    <td className="num">{formatCurrency(f.total)}</td>
                    <td className="fe-acciones">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado}
                        onClick={() => void accion(`gen-${f.id}`, async () => {
                          const r = await generarFacturaElectronica(f);
                          if (r.problemas?.length) throw new Error(r.problemas.join(' '));
                          success('Factura electrónica generada', r.entrega?.mensaje ?? '');
                        })}>
                        {ocupado === `gen-${f.id}` ? <Loader2 size={14} className="spin" /> : <FileCode2 size={14} />} Generar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}

      {dialogo && (
        <div className="modal-overlay animate-fade-in" onClick={() => setDialogo(null)}>
          <div className="modal" style={{ maxWidth: 480 }} role="dialog" aria-label={NOMBRE_COMUNICACION[dialogo.tipo]} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{NOMBRE_COMUNICACION[dialogo.tipo]} · {dialogo.fe.numero}</h2>
              <button className="modal-close" onClick={() => setDialogo(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body fe-dialogo">
              <p className="form-hint" style={{ marginTop: 0 }}>
                {dialogo.tipo === 'aceptacion' && 'Le dices al proveedor que la factura es correcta.'}
                {dialogo.tipo === 'rechazo' && 'Le dices al proveedor que no la aceptas y por qué. Tendrá que rectificarla.'}
                {(dialogo.tipo === 'pago' || dialogo.tipo === 'pago_parcial') && 'La fecha en que la pagaste. La ley obliga a comunicar el pago completo.'}
                {' '}Hay {DIAS_PLAZO} días hábiles desde la fecha que pongas: hasta el {fechaCorta(plazoComunicacion(dialogo.fecha))}.
              </p>
              <label className="form-label">Fecha
                <input type="date" className="form-input" value={dialogo.fecha} max={hoy()} onChange={e => setDialogo({ ...dialogo, fecha: e.target.value })} />
              </label>
              {(dialogo.tipo === 'pago' || dialogo.tipo === 'pago_parcial') && (
                <label className="form-label">Importe pagado
                  <input type="number" step="0.01" className="form-input" value={dialogo.importe} onChange={e => setDialogo({ ...dialogo, importe: e.target.value })} />
                </label>
              )}
              {dialogo.tipo === 'rechazo' && (
                <label className="form-label">Motivo
                  <textarea className="form-input" rows={3} maxLength={500} value={dialogo.motivo} placeholder="Precio distinto del pedido, mercancía no recibida…"
                    onChange={e => setDialogo({ ...dialogo, motivo: e.target.value })} />
                </label>
              )}
              {dialogo.fecha < hoy() && diasHabilesHasta(plazoComunicacion(dialogo.fecha), hoy()) < 0 && (
                <p className="fe-aviso"><AlertTriangle size={14} /> Esa fecha ya está fuera de plazo. Comunícalo igualmente cuanto antes.</p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setDialogo(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={!!ocupado || !dialogo.fecha || (dialogo.tipo === 'rechazo' && !dialogo.motivo.trim())} onClick={confirmar}>
                {ocupado ? <Loader2 size={16} className="spin" /> : dialogo.tipo === 'rechazo' ? <CircleSlash size={16} /> : <Check size={16} />} Comunicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
