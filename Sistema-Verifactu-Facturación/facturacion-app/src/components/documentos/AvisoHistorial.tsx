'use client';

/**
 * En Facturas y en Albaranes solo están los documentos hechos en Klima.
 * Quien llega de ISECAN busca allí los de antes y no los ve: esta línea
 * le dice cuántos hay y le lleva a Documentos, donde están (solo consulta).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { NOMBRE_ORIGEN, contarHistorico } from '@/lib/historico';

const PALABRAS = {
  factura: ['factura', 'facturas'],
  albaran: ['albarán', 'albaranes'],
} as const;

export default function AvisoHistorial({ tipo }: { tipo: keyof typeof PALABRAS }) {
  const [hay, setHay] = useState<{ origen: string; total: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    contarHistorico(tipo).then(r => { if (vivo) setHay(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [tipo]);

  if (!hay) return null;
  const origen = NOMBRE_ORIGEN[hay.origen] ?? 'el programa anterior';
  const [una, varias] = PALABRAS[tipo];
  return (
    <Link href={`/documentos?origen=historico&tipo=${tipo}`} className="aviso-historial">
      <History size={18} aria-hidden="true" />
      <span>
        <strong>{hay.total.toLocaleString('es-ES')} {hay.total === 1 ? una : varias}</strong> de {origen}{' '}
        {hay.total === 1 ? 'está' : 'están'} en Documentos, de solo consulta.
      </span>
      <span className="aviso-historial-ir">Ver</span>
    </Link>
  );
}
