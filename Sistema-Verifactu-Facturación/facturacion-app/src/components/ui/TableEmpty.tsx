import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Fila de "aquí todavía no hay nada".
 *
 * Antes cada tabla resolvía esto con `<td colSpan={8}>No se encontraron
 * facturas</td>`: una frase de sistema, en gris, sin decir por qué está
 * vacío ni qué hacer a continuación. Hay dos situaciones distintas y
 * conviene no confundirlas:
 *
 *  - No hay NADA todavía (catálogo recién estrenado) → invitación a crear.
 *  - Hay datos pero el filtro no encuentra nada → invitación a aflojar el
 *    filtro, nunca a crear un registro que no hace falta.
 *
 * `colSpan` debe coincidir con el número de columnas de la tabla o la
 * celda rompe la rejilla.
 */
export default function TableEmpty({
  colSpan,
  icon: Icon,
  title,
  hint,
  action,
}: {
  colSpan: number;
  icon: LucideIcon;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="table-empty">
        <div>
          <span className="table-empty-icon" aria-hidden="true"><Icon strokeWidth={1.6} /></span>
          <p className="table-empty-title">{title}</p>
          {hint && <p className="table-empty-hint">{hint}</p>}
          {action}
        </div>
      </td>
    </tr>
  );
}
