import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

/**
 * UNA VARIACIÓN, SIEMPRE ESCRITA IGUAL
 *
 * El panel contaba subidas y bajadas de tres maneras: «−16,8 %» con una
 * flecha de tendencia en las cifras, «+2200 %» y «-88 %» (con guion, no
 * con signo menos) en los productos en movimiento, y «+12 %» suelto en el
 * análisis. Aquí se escriben todas igual: signo de verdad (+ o −), miles
 * con punto, coma decimal, espacio fino antes del %, flecha y un fondo
 * tenue del color de lo que dice. El color nunca va solo: el signo y la
 * flecha dicen lo mismo para quien no lo distingue.
 */

/** «+2.200 %», «−16,8 %». Sin decimales si no los pide. */
export function textoDelta(porcentaje: number, decimales = 0): string {
  const signo = porcentaje > 0 ? '+' : porcentaje < 0 ? '−' : '';
  const cifra = Math.abs(porcentaje).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${signo}${cifra} %`;
}

export default function Delta({ porcentaje, decimales = 0, titulo, invertido = false }: {
  porcentaje: number;
  decimales?: number;
  /** Lo que se compara, para el lector de pantalla y al pasar el ratón. */
  titulo?: string;
  /** Para lo que mejora al bajar (gastos, días de cobro): verde hacia abajo. */
  invertido?: boolean;
}) {
  const sube = porcentaje >= 0;
  const bien = invertido ? !sube : sube;
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${bien ? 'is-bien' : 'is-mal'}`} title={titulo}>
      <Flecha size={12} strokeWidth={2.4} aria-hidden="true" />
      {textoDelta(porcentaje, decimales)}
    </span>
  );
}

/** Lo que no es un porcentaje («Nuevo», «Sin ventas») con la misma forma. */
export function DeltaTexto({ texto, tono }: { texto: string; tono: 'bien' | 'mal' }) {
  return <span className={`delta is-${tono}`}>{texto}</span>;
}
