'use client';

/**
 * La tarjeta que sale bajo el cliente elegido en un documento: lo que debe,
 * lo vencido, lo facturado este año, su último documento y las
 * observaciones de su ficha (lo que hay que tener en cuenta con él).
 *
 * A un cliente se le añade el semáforo de su deuda y cómo suele pagar: al
 * ir a facturarle a quien debe mucho se ve sin ir a buscarlo, antes de
 * fiarle otra vez.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, StickyNote } from 'lucide-react';
import type { Client, Invoice } from '@/lib/types';
import { getInvoices } from '@/lib/storage';
import { resumenDeFicha } from '@/lib/resumenFicha';
import { hoyLocal, perfilDePago, riesgoDeCliente } from '@/lib/perfilPago';
import { LineaCobro } from './CobroCliente';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ResumenFichaElegida({ ficha, excluirId, sinCifras = false }: {
  ficha: Client | undefined | null;
  excluirId?: string;
  /**
   * Sin lo que debe ni lo facturado: sólo las observaciones y el enlace a
   * la ficha. Es lo que ve el perfil de vendedor (lib/perfiles.ts).
   */
  sinCifras?: boolean;
}) {
  const [docs, setDocs] = useState<Invoice[] | null>(null);
  useEffect(() => {
    if (sinCifras) return;
    let vivo = true;
    getInvoices().then(d => { if (vivo) setDocs(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [sinCifras]);

  if (!ficha) return null;
  if (sinCifras) {
    return (
      <div className="resumen-ficha" role="status">
        <div className="resumen-ficha-datos">
          {ficha.phone && <span>Tel. <strong>{ficha.phone}</strong></span>}
          {(ficha.city || ficha.province) && <span>{[ficha.city, ficha.province].filter(Boolean).join(', ')}</span>}
          <Link href={`/clientes/${ficha.id}`} target="_blank" className="resumen-ficha-enlace">
            Ver ficha <ExternalLink size={12} aria-hidden />
          </Link>
        </div>
        {ficha.notes?.trim() && (
          <p className="resumen-ficha-notas"><StickyNote size={13} aria-hidden /> {ficha.notes.trim()}</p>
        )}
      </div>
    );
  }
  // Las observaciones de la ficha se enseñan ya; las cuentas, cuando lleguen los documentos.
  if (!docs) {
    return ficha.notes?.trim()
      ? <div className="resumen-ficha" role="status"><p className="resumen-ficha-notas" style={{ marginTop: 0 }}><StickyNote size={13} aria-hidden /> {ficha.notes.trim()}</p></div>
      : null;
  }
  const otros = docs.filter(d => d.id !== excluirId);
  const r = resumenDeFicha(otros, ficha.id);
  const proveedor = !!ficha.esProveedor;
  const hoy = hoyLocal();
  const riesgo = proveedor ? null : riesgoDeCliente(otros, ficha.id, hoy);
  return (
    <div className={`resumen-ficha${r.vencidas ? ' con-vencidas' : ''}`} role="status">
      {riesgo && <LineaCobro riesgo={riesgo} perfil={perfilDePago(otros, ficha.id, hoy)} />}
      <div className="resumen-ficha-datos">
        {/* A un proveedor no se le cobra: sólo lo que se le debe. */}
        {proveedor && (r.pendiente > 0 ? (
          <span className={r.vencidas ? 'resumen-ficha-alerta' : ''}>
            {r.vencidas > 0 && <AlertTriangle size={13} aria-hidden />}
            Le debes <strong>{formatCurrency(r.pendiente)}</strong> en {r.facturasPendientes} {r.facturasPendientes === 1 ? 'factura' : 'facturas'}
            {r.vencidas > 0 && <> · <strong>{r.vencidas} vencida{r.vencidas === 1 ? '' : 's'}</strong> ({formatCurrency(r.importeVencido)})</>}
          </span>
        ) : (
          <span>No le debes nada</span>
        ))}
        <span>Este año: <strong>{formatCurrency(r.facturadoAnio)}</strong></span>
        {r.ultimo && <span>Último: {r.ultimo.tipo} {r.ultimo.numero} del {formatDate(r.ultimo.fecha)} ({formatCurrency(r.ultimo.total)})</span>}
        <Link href={`/clientes/${ficha.id}`} target="_blank" className="resumen-ficha-enlace">
          Ver ficha <ExternalLink size={12} aria-hidden />
        </Link>
      </div>
      {ficha.notes?.trim() && (
        <p className="resumen-ficha-notas"><StickyNote size={13} aria-hidden /> {ficha.notes.trim()}</p>
      )}
    </div>
  );
}
