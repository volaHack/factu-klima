'use client';

/**
 * La tarjeta que sale bajo el cliente elegido en un documento: lo que debe,
 * lo vencido, lo facturado este año, su último documento y las
 * observaciones de su ficha (lo que hay que tener en cuenta con él).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, StickyNote } from 'lucide-react';
import type { Client, Invoice } from '@/lib/types';
import { getInvoices } from '@/lib/storage';
import { resumenDeFicha } from '@/lib/resumenFicha';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ResumenFichaElegida({ ficha, excluirId }: { ficha: Client | undefined | null; excluirId?: string }) {
  const [docs, setDocs] = useState<Invoice[] | null>(null);
  useEffect(() => {
    let vivo = true;
    getInvoices().then(d => { if (vivo) setDocs(d); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!ficha) return null;
  // Las observaciones de la ficha se enseñan ya; las cuentas, cuando lleguen los documentos.
  if (!docs) {
    return ficha.notes?.trim()
      ? <div className="resumen-ficha" role="status"><p className="resumen-ficha-notas" style={{ marginTop: 0 }}><StickyNote size={13} aria-hidden /> {ficha.notes.trim()}</p></div>
      : null;
  }
  const r = resumenDeFicha(docs.filter(d => d.id !== excluirId), ficha.id);
  const proveedor = !!ficha.esProveedor;
  return (
    <div className={`resumen-ficha${r.vencidas ? ' con-vencidas' : ''}`} role="status">
      <div className="resumen-ficha-datos">
        {r.pendiente > 0 ? (
          <span className={r.vencidas ? 'resumen-ficha-alerta' : ''}>
            {r.vencidas > 0 && <AlertTriangle size={13} aria-hidden />}
            {proveedor ? 'Le debes' : 'Debe'} <strong>{formatCurrency(r.pendiente)}</strong> en {r.facturasPendientes} {r.facturasPendientes === 1 ? 'factura' : 'facturas'}
            {r.vencidas > 0 && <> · <strong>{r.vencidas} vencida{r.vencidas === 1 ? '' : 's'}</strong> ({formatCurrency(r.importeVencido)})</>}
          </span>
        ) : (
          <span>{proveedor ? 'No le debes nada' : 'No debe nada'}</span>
        )}
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
