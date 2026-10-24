'use client';

/**
 * IMPRESOS — sacar por impresora muchos documentos de una vez
 *
 * Se elige qué (los albaranes de venta, las facturas de compra, los
 * cobros…), se acota por fechas, números y cliente o proveedor, se marcan
 * y salen todos juntos:
 *
 *   · «Con mi diseño»: un solo PDF con el diseño de la empresa, el mismo
 *     del botón «Descargar PDF» de cada documento (lib/plantillas/componer);
 *   · «Sencillo»: una hoja limpia por documento, que sirve también para lo
 *     que no tiene diseño (recibos, entregas a cuenta, regularizaciones).
 */

import { useEffect, useMemo, useState } from 'react';
import { FileDown, Printer, Loader2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import BuscadorFicha from '@/components/clientes/BuscadorFicha';
import {
  getInvoices, getAlbaranes, getCobrosPagos, getRegularizaciones, getClients, getCompanySettings,
} from '@/lib/storage';
import type { Albaran, Client, CobroPago, CompanySettings, Invoice, RegularizacionStock } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import type { TipoDocumentoPlantilla } from '@/lib/plantillas/tiposDocumento';
import { htmlDeDocumento, htmlDeRecibo, htmlDeRegularizacion, CSS_IMPRESO } from '@/lib/informes/impresos';
import { secuenciaDe } from '@/lib/listados';
import { formatCurrency, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { imprimirHtml } from './papel';

type ClaseImpreso =
  | { clase: 'doc'; tipo: Invoice['tipo']; sentido: 'venta' | 'compra' }
  | { clase: 'almacen'; sentido: 'entrada' | 'salida' }
  | { clase: 'regularizacion' }
  | { clase: 'recibo'; tipo: 'cobro' | 'pago' }
  | { clase: 'entrega' };

const TIPOS: { id: string; nombre: string; grupo: string; de: ClaseImpreso; tercero?: 'cliente' | 'proveedor' }[] = [
  { id: 'entradas', nombre: 'Entradas de almacén', grupo: 'Almacén', de: { clase: 'almacen', sentido: 'entrada' }, tercero: 'proveedor' },
  { id: 'salidas', nombre: 'Salidas de almacén', grupo: 'Almacén', de: { clase: 'almacen', sentido: 'salida' }, tercero: 'cliente' },
  { id: 'regularizaciones', nombre: 'Regularizaciones', grupo: 'Almacén', de: { clase: 'regularizacion' } },
  { id: 'pedidos_compra', nombre: 'Pedidos de compra', grupo: 'Compras', de: { clase: 'doc', tipo: 'pedido', sentido: 'compra' }, tercero: 'proveedor' },
  { id: 'albaranes_compra', nombre: 'Albaranes de compra', grupo: 'Compras', de: { clase: 'doc', tipo: 'albaran', sentido: 'compra' }, tercero: 'proveedor' },
  { id: 'facturas_compra', nombre: 'Facturas de compra', grupo: 'Compras', de: { clase: 'doc', tipo: 'factura', sentido: 'compra' }, tercero: 'proveedor' },
  { id: 'rectificativas_compra', nombre: 'Facturas de compra rectificativas', grupo: 'Compras', de: { clase: 'doc', tipo: 'rectificativa', sentido: 'compra' }, tercero: 'proveedor' },
  { id: 'pagos', nombre: 'Pagos', grupo: 'Compras', de: { clase: 'recibo', tipo: 'pago' }, tercero: 'proveedor' },
  { id: 'presupuestos', nombre: 'Presupuestos', grupo: 'Ventas', de: { clase: 'doc', tipo: 'presupuesto', sentido: 'venta' }, tercero: 'cliente' },
  { id: 'pedidos_venta', nombre: 'Pedidos de venta', grupo: 'Ventas', de: { clase: 'doc', tipo: 'pedido', sentido: 'venta' }, tercero: 'cliente' },
  { id: 'albaranes_venta', nombre: 'Albaranes de venta', grupo: 'Ventas', de: { clase: 'doc', tipo: 'albaran', sentido: 'venta' }, tercero: 'cliente' },
  { id: 'facturas_venta', nombre: 'Facturas de venta', grupo: 'Ventas', de: { clase: 'doc', tipo: 'factura', sentido: 'venta' }, tercero: 'cliente' },
  { id: 'rectificativas_venta', nombre: 'Facturas de venta rectificativas', grupo: 'Ventas', de: { clase: 'doc', tipo: 'rectificativa', sentido: 'venta' }, tercero: 'cliente' },
  { id: 'entregas', nombre: 'Entregas a cuenta', grupo: 'Ventas', de: { clase: 'entrega' }, tercero: 'cliente' },
  { id: 'cobros', nombre: 'Cobros', grupo: 'Ventas', de: { clase: 'recibo', tipo: 'cobro' }, tercero: 'cliente' },
];

interface Elemento {
  id: string;
  numero: string;
  fecha: string;
  tercero: string;
  terceroId?: string;
  total: number;
  borrador: boolean;
  html: () => string;
  /** Si tiene diseño propio (pedidos, albaranes, facturas…). */
  pdf?: { tipo: TipoDocumentoPlantilla; documento: Invoice | Albaran };
}

const NO_MUEVE = ['borrador', 'anulada', 'rechazado', 'pre_aprobacion'];

export interface DatosImpresos {
  facturas: Invoice[]; albaranes: Albaran[]; movimientos: CobroPago[]; regs: RegularizacionStock[]; clientes: Client[]; empresa: CompanySettings | null;
}

export default function Impresos() {
  const { error: avisarError } = useToast();
  const [datos, setDatos] = useState<DatosImpresos | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [facturas, albaranes, movimientos, regs, clientes, empresa] = await Promise.all([
          getInvoices(), getAlbaranes(), getCobrosPagos(), getRegularizaciones().catch(() => []), getClients(), getCompanySettings(),
        ]);
        setDatos({ facturas, albaranes, movimientos, regs, clientes, empresa });
      } catch {
        avisarError('No se han podido cargar los documentos', 'Vuelve a intentarlo en un momento.');
      }
    })();
  }, [avisarError]);

  if (!datos) return <PageSkeleton variant="list" label="Cargando los documentos" />;
  return <VistaImpresos datos={datos} />;
}

/** La pantalla con los documentos ya cargados. */
export function VistaImpresos({ datos }: { datos: DatosImpresos }) {
  const { error: avisarError, warning, success } = useToast();
  const [tipoId, setTipoId] = useState('facturas_venta');
  const [desde, setDesde] = useState(`${getToday().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(getToday());
  const [numDesde, setNumDesde] = useState<number | ''>('');
  const [numHasta, setNumHasta] = useState<number | ''>('');
  const [terceroId, setTerceroId] = useState('');
  const [conBorradores, setConBorradores] = useState(false);
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const tipo = TIPOS.find(t => t.id === tipoId) ?? TIPOS[0];

  const elementos = useMemo((): Elemento[] => {
    const { facturas, albaranes, movimientos, regs, clientes, empresa } = datos;
    const ficha = (id?: string) => clientes.find(c => c.id === id) ?? null;
    const forma = (v: string) => PAYMENT_METHODS.find(p => p.value === v)?.label ?? v;
    const deDoc = (d: Invoice): Elemento => ({
      id: d.id, numero: d.number, fecha: d.issueDate, tercero: d.clientName, terceroId: d.clientId, total: d.total,
      borrador: d.status === 'borrador',
      html: () => htmlDeDocumento(d, empresa, ficha(d.clientId)),
      pdf: { tipo: (d.tipo ?? 'factura') as TipoDocumentoPlantilla, documento: d },
    });
    const de = tipo.de;
    let lista: Elemento[] = [];
    if (de.clase === 'doc') {
      lista = facturas.filter(d => (d.tipo ?? 'factura') === de.tipo && (d.sentido ?? 'venta') === de.sentido).map(deDoc);
      // Los albaranes de la pantalla de Albaranes, junto a los de Documentos.
      if (de.tipo === 'albaran' && de.sentido === 'venta') {
        lista.push(...albaranes.map(a => ({
          id: a.id, numero: a.number, fecha: a.issueDate, tercero: a.clientName, terceroId: a.clientId, total: a.total,
          borrador: a.status === 'borrador',
          html: () => htmlDeDocumento(a, empresa, ficha(a.clientId)),
          pdf: { tipo: 'albaran' as TipoDocumentoPlantilla, documento: a },
        })));
      }
    } else if (de.clase === 'almacen') {
      const sentido = de.sentido === 'entrada' ? 'compra' : 'venta';
      const deAlbaran = new Set(facturas.filter(f => f.tipo === 'albaran').map(f => f.id));
      lista = facturas
        .filter(d => (d.sentido ?? 'venta') === sentido && !NO_MUEVE.includes(d.status)
          && (d.tipo === 'albaran' || ((d.tipo ?? 'factura') === 'factura' && !(d.documentoOrigenId && deAlbaran.has(d.documentoOrigenId)))))
        .map(deDoc);
      for (const r of regs) {
        if (de.sentido === 'entrada' ? r.diferencia <= 0 : r.diferencia >= 0) continue;
        lista.push({ id: r.id, numero: r.productRef, fecha: r.fecha, tercero: `Regularización: ${r.productName}`, total: 0, borrador: false, html: () => htmlDeRegularizacion(r, empresa) });
      }
    } else if (de.clase === 'regularizacion') {
      lista = regs.map(r => ({ id: r.id, numero: r.productRef, fecha: r.fecha, tercero: r.productName, total: 0, borrador: false, html: () => htmlDeRegularizacion(r, empresa) }));
    } else if (de.clase === 'recibo') {
      lista = movimientos.filter(m => m.tipo === de.tipo).map(m => ({
        id: m.id, numero: m.number, fecha: m.fecha, tercero: m.contraparteNombre, terceroId: m.contraparteId, total: m.importeTotal, borrador: false,
        html: () => htmlDeRecibo(m, empresa, forma(m.paymentMethod)),
      }));
    } else {
      lista = movimientos
        .filter(m => m.tipo === 'cobro' && m.importeTotal - m.desglose.reduce((s, d) => s + (d.importeAplicado || 0), 0) > 0.004)
        .map(m => ({
          id: m.id, numero: m.number, fecha: m.fecha, tercero: m.contraparteNombre, terceroId: m.contraparteId,
          total: m.importeTotal - m.desglose.reduce((s, d) => s + (d.importeAplicado || 0), 0), borrador: false,
          html: () => htmlDeRecibo(m, empresa, forma(m.paymentMethod), true),
        }));
    }
    return lista
      .filter(x => (!desde || x.fecha >= desde) && (!hasta || x.fecha <= hasta))
      .filter(x => numDesde === '' || secuenciaDe(x.numero) >= numDesde)
      .filter(x => numHasta === '' || secuenciaDe(x.numero) <= numHasta)
      .filter(x => !terceroId || x.terceroId === terceroId)
      .filter(x => conBorradores || !x.borrador)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
  }, [datos, tipo, desde, hasta, numDesde, numHasta, terceroId, conBorradores]);

  const marcados = elementos.filter(x => !quitados.has(x.id));
  const conDiseno = marcados.length > 0 && marcados.every(x => x.pdf);
  const terceros = tipo.tercero === 'cliente' ? datos.clientes.filter(c => !c.esProveedor)
    : tipo.tercero === 'proveedor' ? datos.clientes.filter(c => c.esProveedor) : datos.clientes;

  const alternar = (id: string) => setQuitados(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const imprimirSencillo = () => {
    imprimirHtml(`${tipo.nombre} ${desde} ${hasta}`, marcados.map(x => x.html()).join('\n'), CSS_IMPRESO);
  };

  const imprimirConDiseno = async () => {
    // La ventana se abre YA, en el clic: abierta después de generar, el
    // navegador la tomaría por una ventana emergente y la bloquearía.
    const ventana = window.open('', '_blank');
    setProgreso({ hechos: 0, total: marcados.length });
    try {
      const { componerTanda } = await import('@/lib/plantillas/componer');
      const blob = await componerTanda(marcados.map(x => x.pdf!), hechos => setProgreso({ hechos, total: marcados.length }));
      if (!blob) {
        ventana?.close();
        warning('Todavía no tienes un diseño propio', 'Usa «Imprimir sencillo» o sube tu diseño en Diseño de documentos.');
        return;
      }
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tipo.id}_${desde}_${hasta}.pdf`;
        a.click();
      }
      success('PDF listo', `${marcados.length} ${marcados.length === 1 ? 'documento' : 'documentos'} en un solo PDF.`);
    } catch (err) {
      ventana?.close();
      avisarError('No se ha podido generar el PDF', err instanceof Error ? err.message : 'Vuelve a intentarlo.');
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Impresos</h2>
          <p className="page-subtitle">Imprime de una vez todos los documentos que necesites, con tu diseño o en hoja sencilla.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={imprimirSencillo} disabled={marcados.length === 0 || !!progreso}>
            <Printer size={16} /> Imprimir sencillo
          </button>
          {elementos.some(x => x.pdf) && (
            <button className="btn btn-primary" onClick={imprimirConDiseno} disabled={!conDiseno || !!progreso}>
              {progreso ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
              {progreso ? `Preparando ${progreso.hechos} de ${progreso.total}…` : 'Con mi diseño (PDF)'}
            </button>
          )}
        </div>
      </div>

      <div className="card listado-filtros">
        <div className="listados-filtros-rejilla">
          <div className="form-group listados-filtro-ancho">
            <label className="form-label" htmlFor="impreso-tipo">Qué imprimir</label>
            <select id="impreso-tipo" className="form-select" value={tipo.id} onChange={e => { setTipoId(e.target.value); setTerceroId(''); setQuitados(new Set()); }}>
              {['Almacén', 'Compras', 'Ventas'].map(g => (
                <optgroup key={g} label={g}>
                  {TIPOS.filter(t => t.grupo === g).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº desde</label>
            <input className="form-input" type="number" min={0} value={numDesde} onChange={e => setNumDesde(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1" />
          </div>
          <div className="form-group">
            <label className="form-label">Nº hasta</label>
            <input className="form-input" type="number" min={0} value={numHasta} onChange={e => setNumHasta(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Sin tope" />
          </div>
          {tipo.tercero && (
            <div className="form-group listados-filtro-ancho">
              <label className="form-label">{tipo.tercero === 'cliente' ? 'Cliente' : 'Proveedor'}</label>
              <BuscadorFicha fichas={terceros} value={terceroId} onSelect={setTerceroId} placeholder="Todos · o busca uno" />
            </div>
          )}
        </div>
        {tipo.de.clase === 'doc' && (
          <label className="form-check listados-casillas">
            <input type="checkbox" checked={conBorradores} onChange={e => setConBorradores(e.target.checked)} />
            <span>Incluir borradores</span>
          </label>
        )}
      </div>

      <div className="card">
        <div className="impresos-barra">
          <label className="form-check">
            <input
              type="checkbox"
              checked={elementos.length > 0 && quitados.size === 0}
              onChange={e => setQuitados(e.target.checked ? new Set() : new Set(elementos.map(x => x.id)))}
            />
            <span>{marcados.length} de {elementos.length} marcados</span>
          </label>
          <span className="impresos-total">Total marcado: <strong>{formatCurrency(marcados.reduce((s, x) => s + x.total, 0))}</strong></span>
        </div>
        <div className="table-responsive">
          <table className="table tabla-tarjetas">
            <thead>
              <tr><th style={{ width: 36 }}><span className="sr-only">Imprimir</span></th><th>Número</th><th>Fecha</th><th>{tipo.tercero === 'proveedor' ? 'Proveedor' : tipo.tercero === 'cliente' ? 'Cliente' : 'Artículo / detalle'}</th><th style={{ textAlign: 'right' }}>Importe</th></tr>
            </thead>
            <tbody>
              {elementos.length === 0 ? (
                <tr><td colSpan={5} className="listado-vacio">Nada con ese acotado. Prueba a ampliar las fechas.</td></tr>
              ) : elementos.map(x => (
                <tr key={x.id} className={quitados.has(x.id) ? 'impresos-fuera' : ''}>
                  <td data-m="check">
                    <input type="checkbox" aria-label={`Imprimir ${x.numero}`} checked={!quitados.has(x.id)} onChange={() => alternar(x.id)} />
                  </td>
                  <td className="mono" data-m="titulo">{x.numero}{x.borrador && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Borrador</span>}</td>
                  <td data-m="dato" data-label="Fecha">{formatDate(x.fecha)}</td>
                  <td data-m="sub">{x.tercero}</td>
                  <td className="mono" style={{ textAlign: 'right' }} data-m="importe">{x.total ? formatCurrency(x.total) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
