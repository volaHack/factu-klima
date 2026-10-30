'use client';

/**
 * Bajo «facturas vencidas» de Para hoy: a quién reclamar primero, con el
 * botón que deja el mensaje escrito. Los que más tiempo llevan sin pagar
 * van arriba; se enseñan unos pocos, el resto está en Recordatorios.
 */

import Link from 'next/link';
import type { Client } from '@/lib/types';
import type { Deudor, Remitente } from '@/lib/recordatorios/textos';
import ReclamarCobro from '@/components/clientes/ReclamarCobro';
import { formatCurrency } from '@/lib/utils';

const CUANTOS = 3;

export default function DeudoresHoy({ deudores, clientes, remitente }: {
  deudores: readonly Deudor[];
  clientes: ReadonlyMap<string, Client>;
  remitente: Remitente;
}) {
  if (!deudores.length) return null;
  const resto = deudores.length - CUANTOS;
  return (
    <ul className="deudores-hoy" aria-label="A quién reclamar">
      {deudores.slice(0, CUANTOS).map(d => {
        const ficha = clientes.get(d.clienteId);
        return (
          <li key={d.clienteId || d.cliente} className="deudores-hoy-fila">
            <span className="deudores-hoy-quien">
              {ficha ? <Link href={`/clientes/${ficha.id}`}>{d.cliente}</Link> : d.cliente}
              <span className="deudores-hoy-detalle">
                {formatCurrency(d.total)} · {d.facturas.length === 1 ? '1 factura' : `${d.facturas.length} facturas`} · hace {d.maxRetraso} {d.maxRetraso === 1 ? 'día' : 'días'}
              </span>
            </span>
            <ReclamarCobro deudor={d} contacto={{ telefono: ficha?.phone, email: ficha?.email }} remitente={remitente} />
          </li>
        );
      })}
      {resto > 0 && (
        <li className="deudores-hoy-mas">
          <Link href="/recordatorios">Y {resto} {resto === 1 ? 'cliente más' : 'clientes más'} en Recordatorios</Link>
        </li>
      )}
    </ul>
  );
}
