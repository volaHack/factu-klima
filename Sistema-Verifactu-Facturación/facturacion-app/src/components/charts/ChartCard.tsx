'use client';

import { useState, type ReactNode } from 'react';
import { Table2, ChartColumnBig, Inbox } from 'lucide-react';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: (value: unknown) => string;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Altura del área de dibujo, ya incluyendo la banda del eje X. */
  height?: number;
  /** Si está vacío se muestra el estado vacío en vez de un lienzo en blanco. */
  isEmpty?: boolean;
  emptyLabel?: string;
  emptyHint?: ReactNode;
  /** Gemela accesible del gráfico: los mismos datos en tabla. */
  tableColumns?: TableColumn[];
  tableRows?: Record<string, unknown>[];
  action?: ReactNode;
  /** Leyenda propia, bajo el gráfico. */
  legend?: ReactNode;
  children: ReactNode;
}

/**
 * Contenedor común de todos los gráficos.
 *
 * Resuelve tres cosas que antes fallaban:
 *  1. Sin datos se ve un mensaje, no una tarjeta vacía que parece rota.
 *  2. El alto es explícito y contiene ya el eje X, así que Recharts nunca
 *     mide 0px ni recorta las etiquetas inferiores.
 *  3. Todo gráfico tiene su vista en tabla, para que ningún valor dependa
 *     únicamente del color o del tooltip.
 */
export default function ChartCard({
  title,
  subtitle,
  height = 300,
  isEmpty = false,
  emptyLabel = 'Todavía no hay datos que mostrar',
  emptyHint,
  tableColumns,
  tableRows,
  action,
  legend,
  children,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const canToggle = Boolean(tableColumns?.length && tableRows?.length);

  return (
    <section className="chart-card">
      <header className="chart-header">
        <div className="chart-heading">
          <h3 className="chart-title">{title}</h3>
          {subtitle && <p className="chart-subtitle">{subtitle}</p>}
        </div>
        <div className="chart-actions">
          {action}
          {canToggle && !isEmpty && (
            <button
              type="button"
              className="chart-toggle"
              onClick={() => setAsTable(v => !v)}
              aria-pressed={asTable}
              title={asTable ? 'Ver como gráfico' : 'Ver como tabla'}
            >
              {asTable ? <ChartColumnBig size={14} /> : <Table2 size={14} />}
              <span>{asTable ? 'Gráfico' : 'Tabla'}</span>
            </button>
          )}
        </div>
      </header>

      {isEmpty ? (
        <div className="chart-empty" style={{ minHeight: height }}>
          <Inbox size={26} strokeWidth={1.5} />
          <p className="chart-empty-label">{emptyLabel}</p>
          {emptyHint && <div className="chart-empty-hint">{emptyHint}</div>}
        </div>
      ) : asTable ? (
        <div className="chart-table-wrap" style={{ maxHeight: height + 40 }}>
          <table className="table chart-table">
            <thead>
              <tr>
                {tableColumns!.map(c => (
                  <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows!.map((row, i) => (
                <tr key={i}>
                  {tableColumns!.map(c => (
                    <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                      {c.format ? c.format(row[c.key]) : String(row[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Alto fijo y NO flex: un contenedor flexible colapsa a 0px de
              ancho y Recharts deja de pintar. */}
          <div className="chart-plot" style={{ height }}>
            {children}
          </div>
          {legend}
        </>
      )}
    </section>
  );
}
