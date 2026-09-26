/**
 * UNA FACTURA DEL PORTAL
 *
 * La factura completa, lista para imprimir o guardar en PDF desde el
 * navegador, con su QR tributario (es el mismo que lleva el PDF: se genera
 * con los cuatro datos de la propia factura) y, si toca, el botón de pagar.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { leerFacturaDelPortal } from '@/lib/portal/servidor';
import { checkRateLimit } from '@/lib/rateLimit';
import { formatCurrency } from '@/lib/utils';
import { generarQrVerifactu } from '@/lib/verifactu/qr';
import { LEYENDA_LARGA, ROTULO_QR } from '@/lib/verifactu/qrFactura';
import { BotonImprimir, BotonPagar } from '@/components/portal/BotonesPortal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Factura', robots: { index: false, follow: false } };

const fecha = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const numero = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });

export default async function FacturaPortalPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconocida';
  const detalle = (await checkRateLimit(`portal:${ip}`, 120, 3600)) ? await leerFacturaDelPortal(token, id) : null;

  if (!detalle) {
    return (
      <main className="portal portal--vacio">
        <h1>No encontramos esta factura</h1>
        <p><Link href={`/portal/${token}`}>Volver a tus facturas</Link></p>
      </main>
    );
  }

  const { empresa, cliente, factura: f } = detalle;
  const qr = f.estado !== 'anulada'
    ? await generarQrVerifactu({ nifEmisor: empresa.nif, numeroFactura: f.numero, fechaEmision: f.fecha, importeTotal: f.total }).catch(() => '')
    : '';
  const retencion = f.retencionPct ? Math.round(f.subtotal * f.retencionPct) / 100 : 0;

  return (
    <main className="portal portal-doc">
      <div className="portal-doc-barra no-print">
        <Link href={`/portal/${token}`} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Tus facturas</Link>
        <span className="portal-doc-acciones">
          {f.sePuedePagar && <BotonPagar token={token} facturaId={f.id} importe={formatCurrency(f.pendiente)} />}
          <BotonImprimir />
        </span>
      </div>

      <article className="portal-hoja">
        <header className="portal-hoja-cabecera">
          <div>
            <p className="portal-empresa">{empresa.razonSocial || empresa.nombre}</p>
            <p className="portal-dato">NIF {empresa.nif}</p>
            <p className="portal-dato">{empresa.direccion}</p>
          </div>
          <div className="portal-hoja-titulo">
            <h1>{f.tipo === 'rectificativa' ? 'Factura rectificativa' : 'Factura'}</h1>
            <p><strong>{f.numero}</strong></p>
            <p className="portal-dato">Fecha {fecha(f.fecha)}{f.vencimiento ? ` · vence ${fecha(f.vencimiento)}` : ''}</p>
            {f.estado === 'anulada' && <p className="badge badge-neutral">Anulada</p>}
          </div>
        </header>

        <section className="portal-hoja-cliente">
          <span className="portal-dato">Cliente</span>
          <p><strong>{cliente.nombre}</strong></p>
          {cliente.nif && <p className="portal-dato">NIF {cliente.nif}</p>}
          {cliente.direccion && <p className="portal-dato">{cliente.direccion}</p>}
        </section>

        <table className="portal-tabla">
          <thead>
            <tr><th>Concepto</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Importe</th></tr>
          </thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.concepto}</td>
                <td className="num">{numero(l.cantidad)}</td>
                <td className="num mono">{formatCurrency(l.precio)}</td>
                <td className="num mono">{formatCurrency(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="portal-hoja-pie">
          {qr ? (
            <figure className="portal-qr">
              <figcaption>{ROTULO_QR}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Código QR para verificar esta factura en la sede electrónica de la AEAT" />
              <figcaption>{LEYENDA_LARGA}</figcaption>
            </figure>
          ) : <span />}
          <dl className="portal-totales">
            <div><dt>Base imponible</dt><dd className="mono">{formatCurrency(f.subtotal)}</dd></div>
            {f.impuestos.map(t => (
              <div key={t.tipo}><dt>Impuesto {numero(t.tipo)} % sobre {formatCurrency(t.base)}</dt><dd className="mono">{formatCurrency(t.cuota)}</dd></div>
            ))}
            {retencion > 0 && <div><dt>Retención IRPF {numero(f.retencionPct!)} %</dt><dd className="mono">−{formatCurrency(retencion)}</dd></div>}
            <div className="portal-total"><dt>Total</dt><dd className="mono">{formatCurrency(f.total - retencion)}</dd></div>
            {f.pendiente > 0 && f.pendiente < f.total - retencion - 0.01 && (
              <div><dt>Pendiente de pago</dt><dd className="mono">{formatCurrency(f.pendiente)}</dd></div>
            )}
          </dl>
        </div>

        {f.notas && <p className="portal-dato portal-notas">{f.notas}</p>}
        {empresa.iban && f.pendiente > 0 && (
          <p className="portal-dato">Transferencia a {empresa.iban}{empresa.banco ? ` (${empresa.banco})` : ''}, con el concepto {f.numero}.</p>
        )}
      </article>
    </main>
  );
}
