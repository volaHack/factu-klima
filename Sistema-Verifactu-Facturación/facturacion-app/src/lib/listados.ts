/**
 * LISTADOS: LA RELACIÓN DE LO QUE HAY, EN UNA HOJA
 *
 * Lo que en los programas de gestión de toda la vida se llama «Relaciones»:
 * eliges qué quieres ver —los albaranes de compra, los cobros, las
 * regularizaciones—, acotas por serie, número, fecha o tercero, y sale una
 * hoja con una fila por documento y el total al pie. Se imprime, se
 * archiva, se le enseña al gestor.
 *
 * No es lo mismo que Informes. Un informe interpreta —márgenes,
 * comparativas, tendencias—; una relación no interpreta nada: enumera. Y
 * eso es justo lo que hace falta para cuadrar el trimestre con la
 * asesoría, para comprobar qué albaranes quedan sin facturar o para
 * responder a «pásame todas las compras de septiembre».
 *
 * TODO PASA POR UNA SOLA FILA
 *
 * Cada documento del programa —una factura, un albarán, un cobro, un
 * ajuste de stock— acaba convertido en la MISMA `FilaListado`: número,
 * fecha, nombre, documento, neto, impuestos y total. Es lo que permite
 * que la hoja, el filtro, los totales y la exportación se escriban una
 * vez y sirvan para las quince relaciones, en vez de quince pantallas
 * parecidas que se van separando con los años.
 */

import type {
  Albaran, CobroPago, Invoice, RegularizacionStock, TraspasoAlmacen,
} from './types';
import type { ModuloId } from './modulos';

// ============================================================
// LA FILA
// ============================================================

export interface FilaListado {
  id: string;
  serie: string;
  /** El número completo tal y como se ve en el documento. */
  numero: string;
  /** La parte numérica, para poder acotar «del 100 al 200». */
  secuencia: number;
  fecha: string;
  /** Cliente, proveedor o almacén, según de qué relación se trate. */
  nombre: string;
  /** Referencia de apoyo: el documento del que salió, el método de pago… */
  documento: string;
  neto: number;
  impuestos: number;
  total: number;
  /**
   * Si queda algo por hacer con él: una factura sin cobrar del todo, un
   * albarán sin facturar. Es lo que filtra la casilla «Pendientes».
   */
  pendiente: boolean;
}

export interface FiltroListado {
  serieDesde?: string;
  serieHasta?: string;
  numeroDesde?: number;
  numeroHasta?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  terceroDesde?: string;
  terceroHasta?: string;
  soloPendientes?: boolean;
}

export interface TotalesListado {
  documentos: number;
  neto: number;
  impuestos: number;
  total: number;
}

// ============================================================
// EL CATÁLOGO DE RELACIONES
// ============================================================

export type GrupoListado = 'compras' | 'ventas' | 'almacen' | 'tesoreria';

/** De dónde salen las filas de cada relación. */
export type FuenteListado =
  | { clase: 'documentos'; tipo: Invoice['tipo']; sentido: Invoice['sentido'] }
  | { clase: 'albaranes' }
  | { clase: 'cobrosPagos'; tipo: CobroPago['tipo'] }
  | { clase: 'regularizaciones' }
  | { clase: 'traspasos' };

export interface Relacion {
  id: string;
  nombre: string;
  grupo: GrupoListado;
  fuente: FuenteListado;
  /** Cómo se titula la columna del tercero en esta relación. */
  columnaNombre: string;
  /** Sin este módulo encendido, la relación no se ofrece. */
  requiere?: ModuloId;
  /** Si tiene sentido acotar por tercero (un ajuste de stock no lo tiene). */
  porTercero: boolean;
  /** Si tiene sentido la casilla de «Pendientes». */
  conPendientes: boolean;
  /**
   * Si la relación cuenta UNIDADES en vez de euros.
   *
   * Un ajuste de stock o un traspaso mueven género, no dinero: enseñar
   * ahí columnas de «Neto», «Impuestos» y «Total» en euros sería
   * inventarse un importe que en ningún sitio existe.
   */
  enUnidades?: boolean;
}

export const GRUPOS_LISTADO: { id: GrupoListado; nombre: string }[] = [
  { id: 'compras', nombre: 'Compras' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'almacen', nombre: 'Almacén' },
  { id: 'tesoreria', nombre: 'Tesorería' },
];

export const RELACIONES: Relacion[] = [
  // --- Compras ---
  { id: 'pedidos_compra', nombre: 'Pedidos de compra', grupo: 'compras',
    fuente: { clase: 'documentos', tipo: 'pedido', sentido: 'compra' },
    columnaNombre: 'Proveedor', porTercero: true, conPendientes: true, requiere: 'pedidos' },
  { id: 'albaranes_compra', nombre: 'Albaranes de compra', grupo: 'compras',
    fuente: { clase: 'documentos', tipo: 'albaran', sentido: 'compra' },
    columnaNombre: 'Proveedor', porTercero: true, conPendientes: true, requiere: 'albaranes' },
  { id: 'facturas_compra', nombre: 'Facturas de compra', grupo: 'compras',
    fuente: { clase: 'documentos', tipo: 'factura', sentido: 'compra' },
    columnaNombre: 'Proveedor', porTercero: true, conPendientes: true },
  { id: 'rectificativas_compra', nombre: 'Facturas de compra rectificativas', grupo: 'compras',
    fuente: { clase: 'documentos', tipo: 'rectificativa', sentido: 'compra' },
    columnaNombre: 'Proveedor', porTercero: true, conPendientes: false, requiere: 'rectificativas' },

  // --- Ventas ---
  { id: 'presupuestos', nombre: 'Presupuestos', grupo: 'ventas',
    fuente: { clase: 'documentos', tipo: 'presupuesto', sentido: 'venta' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: true, requiere: 'presupuestos' },
  { id: 'pedidos_venta', nombre: 'Pedidos de venta', grupo: 'ventas',
    fuente: { clase: 'documentos', tipo: 'pedido', sentido: 'venta' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: true, requiere: 'pedidos' },
  { id: 'albaranes_venta', nombre: 'Albaranes de venta', grupo: 'ventas',
    fuente: { clase: 'albaranes' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: true, requiere: 'albaranes' },
  { id: 'facturas_venta', nombre: 'Facturas de venta', grupo: 'ventas',
    fuente: { clase: 'documentos', tipo: 'factura', sentido: 'venta' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: true },
  { id: 'rectificativas_venta', nombre: 'Facturas de venta rectificativas', grupo: 'ventas',
    fuente: { clase: 'documentos', tipo: 'rectificativa', sentido: 'venta' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: false, requiere: 'rectificativas' },

  // --- Almacén ---
  { id: 'regularizaciones', nombre: 'Regularizaciones de stock', grupo: 'almacen',
    fuente: { clase: 'regularizaciones' },
    columnaNombre: 'Producto', porTercero: false, conPendientes: false, enUnidades: true, requiere: 'almacenes' },
  { id: 'traspasos', nombre: 'Traspasos entre almacenes', grupo: 'almacen',
    fuente: { clase: 'traspasos' },
    columnaNombre: 'Origen → destino', porTercero: false, conPendientes: false, enUnidades: true, requiere: 'almacenes' },

  // --- Tesorería ---
  { id: 'cobros', nombre: 'Cobros', grupo: 'tesoreria',
    fuente: { clase: 'cobrosPagos', tipo: 'cobro' },
    columnaNombre: 'Cliente', porTercero: true, conPendientes: false },
  { id: 'pagos', nombre: 'Pagos', grupo: 'tesoreria',
    fuente: { clase: 'cobrosPagos', tipo: 'pago' },
    columnaNombre: 'Proveedor', porTercero: true, conPendientes: false },
];

export function relacionPorId(id: string): Relacion | undefined {
  return RELACIONES.find(r => r.id === id);
}

/** Las relaciones que esta empresa puede pedir, según los módulos que tenga. */
export function relacionesDisponibles(modulos: ModuloId[] | undefined): Relacion[] {
  const activos = new Set(modulos ?? []);
  return RELACIONES.filter(r => !r.requiere || activos.has(r.requiere));
}

// ============================================================
// DE CADA DOCUMENTO A UNA FILA
// ============================================================

/**
 * La parte numérica de «FAC-2026-0042» → 42.
 *
 * Se queda con el ÚLTIMO grupo de dígitos y no con el primero: en esa
 * numeración el primero es el año, y acotar «del 100 al 200» por el año
 * no devolvería nada.
 */
export function secuenciaDe(numero: string): number {
  const grupos = numero.match(/\d+/g);
  return grupos ? Number(grupos[grupos.length - 1]) : 0;
}

export function filasDeDocumentos(
  invoices: Invoice[],
  tipo: Invoice['tipo'],
  sentido: Invoice['sentido'],
): FilaListado[] {
  return invoices
    .filter(inv => (inv.tipo ?? 'factura') === tipo && (inv.sentido ?? 'venta') === sentido)
    .map(inv => ({
      id: inv.id,
      serie: inv.series,
      numero: inv.number,
      secuencia: secuenciaDe(inv.number),
      fecha: inv.issueDate,
      nombre: inv.clientName,
      documento: inv.documentoOrigenNumber ?? '',
      neto: inv.subtotal,
      impuestos: inv.totalTax,
      total: inv.total,
      // Pendiente = queda dinero por cobrar o pagar. Una anulada no debe
      // nada a nadie, aunque su importe siga en los libros.
      pendiente: inv.status !== 'anulada' && (inv.paidAmount ?? 0) < inv.total,
    }));
}

export function filasDeAlbaranes(albaranes: Albaran[]): FilaListado[] {
  return albaranes.map(alb => ({
    id: alb.id,
    serie: alb.series,
    numero: alb.number,
    secuencia: secuenciaDe(alb.number),
    fecha: alb.issueDate,
    nombre: alb.clientName,
    documento: alb.invoiceId ? 'Facturado' : '',
    neto: alb.subtotal,
    impuestos: alb.totalTax,
    total: alb.total,
    // En un albarán lo pendiente no es cobrar: es facturarlo. Es la
    // pregunta que se hace a fin de mes, «¿qué he servido y no he
    // pasado todavía?».
    pendiente: alb.status !== 'facturado' && alb.status !== 'anulado',
  }));
}

export function filasDeCobrosPagos(movimientos: CobroPago[], tipo: CobroPago['tipo']): FilaListado[] {
  return movimientos
    .filter(m => m.tipo === tipo)
    .map(m => ({
      id: m.id,
      serie: m.series,
      numero: m.number,
      secuencia: secuenciaDe(m.number),
      fecha: m.fecha,
      nombre: m.contraparteNombre,
      // Contra qué facturas se aplicó: es lo que se busca al repasar un
      // cobro que no cuadra.
      documento: m.desglose.map(d => d.invoiceNumber).join(', '),
      // Un cobro no desglosa impuestos: mueve dinero, no lo devenga.
      neto: m.importeTotal,
      impuestos: 0,
      total: m.importeTotal,
      pendiente: false,
    }));
}

/**
 * Una regularización no tiene número de documento ni importe: lo que
 * guarda es qué producto se contó, cuánto había, cuánto hay y por qué.
 * Así que la referencia del artículo hace de número y la diferencia de
 * unidades ocupa la columna de cantidad — de ahí que estas dos
 * relaciones vayan marcadas `enUnidades` y no enseñen euros.
 */
export function filasDeRegularizaciones(regs: RegularizacionStock[]): FilaListado[] {
  return regs.map(r => ({
    id: r.id,
    serie: r.almacenNombre,
    numero: r.productRef,
    secuencia: secuenciaDe(r.productRef),
    fecha: r.fecha,
    nombre: r.productName,
    documento: r.motivo,
    neto: r.diferencia,
    impuestos: 0,
    total: r.diferencia,
    pendiente: false,
  }));
}

export function filasDeTraspasos(traspasos: TraspasoAlmacen[]): FilaListado[] {
  return traspasos.map(t => ({
    id: t.id,
    serie: '',
    numero: t.number,
    secuencia: secuenciaDe(t.number),
    fecha: t.fecha,
    nombre: `${t.origenAlmacenNombre} → ${t.destinoAlmacenNombre}`,
    documento: t.notas ?? '',
    neto: t.lineItems.reduce((s, l) => s + l.quantity, 0),
    impuestos: 0,
    total: t.lineItems.reduce((s, l) => s + l.quantity, 0),
    pendiente: false,
  }));
}

// ============================================================
// EL FILTRO
// ============================================================

/** Compara dos textos como haría el usuario: sin mayúsculas ni acentos. */
function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Aplica el acotado y devuelve las filas en orden de fecha y número.
 *
 * Los rangos son INCLUSIVOS por los dos lados y cada extremo es
 * opcional: dejar «Hasta» en blanco significa «hasta el final», que es
 * como se ha entendido siempre un «desde/hasta» en una pantalla de
 * listados y lo que evita tener que escribir una fecha imposible para
 * decir «todo lo que venga después».
 */
export function filtrarFilas(filas: FilaListado[], filtro: FiltroListado): FilaListado[] {
  const serieDesde = filtro.serieDesde ? normalizar(filtro.serieDesde) : '';
  const serieHasta = filtro.serieHasta ? normalizar(filtro.serieHasta) : '';
  const terceroDesde = filtro.terceroDesde ? normalizar(filtro.terceroDesde) : '';
  const terceroHasta = filtro.terceroHasta ? normalizar(filtro.terceroHasta) : '';

  return filas
    .filter(f => {
      if (filtro.soloPendientes && !f.pendiente) return false;

      const serie = normalizar(f.serie);
      if (serieDesde && serie < serieDesde) return false;
      if (serieHasta && serie > serieHasta) return false;

      if (filtro.numeroDesde != null && f.secuencia < filtro.numeroDesde) return false;
      if (filtro.numeroHasta != null && f.secuencia > filtro.numeroHasta) return false;

      // Las fechas van en ISO (aaaa-mm-dd), así que se comparan como
      // texto sin construir un Date por fila.
      if (filtro.fechaDesde && f.fecha < filtro.fechaDesde) return false;
      if (filtro.fechaHasta && f.fecha > filtro.fechaHasta) return false;

      const nombre = normalizar(f.nombre);
      if (terceroDesde && nombre < terceroDesde) return false;
      if (terceroHasta && nombre > terceroHasta) return false;

      return true;
    })
    .sort((a, b) => (a.fecha === b.fecha ? a.secuencia - b.secuencia : a.fecha.localeCompare(b.fecha)));
}

export function totalesDe(filas: FilaListado[]): TotalesListado {
  return filas.reduce<TotalesListado>(
    (acc, f) => ({
      documentos: acc.documentos + 1,
      neto: redondear(acc.neto + f.neto),
      impuestos: redondear(acc.impuestos + f.impuestos),
      total: redondear(acc.total + f.total),
    }),
    { documentos: 0, neto: 0, impuestos: 0, total: 0 },
  );
}

/** Dos decimales en cada suma: acumular en coma flotante saca colas de céntimos. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// LA EXPORTACIÓN
// ============================================================

/**
 * El listado en CSV, listo para abrir con Excel.
 *
 * Con punto y coma y no con coma: en un Windows en español la coma es
 * el separador DECIMAL, y un CSV separado por comas se abre con todas
 * las columnas amontonadas en la primera. Y con BOM delante, o Excel
 * lee los acentos como símbolos.
 */
export function listadoComoCsv(filas: FilaListado[], columnaNombre: string): string {
  const escapar = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const decimal = (n: number) => n.toFixed(2).replace('.', ',');

  const cabecera = ['Serie', 'Número', 'Fecha', columnaNombre, 'Documento', 'Neto', 'Impuestos', 'Total'];
  const cuerpo = filas.map(f => [
    f.serie, f.numero, f.fecha, f.nombre, f.documento,
    decimal(f.neto), decimal(f.impuestos), decimal(f.total),
  ]);
  const t = totalesDe(filas);
  const pie = ['', '', '', '', 'TOTAL', decimal(t.neto), decimal(t.impuestos), decimal(t.total)];

  return '﻿' + [cabecera, ...cuerpo, pie]
    .map(fila => fila.map(escapar).join(';'))
    .join('\r\n');
}
