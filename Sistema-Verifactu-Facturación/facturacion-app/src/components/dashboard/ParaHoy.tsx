'use client';

import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, FileCheck2, FilePen, FilePlus2, Landmark, Plus, type LucideIcon,
} from 'lucide-react';
import type { TareaHoy } from '@/lib/panelHoy';
import { formatCurrency } from '@/lib/utils';

export interface ParaHoyProps {
  readonly tareas: readonly TareaHoy[];
  /** Aún no hay ni un documento: en vez de «todo al día», el primer paso. */
  readonly sinDocumentos?: boolean;
}

const ICONO: Record<string, LucideIcon> = {
  vencidas: AlertTriangle,
  trimestre: Landmark,
  'fe-pago': FileCheck2,
  'fe-decidir': FileCheck2,
  vencen: CalendarClock,
  borradores: FilePen,
  regimen: Landmark,
};

/** Lo que toca hacer, de lo más urgente a lo menos. Cada fila lleva a donde se resuelve. */
export default function ParaHoy({ tareas, sinDocumentos = false }: ParaHoyProps) {
  return (
    <section className="para-hoy" aria-labelledby="para-hoy-titulo">
      <div className="para-hoy-cabecera">
        <h2 id="para-hoy-titulo" className="para-hoy-titulo">Para hoy</h2>
        {tareas.length > 0 && <span className="para-hoy-cuenta">{tareas.length}</span>}
      </div>

      {tareas.length === 0 && sinDocumentos ? (
        <div className="para-hoy-vacio es-inicio">
          <FilePlus2 size={20} aria-hidden="true" />
          <div>
            <p className="para-hoy-vacio-titulo">Empieza por tu primera factura</p>
            <p className="para-hoy-vacio-texto">En cuanto emitas, aquí irá saliendo lo que haya que cobrar, presentar o revisar cada día.</p>
          </div>
          <Link href="/facturas/nueva" className="btn btn-primary btn-sm"><Plus size={14} /> Crear factura</Link>
        </div>
      ) : tareas.length === 0 ? (
        <div className="para-hoy-vacio">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <p className="para-hoy-vacio-titulo">Todo al día</p>
            <p className="para-hoy-vacio-texto">Nada vencido, ningún plazo cerca y ningún borrador esperando.</p>
          </div>
        </div>
      ) : (
        <ul className="para-hoy-lista">
          {tareas.map((t, i) => {
            const Icono = ICONO[t.id] ?? AlertTriangle;
            return (
              <li key={t.id} style={{ '--i': i } as React.CSSProperties}>
                <Link href={t.href} className={`para-hoy-fila is-${t.tono}`}>
                  <span className="para-hoy-icono" aria-hidden="true"><Icono size={16} /></span>
                  <span className="para-hoy-texto">
                    <span className="para-hoy-fila-titulo">{t.titulo}</span>
                    <span className="para-hoy-fila-detalle">{t.detalle}</span>
                  </span>
                  {t.importe != null && <span className="para-hoy-importe">{formatCurrency(t.importe)}</span>}
                  <span className="para-hoy-accion">
                    <span>{t.accion}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
