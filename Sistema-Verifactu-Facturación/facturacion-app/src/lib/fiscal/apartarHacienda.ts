/**
 * LO QUE HAY QUE APARTAR PARA HACIENDA ESTE TRIMESTRE
 *
 * El susto de cada trimestre es el mismo: el dinero del IVA ha entrado en
 * la cuenta, se ha gastado como si fuera propio y el día 20 hay que
 * pagarlo. Esta cuenta dice, al día, cuánto de lo que tienes no es tuyo.
 *
 * No inventa nada: son los mismos cálculos que los modelos de Listados
 * fiscales (303 o 420 con IGIC, y el 130 si es un autónomo), aplicados al
 * trimestre en curso con lo emitido y los gastos apuntados hasta hoy. Es
 * una ESTIMACIÓN: lo que falte por apuntar no está, y el 130 supone que los
 * trimestres anteriores se pagaron por lo que salía.
 *
 * Una sociedad no hace 130 (hace el 202 del Impuesto sobre Sociedades, que
 * depende del cierre y aquí no se estima): para ella sólo sale el IVA.
 */

import type { Gasto, Invoice } from '@/lib/types';
import { calcularModelo303 } from './aeat/modelo303';
import { calcularModelo130 } from './aeat/modelo130';
import { calcularModelo420 } from './atc/modelo420';
import type { Trimestre } from './tipos';

export interface ConceptoHacienda {
  modelo: '303' | '420' | '130';
  nombre: string;
  /** Resultado del modelo: positivo, a pagar; negativo, a compensar o devolver. */
  importe: number;
}

export interface ApartarHacienda {
  ejercicio: number;
  trimestre: Trimestre;
  /** Último día para presentar y pagar (ISO, AAAA-MM-DD). */
  plazo: string;
  diasParaPlazo: number;
  conceptos: ConceptoHacienda[];
  /** Lo que conviene tener apartado: la suma de lo que sale a pagar. */
  total: number;
}

/** DNI o NIE: persona física (autónomo). */
const PERSONA_FISICA = /^([0-9]{8}|[KLMXYZ][0-9]{7})[A-Z]$/;

export const esAutonomo = (nif?: string | null) => PERSONA_FISICA.test((nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

const r2 = (n: number) => Math.round(n * 100) / 100;
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Plazo de presentación de los modelos trimestrales: del 1 al 20 del mes
 * siguiente, y el del 4.º trimestre hasta el 30 de enero. Si el último día
 * cae en sábado o domingo, pasa al lunes. (Los festivos nacionales no se
 * mueven aquí: si coincide, el plazo real es un día más, nunca menos.)
 */
export function plazoDelTrimestre(ejercicio: number, trimestre: Trimestre): Date {
  const d = trimestre === 4 ? new Date(ejercicio + 1, 0, 30) : new Date(ejercicio, trimestre * 3, 20);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function trimestreDe(fecha: Date): Trimestre {
  return (Math.floor(fecha.getMonth() / 3) + 1) as Trimestre;
}

export function apartarParaHacienda(
  { facturas, gastos, nif, igic }: { facturas: Invoice[]; gastos: Gasto[]; nif?: string | null; igic?: boolean },
  hoy: Date = new Date(),
): ApartarHacienda {
  const ejercicio = hoy.getFullYear();
  const trimestre = trimestreDe(hoy);
  const periodo = { ejercicio, trimestre };
  const delAno = facturas.filter(f => f.issueDate?.slice(0, 4) === String(ejercicio));
  const gastosDelAno = gastos.filter(g => g.fecha?.slice(0, 4) === String(ejercicio));

  const conceptos: ConceptoHacienda[] = [];
  if (igic) {
    const r = calcularModelo420({ facturas: delAno, gastos: gastosDelAno }, periodo);
    conceptos.push({ modelo: '420', nombre: 'IGIC', importe: r2(r.resultado) });
  } else {
    const r = calcularModelo303({ facturas: delAno, gastos: gastosDelAno }, periodo);
    conceptos.push({ modelo: '303', nombre: 'IVA', importe: r2(r.resultadoLiquidacion) });
  }

  if (esAutonomo(nif)) {
    // El 130 es acumulado del año: se descuenta lo que salió a pagar en los
    // trimestres anteriores (se supone pagado, que es lo normal).
    let pagado = 0;
    for (let t = 1 as Trimestre; t < trimestre; t = (t + 1) as Trimestre) {
      const previo = calcularModelo130({ facturas: delAno, gastos: gastosDelAno, pagosAnteriores: pagado }, { ejercicio, trimestre: t });
      pagado = r2(pagado + Math.max(0, previo.resultado));
    }
    const r = calcularModelo130({ facturas: delAno, gastos: gastosDelAno, pagosAnteriores: pagado }, periodo);
    conceptos.push({ modelo: '130', nombre: 'IRPF (pago a cuenta)', importe: r2(Math.max(0, r.resultado)) });
  }

  const plazo = plazoDelTrimestre(ejercicio, trimestre);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return {
    ejercicio,
    trimestre,
    plazo: isoDia(plazo),
    diasParaPlazo: Math.round((plazo.getTime() - inicioHoy.getTime()) / 86_400_000),
    conceptos,
    total: r2(conceptos.reduce((s, c) => s + Math.max(0, c.importe), 0)),
  };
}
