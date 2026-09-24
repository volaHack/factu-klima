/**
 * EL PLAN DE CUENTAS
 *
 * Las cuentas del Plan General de Contabilidad de PYMES (RD 1515/2007) que
 * mueve un negocio que factura, compra, gasta, cobra y paga. Subcuentas de
 * 8 cifras, que es lo que usan A3, ContaPlus o Sage y lo que espera recibir
 * una gestoría: la cuenta del PGC rellena con ceros y, al final, lo que la
 * distingue (el tipo de IVA, el número de cliente…).
 *
 * No están todas las del PGC, sólo las que el programa puede generar a
 * partir de sus datos. Inventar saldos para cuentas de las que no sabe nada
 * (amortizaciones, préstamos, nóminas con su Seguridad Social) sería peor
 * que dejarlas fuera.
 */

/** A qué estado va cada cuenta. */
export type Masa =
  | 'patrimonio_neto' | 'activo_no_corriente' | 'activo_corriente' | 'pasivo_corriente'
  | 'ingreso' | 'gasto';

export interface Cuenta {
  codigo: string;
  nombre: string;
  masa: Masa;
}

const PAD = 8;

/** «430» + 12 → «43000012». */
export function subcuenta(raiz: string, n: number | string): string {
  const cola = String(n);
  return raiz + cola.padStart(PAD - raiz.length, '0');
}

/** El grupo del PGC (el primer dígito). */
export const grupo = (codigo: string) => Number(codigo[0]);

export function masaDe(codigo: string): Masa {
  const g = grupo(codigo);
  if (g === 1) return 'patrimonio_neto';
  if (g === 2) return 'activo_no_corriente';
  if (g === 6) return 'gasto';
  if (g === 7) return 'ingreso';
  // Grupo 4: deudores al activo, acreedores al pasivo.
  if (g === 4) {
    const r = codigo.slice(0, 3);
    if (['430', '431', '438', '440', '460', '470', '471', '472', '473'].includes(r)) return 'activo_corriente';
    return 'pasivo_corriente';
  }
  return 'activo_corriente'; // 3 existencias, 5 tesorería
}

/** Las cuentas fijas (sin tercero ni tipo). */
export const CUENTAS = {
  resultado: '12900000',
  remanente: '12000000',
  inmovilizado: '21900000',
  compras: '60000000',
  otrosAprovisionamientos: '60200000',
  devolucionesCompras: '60800000',
  arrendamientos: '62100000',
  seguros: '62500000',
  suministros: '62800000',
  otrosServicios: '62900000',
  tributos: '63100000',
  sueldos: '64000000',
  ventasMercaderias: '70000000',
  prestacionServicios: '70500000',
  devolucionesVentas: '70800000',
  retencionesSoportadas: '47300000',
  retencionesPracticadas: '47510000',
  caja: '57000000',
  bancos: '57200000',
  clientesVarios: '43000000',
  acreedoresVarios: '41000000',
} as const;

const NOMBRES_FIJOS: Record<string, string> = {
  [CUENTAS.resultado]: 'Resultado del ejercicio',
  [CUENTAS.remanente]: 'Remanente (resultados de ejercicios anteriores)',
  [CUENTAS.inmovilizado]: 'Otro inmovilizado material',
  [CUENTAS.compras]: 'Compras de mercaderías',
  [CUENTAS.otrosAprovisionamientos]: 'Compras de otros aprovisionamientos',
  [CUENTAS.devolucionesCompras]: 'Devoluciones de compras',
  [CUENTAS.arrendamientos]: 'Arrendamientos y cánones',
  [CUENTAS.seguros]: 'Primas de seguros',
  [CUENTAS.suministros]: 'Suministros',
  [CUENTAS.otrosServicios]: 'Otros servicios',
  [CUENTAS.tributos]: 'Otros tributos',
  [CUENTAS.sueldos]: 'Sueldos y salarios',
  [CUENTAS.ventasMercaderias]: 'Ventas de mercaderías',
  [CUENTAS.prestacionServicios]: 'Prestaciones de servicios',
  [CUENTAS.devolucionesVentas]: 'Devoluciones de ventas',
  [CUENTAS.retencionesSoportadas]: 'H.P., retenciones y pagos a cuenta',
  [CUENTAS.retencionesPracticadas]: 'H.P., acreedora por retenciones practicadas',
  [CUENTAS.caja]: 'Caja, euros',
  [CUENTAS.bancos]: 'Bancos c/c',
  [CUENTAS.clientesVarios]: 'Clientes varios (sin ficha)',
  [CUENTAS.acreedoresVarios]: 'Acreedores varios',
};

/** Impuesto indirecto de la empresa: cambia el nombre de las cuentas 472/477. */
export type Impuesto = 'IVA' | 'IGIC';

/** «47200021» = H.P. IVA soportado al 21 %. Se admiten tipos con decimales (5,2 → 0052). */
export function cuentaImpuesto(raiz: '472' | '477', tipo: number): string {
  const t = Math.round(Math.abs(tipo) * 10);
  // 21 % → «0210» sería confuso: los enteros van sin decimal (0021) y los
  // tipos con decimal (5,2 %, 1,4 %…) con una cifra más (5052 → «5,2»).
  const cola = Number.isInteger(Math.abs(tipo)) ? String(Math.abs(tipo)) : `5${String(t).padStart(3, '0')}`;
  return subcuenta(raiz, cola);
}

/** El nombre de cualquier cuenta que genere el motor. */
export function nombreDeCuenta(codigo: string, impuesto: Impuesto, terceros: Map<string, string>): string {
  if (NOMBRES_FIJOS[codigo]) return NOMBRES_FIJOS[codigo];
  if (terceros.has(codigo)) return terceros.get(codigo)!;
  const raiz = codigo.slice(0, 3);
  if (raiz === '472' || raiz === '477') {
    const cola = codigo.slice(3).replace(/^0+/, '');
    const tipo = cola.startsWith('5') && cola.length === 4 ? `${Number(cola.slice(1)) / 10}` : cola || '0';
    const lado = raiz === '472' ? 'soportado' : 'repercutido';
    return `H.P. ${impuesto} ${lado} ${String(tipo).replace('.', ',')} %`;
  }
  if (raiz === '430') return 'Cliente';
  if (raiz === '400') return 'Proveedor';
  if (raiz === '410') return 'Acreedor';
  return 'Cuenta ' + codigo;
}
