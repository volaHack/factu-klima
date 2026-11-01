'use client';

/**
 * De dónde viene un documento y a qué ha dado lugar, con enlaces, y en un
 * pedido cuánto se ha servido de cada línea. Antes la ficha sólo decía el
 * número del origen (y del primero de la cadena, no del inmediato): desde
 * un pedido no había forma de llegar a sus albaranes ni a sus facturas.
 */

import Link from 'next/link';
import { GitBranch, ArrowUpRight, CornerDownRight } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { etiquetaTipo } from '@/lib/documentos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { etiquetaEstado, type EstadoServicio, type LineaServida, type Traza } from '@/lib/flujoVenta';

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });

function Fila({ d, nivel, actual }: { d: Invoice; nivel: number; actual?: boolean }) {
  const anulado = d.status === InvoiceStatus.ANULADA;
  const contenido = (
    <>
      <span className="traza-tipo">{etiquetaTipo(d.tipo ?? 'factura')}</span>
      <strong className="traza-numero">{d.number}</strong>
      <span className={`badge badge-${d.status}`}>{etiquetaEstado(d)}</span>
      <span className="traza-dato">{formatDate(d.issueDate)}</span>
      <span className="traza-dato traza-importe">{formatCurrency(d.total)}</span>
    </>
  );
  return (
    <li className={`traza-fila${anulado ? ' traza-fila--anulada' : ''}${actual ? ' traza-fila--actual' : ''}`} style={{ paddingLeft: `calc(${nivel} * var(--space-5))` }}>
      {nivel > 0 && <CornerDownRight size={13} aria-hidden className="traza-rama" />}
      {actual
        ? <span className="traza-enlace" aria-current="page">{contenido}<span className="traza-aqui">Este</span></span>
        : <Link href={`/documentos/${d.id}`} className="traza-enlace">{contenido}<ArrowUpRight size={13} aria-hidden /></Link>}
    </li>
  );
}

export default function TrazaDocumento({ documento, traza, servicio }: {
  documento: Invoice;
  traza: Traza;
  servicio: { estado: EstadoServicio; lineas: LineaServida[] } | null;
}) {
  const hay = traza.origenes.length > 0 || traza.derivados.length > 0 || Boolean(documento.documentoOrigenNumber);
  if (!hay && !servicio) return null;
  // El origen guardado puede no estar en este equipo (borrado, o aún sin bajar): al menos su número.
  const origenPerdido = documento.documentoOrigenNumber && !traza.origenes.some(o => o.id === documento.documentoOrigenId);

  return (
    <section className="card traza" aria-labelledby="traza-titulo">
      <h3 id="traza-titulo" className="card-title traza-titulo"><GitBranch size={16} aria-hidden /> Cadena del documento</h3>
      {hay && (
        <ol className="traza-lista">
          {origenPerdido && (
            <li className="traza-fila traza-fila--perdida">
              <span className="traza-enlace">
                <span className="traza-tipo">Origen</span>
                <strong className="traza-numero">{documento.documentoOrigenNumber}</strong>
                <span className="traza-dato">No está en este equipo</span>
              </span>
            </li>
          )}
          {traza.origenes.map(o => <Fila key={o.id} d={o} nivel={0} />)}
          <Fila d={documento} nivel={0} actual />
          {traza.derivados.map(({ doc, nivel }) => <Fila key={doc.id} d={doc} nivel={nivel + 1} />)}
        </ol>
      )}
      {!traza.derivados.length && hay && (
        <p className="traza-nota">Todavía no ha dado lugar a ningún otro documento.</p>
      )}

      {servicio && servicio.lineas.length > 0 && (
        <div className="traza-servicio">
          <h4 className="traza-subtitulo">
            Entregas
            <span className={`badge ${servicio.estado === 'servido' ? 'badge-success' : servicio.estado === 'parcial' ? 'badge-warning' : 'badge-neutral'}`}>
              {servicio.estado === 'servido' ? 'Servido' : servicio.estado === 'parcial' ? 'Servido en parte' : 'Sin servir'}
            </span>
          </h4>
          <div className="table-responsive">
            <table className="table traza-tabla">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th style={{ textAlign: 'right' }}>Pedido</th>
                  <th style={{ textAlign: 'right' }}>Servido</th>
                  <th style={{ textAlign: 'right' }}>Falta</th>
                </tr>
              </thead>
              <tbody>
                {servicio.lineas.map(l => (
                  <tr key={l.articulo}>
                    <td>{l.nombre}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(l.pedido)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {fmt(l.servido)}
                      {l.exceso > 0 && <span className="traza-exceso" title="Se ha servido más de lo pedido"> (+{fmt(l.exceso)})</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: l.pendiente > 0 ? 600 : 400 }}>{l.pendiente > 0 ? fmt(l.pendiente) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
