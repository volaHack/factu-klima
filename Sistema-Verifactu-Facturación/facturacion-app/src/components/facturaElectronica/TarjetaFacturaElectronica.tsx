'use client';

/**
 * LA FACTURA ELECTRÓNICA DE UNA FACTURA EMITIDA (columna del detalle)
 *
 * Dice si esta factura entra en la obligación entre empresas, en qué
 * estado está su factura electrónica y lo que se puede hacer: generarla,
 * volver a enviarla, bajarse el fichero o comunicar el cobro o el impago.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileCode2, Loader2, RefreshCw, Send } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { getClientById } from '@/lib/storage';
import type { Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { alcanceDe, type Alcance } from '@/lib/facturaElectronica/ambito';
import {
  comunicarEstado, enviarFacturaElectronica, generarFacturaElectronica, getComunicaciones, getFeDeFactura,
  type FeComunicacion, type FeFactura,
} from '@/lib/facturaElectronica/almacen';
import { NOMBRE_COMUNICACION } from '@/lib/facturaElectronica/estados';
import { EstadoFeBadge, descargarFicheroFe, fechaCorta, nombreCanal } from './comun';

const hoy = () => new Date().toISOString().slice(0, 10);

async function leerEstado(factura: Invoice) {
  const [fe, cliente] = await Promise.all([
    getFeDeFactura(factura.id),
    factura.clientId ? getClientById(factura.clientId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  return {
    fe,
    alcance: alcanceDe(factura, cliente),
    comunicaciones: fe ? await getComunicaciones(fe.id).catch((): FeComunicacion[] => []) : [],
  };
}

export default function TarjetaFacturaElectronica({ factura }: { factura: Invoice }) {
  const { success, error: toastError } = useToast();
  const [cargado, setCargado] = useState(false);
  const [fe, setFe] = useState<FeFactura | null>(null);
  const [comunicaciones, setComunicaciones] = useState<FeComunicacion[]>([]);
  const [alcance, setAlcance] = useState<Alcance | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'generar' | 'enviar' | 'cobro' | 'impago' | 'bajar'>('');

  const aplicar = useCallback((d: Awaited<ReturnType<typeof leerEstado>>) => {
    setFe(d.fe);
    setAlcance(d.alcance);
    setComunicaciones(d.comunicaciones);
    setCargado(true);
  }, []);
  const cargar = useCallback(async () => aplicar(await leerEstado(factura)), [aplicar, factura]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await leerEstado(factura);
        if (vivo) aplicar(d);
      } catch {
        if (vivo) setCargado(true);
      }
    })();
    return () => { vivo = false; };
  }, [aplicar, factura]);

  if (!cargado || !alcance) return null;
  if (!fe && !alcance.posible) return null;

  const generar = async (forzar: boolean) => {
    setOcupado('generar');
    try {
      const r = await generarFacturaElectronica(factura, { forzar });
      if (r.problemas?.length) toastError('No se puede generar todavía', r.problemas.join(' '));
      else if (r.entrega && !r.entrega.ok && !r.entrega.pendiente) toastError('Generada, pero no se ha podido entregar', r.entrega.mensaje);
      else success('Factura electrónica generada', r.entrega?.mensaje ?? 'Queda guardada en UBL.');
      await cargar();
    } catch (e) {
      toastError('No se ha podido generar', e instanceof Error ? e.message : '');
    } finally { setOcupado(''); }
  };

  const enviar = async () => {
    if (!fe) return;
    setOcupado('enviar');
    try {
      const r = await enviarFacturaElectronica(fe.id);
      if (r.ok) success('Entregada', r.mensaje); else toastError(r.pendiente ? 'Pendiente' : 'No se ha podido entregar', r.mensaje);
      await cargar();
    } catch (e) {
      toastError('No se ha podido entregar', e instanceof Error ? e.message : '');
    } finally { setOcupado(''); }
  };

  const comunicar = async (tipo: 'cobro' | 'impago') => {
    if (!fe) return;
    setOcupado(tipo);
    try {
      const fecha = tipo === 'cobro' ? (factura.paidDate || hoy()).slice(0, 10) : hoy();
      await comunicarEstado(fe, tipo, fecha, tipo === 'cobro' ? { importe: factura.total } : {});
      success(tipo === 'cobro' ? 'Cobro comunicado' : 'Impago comunicado');
      await cargar();
    } catch (e) {
      toastError('No se ha podido comunicar', e instanceof Error ? e.message : '');
    } finally { setOcupado(''); }
  };

  const bajar = async () => {
    if (!fe) return;
    setOcupado('bajar');
    try { await descargarFicheroFe(fe.id); } catch (e) { toastError('No se ha podido descargar', e instanceof Error ? e.message : ''); } finally { setOcupado(''); }
  };

  const yaSalio = fe && !['generada', 'error'].includes(fe.estado);
  const puedeCobro = fe && yaSalio && !['pagada', 'anulada', 'rechazada'].includes(fe.estado);
  const cobrada = (factura.paidAmount ?? 0) >= factura.total - 0.005 || factura.status === 'pagada';

  return (
    <div className="card fe-tarjeta">
      <h4 className="card-title fe-tarjeta-titulo">
        <FileCode2 size={15} aria-hidden="true" /> Factura electrónica
        {fe && <EstadoFeBadge estado={fe.estado} />}
      </h4>

      {!fe ? (
        <>
          <p className="form-hint fe-tarjeta-texto">
            {alcance.obligatoria
              ? `${alcance.motivo} Entra en la factura electrónica obligatoria entre empresas.`
              : alcance.motivo}
          </p>
          <button type="button" className={`btn ${alcance.obligatoria ? 'btn-primary' : 'btn-secondary'} btn-sm`} disabled={!!ocupado}
            onClick={() => void generar(!alcance.obligatoria)}>
            {ocupado === 'generar' ? <Loader2 size={14} className="spin" /> : <FileCode2 size={14} />}
            {alcance.obligatoria ? 'Generar factura electrónica' : 'Generarla igualmente'}
          </button>
        </>
      ) : (
        <>
          <dl className="fe-tarjeta-datos">
            <div><dt>Formato</dt><dd>UBL · EN 16931</dd></div>
            <div><dt>Canal</dt><dd>{nombreCanal(fe.canal)}</dd></div>
            {fe.codigo && <div><dt>Código</dt><dd className="mono">{fe.codigo}</dd></div>}
            <div><dt>Estado desde</dt><dd>{fechaCorta(fe.estadoFecha)}</dd></div>
          </dl>
          {fe.mensaje && <p className="form-hint fe-tarjeta-texto">{fe.mensaje}</p>}
          {fe.estado === 'rechazada' && fe.motivo && <p className="fe-tarjeta-motivo">Motivo del rechazo: {fe.motivo}</p>}
          <div className="fe-tarjeta-acciones">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={() => void bajar()}>
              {ocupado === 'bajar' ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Fichero UBL
            </button>
            {!yaSalio && (
              <button type="button" className="btn btn-primary btn-sm" disabled={!!ocupado} onClick={() => void enviar()}>
                {ocupado === 'enviar' ? <Loader2 size={14} className="spin" /> : fe.estado === 'error' ? <RefreshCw size={14} /> : <Send size={14} />}
                {fe.estado === 'error' ? 'Reintentar' : 'Enviar'}
              </button>
            )}
            {puedeCobro && cobrada && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={() => void comunicar('cobro')}>
                {ocupado === 'cobro' && <Loader2 size={14} className="spin" />} Comunicar cobro
              </button>
            )}
            {puedeCobro && !cobrada && factura.dueDate && factura.dueDate.slice(0, 10) < hoy() && fe.estado !== 'impagada' && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => void comunicar('impago')}>
                {ocupado === 'impago' && <Loader2 size={14} className="spin" />} Comunicar impago
              </button>
            )}
          </div>
          {comunicaciones.length > 0 && (
            <ul className="fe-historial">
              {comunicaciones.map(c => (
                <li key={c.id}>
                  <span>{NOMBRE_COMUNICACION[c.tipo]}{c.importe !== undefined ? ` · ${formatCurrency(c.importe)}` : ''}</span>
                  <small>{fechaCorta(c.fechaHecho)} · {c.estado === 'enviada' ? 'comunicada' : c.estado === 'error' ? 'con error' : `pendiente (plazo ${fechaCorta(c.plazo)})`}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link href="/factura-electronica" className="fe-tarjeta-enlace">Ver todas las facturas electrónicas</Link>
    </div>
  );
}
