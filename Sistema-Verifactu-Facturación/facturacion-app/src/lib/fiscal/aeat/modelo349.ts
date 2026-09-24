/**
 * MODELO 349 — Declaración recapitulativa de operaciones intracomunitarias
 *
 * La agrupación por operador y clave (E, A, T, S, I) ya existe en
 * `lib/intracomunitarias.ts` y es la que usa la pantalla de
 * Intracomunitarias: aquí se reutiliza tal cual para que las dos pantallas
 * den la misma cifra. Lo que se añade es la validación con el formato del
 * motor de listados.
 */

import type { Invoice, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { generarDatos349, validarVatNumber, type Datos349 } from '../../intracomunitarias';
import { isValidNif } from '../../validation/nif';

export type Resultado349 = Datos349;

export function calcularModelo349(datos: { facturas: Invoice[] }, periodo: PeriodoFiscal): Resultado349 {
  const t = (periodo.trimestre ?? 1) as Trimestre;
  return generarDatos349(datos.facturas, periodo.ejercicio, `${t}T`);
}

export function validarModelo349(
  r: Resultado349,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'igicEnabled'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({ gravedad: 'critico', campo: 'nif', mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido.`, referencia: refEmpresa });
  }
  if (empresa?.igicEnabled) {
    avisos.push({ gravedad: 'aviso', campo: 'regimen', mensaje: 'Canarias no forma parte del territorio IVA de la UE: revisa con tu gestoría si te corresponde el 349.' });
  }
  for (const op of r.operaciones) {
    const v = validarVatNumber(`${op.codigoPais}${op.vatNumber}`);
    if (!v.valido) {
      errores.push({
        gravedad: 'critico', campo: 'vat',
        mensaje: `${op.nombreRazon}: el NIF-IVA ${op.codigoPais}${op.vatNumber} no tiene un formato válido${v.error ? ` (${v.error})` : ''}.`,
      });
    }
  }
  if (r.totalOperaciones === 0) {
    avisos.push({ gravedad: 'aviso', campo: 'sin_datos', mensaje: 'No hay operaciones intracomunitarias en el trimestre: el 349 sólo se presenta si las hay.' });
  }
  return { valido: errores.length === 0, errores, avisos };
}

export function exportarCsv349(r: Resultado349): string {
  const filas: string[][] = [
    ['Modelo 349 — Operaciones intracomunitarias', `${r.periodo} ${r.ejercicio}`],
    [],
    ['País', 'NIF-IVA', 'Operador', 'Clave', 'Base imponible'],
    ...r.operaciones.map(o => [o.codigoPais, o.vatNumber, o.nombreRazon, o.claveOperacion, o.baseImponible.toFixed(2)]),
    [],
    ['Total', '', `${r.totalOperaciones} operadores`, '', r.totalBaseImponible.toFixed(2)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
