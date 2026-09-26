/**
 * PORTAL DEL CLIENTE
 *
 * Lo que ve el cliente de un negocio al abrir el enlace que le mandan: sus
 * facturas, lo que tiene pendiente y cómo pagarlo (con tarjeta si el
 * negocio lo tiene activado, o por transferencia). Sin cuenta ni contraseña:
 * el enlace es la llave, y el negocio puede anularlo cuando quiera.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { CheckCircle2, FileText, Landmark, Mail, Phone } from 'lucide-react';
import { leerPortal } from '@/lib/portal/servidor';
import { checkRateLimit } from '@/lib/rateLimit';
import { formatCurrency } from '@/lib/utils';
import { BotonCopiar, BotonPagar } from '@/components/portal/BotonesPortal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tus facturas', robots: { index: false, follow: false } };

const fecha = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pagada: { texto: 'Pagada', clase: 'badge-success' },
  parcial: { texto: 'Pago parcial', clase: 'badge-info' },
  vencida: { texto: 'Vencida', clase: 'badge-danger' },
  anulada: { texto: 'Anulada', clase: 'badge-neutral' },
};

export default async function PortalPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pagado?: string; cancelado?: string }>;
}) {
  const { token } = await params;
  const { pagado } = await searchParams;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconocida';
  const permitido = await checkRateLimit(`portal:${ip}`, 120, 3600);
  const portal = permitido ? await leerPortal(token) : null;

  if (!portal) {
    return (
      <main className="portal portal--vacio">
        <h1>Este enlace no funciona</h1>
        <p>Puede que esté mal copiado o que el negocio lo haya cambiado. Pídele que te lo vuelva a enviar.</p>
      </main>
    );
  }

  const { empresa, cliente, facturas, totalPendiente } = portal;
  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = facturas.filter(f => f.pendiente > 0 && !f.rectificativa);

  return (
    <main className="portal">
      <header className="portal-cabecera">
        {empresa.logo
          ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={empresa.logo} alt="" className="portal-logo" />
          : <span className="portal-inicial" aria-hidden="true">{empresa.nombre.slice(0, 1)}</span>}
        <div>
          <p className="portal-empresa">{empresa.nombre}</p>
          <p className="portal-dato">{empresa.razonSocial !== empresa.nombre ? `${empresa.razonSocial} · ` : ''}NIF {empresa.nif}</p>
        </div>
      </header>

      <section className="portal-hola">
        <h1>Hola, {cliente.nombre}</h1>
        {pagado && (
          <p className="portal-aviso portal-aviso--ok" role="status">
            <CheckCircle2 size={18} /> Pago recibido, gracias. La factura aparecerá como pagada en unos segundos.
          </p>
        )}
        {totalPendiente > 0 ? (
          <p className="portal-resumen">Tienes <strong>{formatCurrency(totalPendiente)}</strong> pendientes en {pendientes.length} {pendientes.length === 1 ? 'factura' : 'facturas'}.</p>
        ) : (
          <p className="portal-resumen">Estás al día: no tienes nada pendiente. Aquí tienes todas tus facturas.</p>
        )}
      </section>

      {facturas.length === 0 ? (
        <p className="portal-dato">Todavía no hay facturas.</p>
      ) : (
        <ul className="portal-lista">
          {facturas.map(f => {
            const vencida = f.pendiente > 0 && !!f.vencimiento && f.vencimiento < hoy;
            const estado = f.estado === 'anulada' ? ESTADO.anulada
              : f.pendiente <= 0 ? ESTADO.pagada
                : vencida ? ESTADO.vencida
                  : f.estado === 'parcial' ? ESTADO.parcial
                    : { texto: 'Pendiente', clase: 'badge-warning' };
            return (
              <li key={f.id} className="portal-factura">
                <Link href={`/portal/${token}/f/${f.id}`} className="portal-factura-datos">
                  <FileText size={18} aria-hidden="true" />
                  <span>
                    <strong>{f.rectificativa ? 'Rectificativa ' : ''}{f.numero}</strong>
                    <small>{fecha(f.fecha)}{f.vencimiento && f.pendiente > 0 ? ` · vence ${fecha(f.vencimiento)}` : ''}</small>
                  </span>
                </Link>
                <span className={`badge ${estado.clase}`}>{estado.texto}</span>
                <span className="portal-importe mono">{formatCurrency(f.total)}</span>
                <span className="portal-accion">
                  {f.sePuedePagar && <BotonPagar token={token} facturaId={f.id} importe={formatCurrency(f.pendiente)} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {empresa.iban && totalPendiente > 0 && (
        <section className="portal-transferencia">
          <h2><Landmark size={18} /> Pagar por transferencia</h2>
          <p className="portal-dato">Pon el número de la factura como concepto para que se identifique sola.</p>
          <div className="portal-iban">
            <span className="mono">{empresa.iban}</span>
            <BotonCopiar texto={empresa.iban.replace(/\s/g, '')} etiqueta="IBAN" />
          </div>
          {empresa.banco && <p className="portal-dato">{empresa.banco} · titular {empresa.razonSocial}</p>}
        </section>
      )}

      <footer className="portal-pie">
        {empresa.email && <a href={`mailto:${empresa.email}`}><Mail size={14} /> {empresa.email}</a>}
        {empresa.telefono && <a href={`tel:${empresa.telefono.replace(/\s/g, '')}`}><Phone size={14} /> {empresa.telefono}</a>}
        <span>{empresa.direccion}</span>
        <span className="portal-marca">Facturas emitidas con FactuKlima · Veri*Factu</span>
      </footer>
    </main>
  );
}
