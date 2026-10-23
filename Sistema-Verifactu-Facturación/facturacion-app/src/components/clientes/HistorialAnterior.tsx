'use client';

/**
 * Lo que este cliente o proveedor tuvo en el programa anterior (ISECAN…):
 * facturas por año, la última compra, lo que quedó sin facturar y la
 * lista de documentos. Solo consulta; ver lib/historico.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  NOMBRE_ORIGEN, NOMBRE_TIPO, numeroVisible, quedoPendiente, resumenHistorico,
  type DocumentoHistorico,
} from '@/lib/historico';

const DE_A_POCO = 25;

interface Props {
  /** Los de esta ficha (getHistoricoDeFicha); los carga la ficha, que los usa también arriba. */
  docs: DocumentoHistorico[] | null;
  esProveedor: boolean;
  /** El filtro de fechas de la ficha (aaaa-mm-dd), que vale también aquí. */
  desde?: string;
  hasta?: string;
}

export default function HistorialAnterior({ docs, esProveedor, desde, hasta }: Props) {
  const [visibles, setVisibles] = useState(DE_A_POCO);

  const filtrados = useMemo(() => (docs ?? []).filter(d => {
    if (desde && (!d.fecha || d.fecha < desde)) return false;
    if (hasta && (!d.fecha || d.fecha > hasta)) return false;
    return true;
  }), [docs, desde, hasta]);
  const resumen = useMemo(() => resumenHistorico(filtrados), [filtrados]);

  if (!docs?.length) return null;

  const origen = NOMBRE_ORIGEN[docs[0].origen] ?? 'el programa anterior';
  const filtro = Boolean(desde || hasta);

  return (
    <div className="card historial-anterior" id="historial-anterior" style={{ marginTop: 'var(--space-6)' }}>
      <div className="card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h3 className="card-title"><History size={16} aria-hidden /> Historial en {origen}</h3>
          <p className="card-subtitle">
            Lo emitido allí antes de pasar a Klima. Solo para consultar: no cuenta en Veri*Factu,
            ni en los modelos de IGIC, ni en la contabilidad.
          </p>
        </div>
        <Link href="/historico" className="btn btn-ghost btn-sm">Todo el historial</Link>
      </div>

      {filtrados.length === 0 ? (
        <p className="card-subtitle">Nada de {origen} entre esas fechas.</p>
      ) : (
        <>
          {resumen.anios.length > 0 && (
            <div className="table-container" style={{ border: 'none', marginBottom: 'var(--space-4)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Año</th>
                    <th style={{ textAlign: 'right' }}>{esProveedor ? 'Facturas recibidas' : 'Facturas'}</th>
                    <th style={{ textAlign: 'right' }}>{esProveedor ? 'Comprado' : 'Facturado'}</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.anios.map(a => (
                    <tr key={a.anio}>
                      <td>{a.anio}</td>
                      <td className="amount">{a.facturas.toLocaleString('es-ES')}</td>
                      <td className="amount">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="chart-nota" style={{ marginBottom: 'var(--space-4)' }}>
            {resumen.ultimaFactura && (
              <>Última factura: <strong>{formatDate(resumen.ultimaFactura)}</strong>. </>
            )}
            {resumen.pendientes.albaranes > 0 && (
              <>
                <strong>{resumen.pendientes.albaranes}</strong> {resumen.pendientes.albaranes === 1 ? 'albarán' : 'albaranes'} sin factura en {origen}
                {resumen.pendientes.pedidos > 0 ? ', ' : ' '}
              </>
            )}
            {resumen.pendientes.pedidos > 0 && (
              <><strong>{resumen.pendientes.pedidos}</strong> {resumen.pendientes.pedidos === 1 ? 'pedido' : 'pedidos'} sin servir </>
            )}
            {(resumen.pendientes.albaranes > 0 || resumen.pendientes.pedidos > 0) && (
              <>(<strong>{formatCurrency(resumen.pendientes.total)}</strong>).</>
            )}
          </p>

          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nº</th>
                  <th>Fecha</th>
                  <th className="col-forma">Forma de pago</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, visibles).map(d => (
                  <tr key={d.id}>
                    <td>
                      {NOMBRE_TIPO[d.tipo]}
                      {quedoPendiente(d) && (
                        <> <span className="badge badge-warning">{d.tipo === 'pedido_venta' ? 'Sin servir' : 'Sin factura'}</span></>
                      )}
                    </td>
                    <td className="mono" title={d.observaciones ?? undefined}>{numeroVisible(d)}</td>
                    <td>{d.fecha ? formatDate(d.fecha) : '—'}</td>
                    <td className="col-forma">{d.formaPago ?? '—'}</td>
                    <td className="amount">{formatCurrency(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtrados.length > visibles && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span className="card-subtitle" style={{ marginTop: 0 }}>
                {visibles.toLocaleString('es-ES')} de {filtrados.length.toLocaleString('es-ES')}{filtro ? ' entre esas fechas' : ''}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisibles(v => v + 100)}>
                Ver más
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
