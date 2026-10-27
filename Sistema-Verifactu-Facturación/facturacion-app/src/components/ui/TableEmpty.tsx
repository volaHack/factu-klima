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
 * El icono va dentro de un pequeño dibujo (dos aros que se trazan al
 * llegar y unas chispas que titilan): una lista vacía es lo primero que
 * ve quien estrena la app y no debería parecer un error. Todo es CSS sobre
 * un SVG en línea, sin imágenes que cargar; ver «ESTADO VACÍO» en
 * estilos/listas.css.
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
    <tr className="fila-vacia">
      <td colSpan={colSpan} className="table-empty">
        <div>
          <span className="vacio-dibujo" aria-hidden="true">
            <svg className="vacio-aros" viewBox="0 0 96 96" fill="none">
              <circle className="vacio-aro vacio-aro--fuera" cx="48" cy="48" r="45" />
              <circle className="vacio-aro vacio-aro--dentro" cx="48" cy="48" r="34" pathLength={100} />
            </svg>
            <span className="vacio-chispa vacio-chispa--1" />
            <span className="vacio-chispa vacio-chispa--2" />
            <span className="vacio-chispa vacio-chispa--3" />
            <span className="table-empty-icon"><Icon strokeWidth={1.6} /></span>
          </span>
          <p className="table-empty-title">{title}</p>
          {hint && <p className="table-empty-hint">{hint}</p>}
          {action}
        </div>
      </td>
    </tr>
  );
}
