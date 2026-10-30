'use client';

/**
 * «Se están enfriando»: los clientes que llevan bastante más de lo normal
 * sin pedir, con lo necesario para recuperarlos sin salir del panel:
 * llamarles, escribirles por WhatsApp o prepararles ya la factura.
 *
 * La factura se abre con el cliente puesto en el editor de documentos
 * (`/documentos/nuevo?tipo=factura&clientId=`), el mismo enlace que usan las
 * órdenes de trabajo: es la pantalla de alta que ya acepta un cliente.
 */

import Link from 'next/link';
import { FilePlus2, MessageCircle, Phone, Snowflake } from 'lucide-react';
import type { Client } from '@/lib/types';
import type { ClienteFrio } from '@/lib/clientesFrios';
import { telefonoWhatsApp } from '@/lib/recordatorios/textos';
import { formatCurrency } from '@/lib/utils';

const CUANTOS = 4;

/** La factura nueva de siempre, con el cliente ya elegido (lee `?cliente=`). */
export const enlaceFacturarA = (clienteId: string) => `/facturas/nueva?cliente=${encodeURIComponent(clienteId)}`;

export default function ClientesFrios({ frios, clientes, remitente }: {
  frios: readonly ClienteFrio[];
  clientes: ReadonlyMap<string, Client>;
  remitente: string;
}) {
  if (!frios.length) return null;
  return (
    <section className="asesor-hoja clientes-frios" aria-labelledby="clientes-frios-titulo">
      <div className="asesor-hoja-cabeza">
        <span className="asesor-hoja-icono" aria-hidden="true"><Snowflake size={15} /></span>
        <div>
          <h2 id="clientes-frios-titulo" className="asesor-hoja-titulo">Se están enfriando</h2>
          <p className="asesor-hoja-sub">Clientes que llevan bastante más de lo normal sin pedir</p>
        </div>
      </div>
      <ul className="clientes-frios-lista">
        {frios.slice(0, CUANTOS).map(c => {
          const ficha = clientes.get(c.clienteId);
          const tel = ficha?.phone?.replace(/[^\d+]/g, '');
          const wa = telefonoWhatsApp(ficha?.phone);
          const saludo = `Hola, somos ${remitente || 'nosotros'}. Hace unos días que no sabemos de ti y queríamos preguntarte si necesitas algo esta semana.`;
          return (
            <li key={c.clienteId} className="clientes-frios-fila">
              <div className="clientes-frios-texto">
                <Link href={`/clientes/${c.clienteId}`} className="clientes-frios-nombre">{c.nombre}</Link>
                <span className="clientes-frios-detalle">{c.texto} · suele pedir {formatCurrency(c.ticketMedio)}</span>
              </div>
              <div className="clientes-frios-acciones">
                {tel && (
                  <a className="btn btn-ghost btn-icon btn-sm" href={`tel:${tel}`} aria-label={`Llamar a ${c.nombre}`} title="Llamar">
                    <Phone size={15} />
                  </a>
                )}
                {wa && (
                  <a className="btn btn-ghost btn-icon btn-sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(saludo)}`} target="_blank" rel="noopener noreferrer" aria-label={`Escribir a ${c.nombre} por WhatsApp`} title="WhatsApp">
                    <MessageCircle size={15} />
                  </a>
                )}
                <Link className="btn btn-secondary btn-sm" href={enlaceFacturarA(c.clienteId)} aria-label={`Hacer una factura a ${c.nombre}`}>
                  <FilePlus2 size={14} aria-hidden /> Factura
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
