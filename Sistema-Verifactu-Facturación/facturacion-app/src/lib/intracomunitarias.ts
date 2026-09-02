/**
 * OPERACIONES INTRACOMUNITARIAS + MODELO 349
 *
 * Ventas y compras a otros países de la Unión Europea. La empresa española
 * factura sin IVA (inversión del sujeto pasivo) y declara la operación
 * trimestralmente en el Modelo 349.
 *
 * Este módulo:
 * 1. Detecta automáticamente si una operación es intracomunitaria por el
 *    país del cliente y la presencia de VAT Number.
 * 2. Clasifica cada operación para el Modelo 349 (E/A/T/S/I).
 * 3. Agrupa los datos para el informe y la generación del fichero BOE.
 * 4. Valida el formato del NIF-IVA (VAT Number) por país.
 */

import type { Invoice, Client, CompanySettings } from './types';
import { PAISES_UE, esPaisUeNoEspana, esTerritorioNoIva } from './constants';

// ============================================================
// TIPOS
// ============================================================

/**
 * Clave de operación del Modelo 349.
 *
 * E = Entregas intracomunitarias de bienes
 * A = Adquisiciones intracomunitarias de bienes
 * T = Entregas intracomunitarias de bienes como operaciones triangulares
 * S = Prestaciones de servicios intracomunitarias
 * I = Adquisiciones intracomunitarias de servicios
 */
export type ClaveOperacion349 = 'E' | 'A' | 'T' | 'S' | 'I';

export interface Operacion349 {
  /** VAT Number del operador (sin prefijo de país). */
  vatNumber: string;
  /** Código de país ISO (2 letras). */
  codigoPais: string;
  /** Nombre o razón social del operador. */
  nombreRazon: string;
  /** Clave de operación. */
  claveOperacion: ClaveOperacion349;
  /** Base imponible total (sumada de todas las facturas del periodo). */
  baseImponible: number;
}

export interface Datos349 {
  ejercicio: number;
  periodo: string; // '1T', '2T', '3T', '4T' o '01'-'12' (mensual si SII)
  operaciones: Operacion349[];
  totalOperaciones: number;
  totalBaseImponible: number;
}

export interface ResultadoValidacionVat {
  valido: boolean;
  pais?: string;
  numero?: string;
  error?: string;
}

// ============================================================
// DETECCIÓN AUTOMÁTICA
// ============================================================

/**
 * ¿Es esta operación intracomunitaria?
 *
 * Se considera intracomunitaria si:
 * 1. El cliente tiene un país UE que NO es España.
 * 2. O el cliente tiene un VAT Number de un país UE.
 * 3. Y el destinatario NO está en Canarias, Ceuta o Melilla.
 *
 * El usuario no tiene que saber qué es una operación intracomunitaria:
 * basta con que el cliente tenga un país europeo en su ficha.
 */
export function esOperacionIntracomunitaria(client: Client, _settings?: CompanySettings): boolean {
  // Si tiene VAT Number de un país UE
  if (client.vatNumber) {
    const prefix = client.vatNumber.toUpperCase().substring(0, 2);
    if (esPaisUeNoEspana(prefix)) return true;
  }

  // Si su país es UE y no es España
  if (client.country && esPaisUeNoEspana(client.country)) return true;

  return false;
}

/**
 * Clasifica una operación para el Modelo 349.
 *
 * La distinción entre bienes (E/A) y servicios (S/I) se hace por el
 * tipo de producto: si al menos el 50% de las líneas son servicios
 * (sin unidad de medida física), se clasifica como servicio.
 */
export function tipoOperacion349(invoice: Invoice): ClaveOperacion349 | null {
  if (!invoice.esIntracomunitaria) return null;

  const esCompra = invoice.sentido === 'compra';

  // Heurística simple: si el tipo de documento es 'factura' sin líneas
  // con unidades físicas (kg, caja, palet, litro) → es un servicio.
  const lineasFisicas = invoice.lineItems.filter(
    li => ['kg', 'caja', 'palet', 'litro', 'docena', 'pack'].includes(li.unit),
  ).length;
  const esServicio = invoice.lineItems.length > 0 && lineasFisicas < invoice.lineItems.length / 2;

  if (esCompra) {
    return esServicio ? 'I' : 'A';
  }
  return esServicio ? 'S' : 'E';
}

// ============================================================
// GENERACIÓN DE DATOS PARA EL MODELO 349
// ============================================================

/**
 * Agrupa las facturas intracomunitarias de un periodo para el Modelo 349.
 *
 * Las operaciones se agrupan por operador (VAT Number + clave de
 * operación), sumando las bases imponibles de todas sus facturas.
 */
/**
 * ¿Cae esta factura dentro del ejercicio y el periodo que se declara?
 *
 * `periodo` viene como '1T'…'4T' cuando se presenta por trimestres, o
 * como '01'…'12' cuando se presenta mensualmente (el caso de quien está
 * en el SII). Lo que no encaje en ninguno de los dos formatos no se
 * filtra por mes: se deja pasar todo el ejercicio, que es la respuesta
 * prudente ante un periodo que no se sabe leer.
 */
export function esDelPeriodo(issueDate: string, ejercicio: number, periodo: string): boolean {
  const fecha = new Date(issueDate);
  if (Number.isNaN(fecha.getTime())) return false;
  if (fecha.getFullYear() !== ejercicio) return false;

  const mes = fecha.getMonth() + 1;

  const trimestre = /^([1-4])T$/i.exec(periodo.trim());
  if (trimestre) {
    const n = Number(trimestre[1]);
    return mes > (n - 1) * 3 && mes <= n * 3;
  }

  const mensual = /^(0?[1-9]|1[0-2])$/.exec(periodo.trim());
  if (mensual) return mes === Number(mensual[1]);

  return true;
}

export function generarDatos349(
  invoices: Invoice[],
  ejercicio: number,
  periodo: string,
): Datos349 {
  // Solo facturas intracomunitarias emitidas/selladas Y DEL PERIODO.
  //
  // El filtro por fecha faltaba: esta función recibía el ejercicio y el
  // trimestre, los estampaba en la cabecera del fichero… y sumaba TODAS
  // las facturas que le llegaran, fueran del trimestre que fueran. El
  // 349 del tercer trimestre salía con las operaciones de todo el año
  // dentro y con la etiqueta del tercero. Eso no es un descuadre de
  // pantalla: es una declaración mal presentada.
  const intracom = invoices.filter(inv =>
    inv.esIntracomunitaria &&
    inv.tipo !== 'presupuesto' &&
    inv.tipo !== 'pedido' &&
    inv.tipo !== 'albaran' &&
    inv.status !== 'borrador' &&
    inv.status !== 'anulada' &&
    inv.clientVatNumber &&
    esDelPeriodo(inv.issueDate, ejercicio, periodo)
  );

  // Agrupar por operador + clave
  const mapa = new Map<string, Operacion349>();

  for (const inv of intracom) {
    const vat = inv.clientVatNumber!.toUpperCase();
    const codigoPais = vat.substring(0, 2);
    const numero = vat.substring(2);
    const clave = inv.tipoOperacion349 || tipoOperacion349(inv) || 'E';
    const key = `${vat}_${clave}`;

    const existente = mapa.get(key);
    if (existente) {
      existente.baseImponible += inv.subtotal;
    } else {
      mapa.set(key, {
        vatNumber: numero,
        codigoPais,
        nombreRazon: inv.clientName,
        claveOperacion: clave,
        baseImponible: inv.subtotal,
      });
    }
  }

  const operaciones = Array.from(mapa.values()).map(op => ({
    ...op,
    baseImponible: Number(op.baseImponible.toFixed(2)),
  }));

  return {
    ejercicio,
    periodo,
    operaciones,
    totalOperaciones: operaciones.length,
    totalBaseImponible: Number(operaciones.reduce((sum, op) => sum + op.baseImponible, 0).toFixed(2)),
  };
}

// ============================================================
// GENERACIÓN DEL FICHERO 349 (FORMATO BOE)
// ============================================================

/**
 * Genera el fichero en formato BOE para presentación telemática del
 * Modelo 349 en la Sede Electrónica de la AEAT.
 *
 * El formato es de registros de longitud fija (500 posiciones por línea):
 * - Registro tipo 1: Declarante (cabecera)
 * - Registros tipo 2: Operadores intracomunitarios (uno por cada)
 */
export function generarFichero349(datos: Datos349, settings: CompanySettings): string {
  const nif = (settings.nif || '').padEnd(9, ' ');
  const ejercicio = String(datos.ejercicio);
  const periodo = datos.periodo.padStart(2, '0');
  const razonSocial = (settings.businessName || '').substring(0, 40).padEnd(40, ' ');

  // Registro tipo 1 — Declarante
  let registro1 = '1';                                          // Pos 1: tipo registro
  registro1 += '349';                                           // Pos 2-4: modelo
  registro1 += ejercicio;                                       // Pos 5-8: ejercicio
  registro1 += nif;                                             // Pos 9-17: NIF declarante
  registro1 += razonSocial;                                     // Pos 18-57: razón social
  registro1 += 'T';                                             // Pos 58: tipo soporte (T = telemático)
  registro1 += ' '.repeat(9);                                   // Pos 59-67: teléfono contacto
  registro1 += razonSocial;                                     // Pos 68-107: nombre contacto
  registro1 += '3490000000000';                                 // Pos 108-120: número declaración
  registro1 += ' ';                                             // Pos 121: complementaria
  registro1 += ' ';                                             // Pos 122: sustitutiva
  registro1 += ' '.repeat(13);                                  // Pos 123-135: nº declaración anterior
  registro1 += periodo;                                         // Pos 136-137: periodo
  registro1 += String(datos.totalOperaciones).padStart(9, '0'); // Pos 138-146: nº operadores
  registro1 += formatImporte349(datos.totalBaseImponible);       // Pos 147-161: importe total
  registro1 = registro1.padEnd(500, ' ');                       // Rellenar hasta 500

  const lineas = [registro1];

  // Registros tipo 2 — Operadores
  for (const op of datos.operaciones) {
    let reg = '2';                                               // Pos 1: tipo registro
    reg += '349';                                                // Pos 2-4: modelo
    reg += ejercicio;                                            // Pos 5-8: ejercicio
    reg += nif;                                                  // Pos 9-17: NIF declarante
    reg += op.codigoPais.padEnd(2, ' ');                         // Pos 18-19: código país
    reg += op.vatNumber.padEnd(17, ' ');                          // Pos 20-36: NIF operador
    reg += op.nombreRazon.substring(0, 40).padEnd(40, ' ');      // Pos 37-76: nombre/razón social
    reg += op.claveOperacion;                                    // Pos 77: clave operación
    reg += formatImporte349(op.baseImponible);                   // Pos 78-92: base imponible
    reg = reg.padEnd(500, ' ');                                  // Rellenar hasta 500
    lineas.push(reg);
  }

  return lineas.join('\r\n');
}

// ============================================================
// VALIDACIÓN DE VAT NUMBER
// ============================================================

/**
 * Valida el formato de un NIF-IVA (VAT Number) según el país.
 *
 * No consulta el servicio VIES (que puede estar caído): solo valida
 * el formato local. Para verificación real contra VIES, se necesitaría
 * una llamada al servicio de la Comisión Europea.
 */
export function validarVatNumber(vatNumber: string): ResultadoValidacionVat {
  if (!vatNumber || vatNumber.length < 4) {
    return { valido: false, error: 'El NIF-IVA debe tener al menos 4 caracteres (código de país + número).' };
  }

  const upper = vatNumber.toUpperCase().replace(/[\s.-]/g, '');
  const codigoPais = upper.substring(0, 2);
  const numero = upper.substring(2);

  const pais = PAISES_UE.find(p => p.codigo === codigoPais);
  if (!pais) {
    return { valido: false, error: `El código de país "${codigoPais}" no corresponde a un país de la UE.` };
  }

  if (codigoPais === 'ES') {
    return { valido: false, error: 'Para clientes españoles no se usa NIF-IVA, se usa el NIF/CIF/NIE normal.' };
  }

  if (!pais.vatRegex.test(upper)) {
    return { valido: false, pais: pais.nombre, numero, error: `El formato del NIF-IVA no es válido para ${pais.nombre}. Formato esperado: ${pais.vatPrefix}XXXXXXXX` };
  }

  return { valido: true, pais: pais.nombre, numero };
}

// ============================================================
// RESUMEN
// ============================================================

export interface ResumenIntracomunitarias {
  totalEntregas: number;     // E
  totalAdquisiciones: number; // A
  totalServicios: number;    // S + I
  operaciones: number;
  facturasIncompletas: number; // Sin VAT Number
}

/**
 * Resumen rápido para el dashboard.
 */
export function calcularResumenIntracomunitarias(invoices: Invoice[]): ResumenIntracomunitarias {
  let totalEntregas = 0;
  let totalAdquisiciones = 0;
  let totalServicios = 0;
  let operaciones = 0;
  let facturasIncompletas = 0;

  for (const inv of invoices) {
    if (!inv.esIntracomunitaria) continue;
    if (inv.tipo === 'presupuesto' || inv.tipo === 'pedido' || inv.tipo === 'albaran') continue;
    if (inv.status === 'borrador' || inv.status === 'anulada') continue;

    operaciones++;

    if (!inv.clientVatNumber) {
      facturasIncompletas++;
      continue;
    }

    const clave = inv.tipoOperacion349 || tipoOperacion349(inv) || 'E';
    switch (clave) {
      case 'E':
      case 'T':
        totalEntregas += inv.subtotal;
        break;
      case 'A':
        totalAdquisiciones += inv.subtotal;
        break;
      case 'S':
      case 'I':
        totalServicios += inv.subtotal;
        break;
    }
  }

  return {
    totalEntregas: Number(totalEntregas.toFixed(2)),
    totalAdquisiciones: Number(totalAdquisiciones.toFixed(2)),
    totalServicios: Number(totalServicios.toFixed(2)),
    operaciones,
    facturasIncompletas,
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Formatea un importe para el fichero 349: 15 dígitos con signo.
 * Positivo o negativo, con dos decimales sin separador.
 */
function formatImporte349(importe: number): string {
  const signo = importe >= 0 ? ' ' : 'N';
  const abs = Math.abs(Math.round(importe * 100));
  return signo + String(abs).padStart(14, '0');
}
