/**
 * MODELO 131 — Pago fraccionado del IRPF (estimación objetiva, «módulos»)
 *
 * POR QUÉ ESTE MODELO NO SE PUEDE CALCULAR SOLO CON LAS FACTURAS
 * -------------------------------------------------------------
 * En módulos, el rendimiento NO sale de lo que has facturado. Sale de
 * unos signos, índices y módulos que fija cada año la Orden ministerial
 * de la actividad: personal empleado, superficie del local, potencia
 * eléctrica, mesas, vehículos, habitantes del municipio… Dos negocios que
 * facturen exactamente lo mismo pagan cantidades distintas si tienen un
 * empleado más o veinte metros cuadrados menos.
 *
 * Este programa no registra ninguno de esos módulos, así que **no se los
 * inventa**. Lo que hace:
 *
 *  - Calcula lo que SÍ sale de sus datos: los ingresos del período (para
 *    comprobar los límites de exclusión de módulos) y las retenciones
 *    soportadas, que se restan en la casilla correspondiente.
 *  - Pide el «rendimiento neto previo» que el usuario obtiene de su
 *    Orden de módulos, y a partir de ahí hace el resto de la
 *    liquidación.
 *
 * Así el modelo es útil sin mentir sobre de dónde sale cada número.
 *
 * PRESENTACIÓN
 * ------------
 * La AEAT no publica diseño de registro para el 131: formulario en la
 * Sede.
 */

import type { Invoice, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { enPeriodo, facturaCuenta, redondear } from '../FiscalCalculationService';
import { importeRetencion } from '../../retenciones';

/**
 * Porcentaje general del pago fraccionado en estimación objetiva para
 * actividades empresariales distintas de las agrícolas.
 */
export const PORCENTAJE_131 = 4;

/** Límite de ingresos que expulsa de módulos, para avisar a tiempo. */
export const LIMITE_MODULOS = 250000;

export interface Resultado131 {
  periodo: PeriodoFiscal;
  /**
   * Lo que el usuario toma de su Orden de módulos. Sin esto el modelo no
   * se puede liquidar, y el programa no lo puede deducir de las facturas.
   */
  rendimientoNetoPrevio: number | null;
  /** El % aplicable, configurable porque depende de la actividad. */
  porcentaje: number;
  /** Rendimiento × porcentaje. */
  pagoFraccionado: number;
  retenciones: number;
  resultado: number | null;
  /** Ingresos del trimestre, sólo informativos. */
  ingresosTrimestre: number;
  /** Ingresos del año, para vigilar el límite de exclusión. */
  ingresosAcumulados: number;
  numFacturas: number;
}

export interface DatosModelo131 {
  facturas: Invoice[];
  /** Lo que el usuario copia de su Orden de módulos. */
  rendimientoNetoPrevio?: number | null;
  porcentaje?: number;
}

export function calcularModelo131(datos: DatosModelo131, periodo: PeriodoFiscal): Resultado131 {
  const trimestre = (periodo.trimestre ?? 1) as Trimestre;
  const emitidasTrimestre = datos.facturas.filter(
    f => facturaCuenta(f) && f.sentido !== 'compra' && enPeriodo(f.issueDate, { ...periodo, trimestre }),
  );
  const emitidasAño = datos.facturas.filter(
    f => facturaCuenta(f) && f.sentido !== 'compra' && enPeriodo(f.issueDate, { ejercicio: periodo.ejercicio }),
  );

  const ingresosTrimestre = redondear(emitidasTrimestre.reduce((s, f) => s + f.subtotal, 0));
  const ingresosAcumulados = redondear(emitidasAño.reduce((s, f) => s + f.subtotal, 0));

  const retenciones = redondear(
    emitidasTrimestre.reduce((s, f) => s + importeRetencion(f.subtotal, f.retencionPct), 0),
  );

  const porcentaje = datos.porcentaje ?? PORCENTAJE_131;
  const rendimientoNetoPrevio =
    typeof datos.rendimientoNetoPrevio === 'number' ? datos.rendimientoNetoPrevio : null;

  const pagoFraccionado = rendimientoNetoPrevio === null
    ? 0
    : redondear(rendimientoNetoPrevio * (porcentaje / 100));

  return {
    periodo: { ...periodo, trimestre },
    rendimientoNetoPrevio,
    porcentaje,
    pagoFraccionado,
    retenciones,
    // Sin el rendimiento de módulos no hay resultado: se devuelve null
    // en vez de un cero que parecería un dato calculado.
    resultado: rendimientoNetoPrevio === null ? null : redondear(pagoFraccionado - retenciones),
    ingresosTrimestre,
    ingresosAcumulados,
    numFacturas: emitidasTrimestre.length,
  };
}

export function validarModelo131(
  r: Resultado131,
  empresa: Pick<CompanySettings, 'nif' | 'regimenIrpf' | 'epigrafeIae'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  if (!empresa?.regimenIrpf) {
    errores.push({
      gravedad: 'critico', campo: 'regimen_irpf',
      mensaje: 'No está configurado el régimen de IRPF. Sin saberlo no se puede afirmar que te corresponda el modelo 131.',
      referencia: refEmpresa,
    });
  } else if (empresa.regimenIrpf !== 'objetiva') {
    errores.push({
      gravedad: 'critico', campo: 'regimen_irpf',
      mensaje: 'La empresa no está en estimación objetiva: el 131 es el de módulos. En estimación directa le corresponde el 130.',
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

  if (r.rendimientoNetoPrevio === null) {
    errores.push({
      gravedad: 'critico', campo: 'rendimiento_modulos',
      mensaje: 'Falta el rendimiento neto previo de tu Orden de módulos. El programa no lo puede calcular desde las facturas: en estimación objetiva el rendimiento no depende de lo facturado.',
    });
  } else if (r.rendimientoNetoPrevio < 0) {
    errores.push({
      gravedad: 'critico', campo: 'rendimiento_modulos',
      mensaje: 'El rendimiento neto previo de módulos no puede ser negativo.',
    });
  }

  if (!empresa?.epigrafeIae) {
    avisos.push({
      gravedad: 'aviso', campo: 'epigrafe',
      mensaje: 'No hay epígrafe de IAE configurado. Es el que determina los módulos y el porcentaje aplicable.',
      referencia: refEmpresa,
    });
  }
  if (r.ingresosAcumulados > LIMITE_MODULOS) {
    avisos.push({
      gravedad: 'aviso', campo: 'limite_modulos',
      mensaje: `Llevas ${r.ingresosAcumulados.toLocaleString('es-ES')} € facturados este año y el límite general de módulos está en ${LIMITE_MODULOS.toLocaleString('es-ES')} €. Comprueba si sigues pudiendo estar en estimación objetiva.`,
    });
  }
  if (r.resultado !== null && r.resultado < 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'resultado',
      mensaje: `Resultado negativo (${r.resultado} €): no se ingresa nada este trimestre.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

export function casillas131(r: Resultado131): { casilla: string; concepto: string; importe: number | null }[] {
  return [
    { casilla: '01', concepto: 'Rendimiento neto previo (de tu Orden de módulos)', importe: r.rendimientoNetoPrevio },
    { casilla: '03', concepto: `Pago fraccionado (${r.porcentaje}% del rendimiento)`, importe: r.pagoFraccionado },
    { casilla: '10', concepto: 'Retenciones soportadas en el trimestre', importe: r.retenciones },
    { casilla: '12', concepto: 'Resultado a ingresar', importe: r.resultado },
  ];
}
