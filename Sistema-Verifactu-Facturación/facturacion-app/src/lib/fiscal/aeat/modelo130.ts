/**
 * MODELO 130 — Pago fraccionado del IRPF (estimación directa)
 *
 * Lo presenta el empresario o profesional **persona física** en
 * estimación directa (normal o simplificada). Una sociedad no lo
 * presenta: paga por el Impuesto sobre Sociedades.
 *
 * EL 130 ES ACUMULADO, NO TRIMESTRAL
 * ----------------------------------
 * Es el error más habitual al montarlo. La casilla 01 no son los
 * ingresos del trimestre: son los ingresos desde el **1 de enero** hasta
 * el último día del trimestre que se declara. Sobre ese acumulado se
 * calcula el 20 % y después se restan los pagos ya hechos en los
 * trimestres anteriores del mismo año. Calcularlo trimestre a trimestre
 * da un resultado distinto en cuanto haya un trimestre en pérdidas.
 *
 * PRESENTACIÓN
 * ------------
 * La AEAT NO publica diseño de registro para el 130 (no figura en el
 * índice de diseños de los modelos 100-199): se presenta por formulario
 * en la Sede. Aquí se calcula, se valida y se prepara el detalle para
 * copiar las casillas; no se genera fichero.
 */

import type { Invoice, Gasto, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { facturaCuenta, redondear } from '../FiscalCalculationService';
import { importeRetencion } from '../../retenciones';

/** El porcentaje del pago fraccionado en estimación directa. */
export const PORCENTAJE_130 = 20;

export interface Resultado130 {
  periodo: PeriodoFiscal;
  /** [01] Ingresos acumulados desde el 1 de enero. */
  ingresos: number;
  /** [02] Gastos deducibles acumulados. */
  gastos: number;
  /** [03] Rendimiento neto = [01] − [02]. */
  rendimientoNeto: number;
  /** [04] El 20 % del rendimiento neto, si es positivo. */
  pagoFraccionado: number;
  /** [05] Pagos fraccionados de trimestres anteriores del mismo año. */
  pagosAnteriores: number;
  /** [06] Retenciones que nos han practicado en el acumulado. */
  retenciones: number;
  /** [07] Resultado a ingresar. */
  resultado: number;
  numFacturas: number;
  numGastos: number;
  /** Hasta qué fecha se ha acumulado, para enseñarlo en pantalla. */
  hasta: string;
}

export interface DatosModelo130 {
  facturas: Invoice[];
  gastos: Gasto[];
  /** Suma de las casillas [07] de los 130 ya presentados este año. */
  pagosAnteriores?: number;
}

/** Último día del trimestre: el 130 acumula hasta aquí. */
function finDeTrimestre(ejercicio: number, trimestre: Trimestre): string {
  const ultimoMes = trimestre * 3;
  const ultimoDia = new Date(Date.UTC(ejercicio, ultimoMes, 0)).getUTCDate();
  return `${ejercicio}-${String(ultimoMes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}

export function calcularModelo130(datos: DatosModelo130, periodo: PeriodoFiscal): Resultado130 {
  const trimestre = (periodo.trimestre ?? 4) as Trimestre;
  const desde = `${periodo.ejercicio}-01-01`;
  const hasta = finDeTrimestre(periodo.ejercicio, trimestre);

  const dentro = (fecha?: string) => !!fecha && fecha >= desde && fecha <= hasta;

  const emitidas = datos.facturas.filter(
    f => facturaCuenta(f) && f.sentido !== 'compra' && dentro(f.issueDate),
  );
  const gastosPeriodo = datos.gastos.filter(g => dentro(g.fecha) && g.deducible !== false);

  // El rendimiento va por BASE imponible: el IVA/IGIC repercutido no es
  // ingreso del empresario, es dinero de Hacienda que pasa por su cuenta.
  const ingresos = redondear(emitidas.reduce((s, f) => s + f.subtotal, 0));
  const gastos = redondear(gastosPeriodo.reduce((s, g) => s + (g.baseImponible || 0), 0));
  const rendimientoNeto = redondear(ingresos - gastos);

  // Si el acumulado es negativo no hay pago fraccionado: no se ingresa a
  // cuenta de un beneficio que todavía no existe.
  const pagoFraccionado = rendimientoNeto > 0
    ? redondear(rendimientoNeto * (PORCENTAJE_130 / 100))
    : 0;

  // Las retenciones que nos han practicado los clientes ya son dinero
  // adelantado a Hacienda: se descuentan del pago fraccionado.
  const retenciones = redondear(
    emitidas.reduce((s, f) => s + importeRetencion(f.subtotal, f.retencionPct), 0),
  );

  const pagosAnteriores = redondear(datos.pagosAnteriores || 0);
  const resultado = redondear(pagoFraccionado - pagosAnteriores - retenciones);

  return {
    periodo: { ...periodo, trimestre },
    ingresos,
    gastos,
    rendimientoNeto,
    pagoFraccionado,
    pagosAnteriores,
    retenciones,
    resultado,
    numFacturas: emitidas.length,
    numGastos: gastosPeriodo.length,
    hasta,
  };
}

export function validarModelo130(
  r: Resultado130,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'regimenIrpf'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  // Comprobar que el modelo le corresponde al usuario ANTES de dejarle
  // presentarlo: presentar un 130 estando en módulos es presentar el
  // modelo equivocado, y es un error, no un detalle.
  if (!empresa?.regimenIrpf) {
    errores.push({
      gravedad: 'critico', campo: 'regimen_irpf',
      mensaje: 'No está configurado el régimen de IRPF. Sin saberlo no se puede afirmar que te corresponda el modelo 130.',
      referencia: refEmpresa,
    });
  } else if (empresa.regimenIrpf === 'objetiva') {
    errores.push({
      gravedad: 'critico', campo: 'regimen_irpf',
      mensaje: 'La empresa está en estimación objetiva (módulos): le corresponde el modelo 131, no el 130.',
      referencia: refEmpresa,
    });
  } else if (empresa.regimenIrpf === 'no_aplica') {
    errores.push({
      gravedad: 'critico', campo: 'regimen_irpf',
      mensaje: 'El régimen configurado no tributa por IRPF (sociedad): el 130 no le corresponde.',
      referencia: refEmpresa,
    });
  }

  if (!empresa?.nif) {
    errores.push({
      gravedad: 'critico', campo: 'nif',
      mensaje: 'La empresa no tiene NIF configurado.',
      referencia: refEmpresa,
    });
  }
  if (!r.periodo.trimestre) {
    errores.push({
      gravedad: 'critico', campo: 'periodo',
      mensaje: 'El modelo 130 es trimestral: hay que elegir un trimestre.',
    });
  }

  const esperado = r.rendimientoNeto > 0
    ? redondear(r.rendimientoNeto * (PORCENTAJE_130 / 100))
    : 0;
  if (Math.abs(esperado - r.pagoFraccionado) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre',
      mensaje: `La casilla [04] no es el ${PORCENTAJE_130}% del rendimiento neto.`,
    });
  }

  if (r.numGastos === 0 && r.numFacturas > 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_gastos',
      mensaje: 'No hay gastos registrados en el acumulado del año: el rendimiento neto sale igual a los ingresos y el pago fraccionado será el máximo.',
    });
  }
  if (r.rendimientoNeto < 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'rendimiento_negativo',
      mensaje: `Rendimiento neto acumulado negativo (${r.rendimientoNeto} €): no hay pago fraccionado, pero el modelo se presenta igualmente.`,
    });
  }
  if (r.resultado < 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'resultado',
      mensaje: `Resultado negativo (${r.resultado} €): no se ingresa nada este trimestre.`,
    });
  }
  if (r.periodo.trimestre && r.periodo.trimestre > 1 && r.pagosAnteriores === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'pagos_anteriores',
      mensaje: `Estás en el ${r.periodo.trimestre}T y la casilla [05] está a cero. El 130 es acumulado: si presentaste trimestres anteriores, hay que restar lo ya pagado.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

/** Las casillas del 130, listas para copiar al formulario de la Sede. */
export function casillas130(r: Resultado130): { casilla: string; concepto: string; importe: number }[] {
  return [
    { casilla: '01', concepto: 'Ingresos computables acumulados', importe: r.ingresos },
    { casilla: '02', concepto: 'Gastos fiscalmente deducibles acumulados', importe: r.gastos },
    { casilla: '03', concepto: 'Rendimiento neto ([01] − [02])', importe: r.rendimientoNeto },
    { casilla: '04', concepto: `${PORCENTAJE_130}% del rendimiento neto`, importe: r.pagoFraccionado },
    { casilla: '05', concepto: 'Pagos fraccionados de trimestres anteriores', importe: r.pagosAnteriores },
    { casilla: '06', concepto: 'Retenciones soportadas', importe: r.retenciones },
    { casilla: '07', concepto: 'Resultado a ingresar', importe: r.resultado },
  ];
}
