/**
 * Los periodos que se piden nueve de cada diez veces, para no teclear
 * fechas: hoy, este mes, el mes pasado, el trimestre (el de los modelos de
 * impuestos), el anterior, este año y el pasado.
 */

const d = (a: number, m: number, dia: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const ultimoDia = (a: number, m: number) => new Date(a, m + 1, 0).getDate();

export interface Periodo { id: string; etiqueta: string; desde: string; hasta: string }

export function periodosRapidos(hoy = new Date()): Periodo[] {
  const a = hoy.getFullYear(); const m = hoy.getMonth(); const dia = hoy.getDate();
  const mp = m === 0 ? 11 : m - 1; const ap = m === 0 ? a - 1 : a;
  const t = Math.floor(m / 3);
  const tp = t === 0 ? 3 : t - 1; const atp = t === 0 ? a - 1 : a;
  return [
    { id: 'hoy', etiqueta: 'Hoy', desde: d(a, m, dia), hasta: d(a, m, dia) },
    { id: 'mes', etiqueta: 'Este mes', desde: d(a, m, 1), hasta: d(a, m, ultimoDia(a, m)) },
    { id: 'mes_pasado', etiqueta: 'Mes pasado', desde: d(ap, mp, 1), hasta: d(ap, mp, ultimoDia(ap, mp)) },
    { id: 'trimestre', etiqueta: `${t + 1}.º trimestre`, desde: d(a, t * 3, 1), hasta: d(a, t * 3 + 2, ultimoDia(a, t * 3 + 2)) },
    { id: 'trimestre_pasado', etiqueta: `${tp + 1}.º trim. ${atp !== a ? atp : ''}`.trim(), desde: d(atp, tp * 3, 1), hasta: d(atp, tp * 3 + 2, ultimoDia(atp, tp * 3 + 2)) },
    { id: 'anio', etiqueta: `Año ${a}`, desde: d(a, 0, 1), hasta: d(a, 11, 31) },
    { id: 'anio_pasado', etiqueta: `Año ${a - 1}`, desde: d(a - 1, 0, 1), hasta: d(a - 1, 11, 31) },
  ];
}
