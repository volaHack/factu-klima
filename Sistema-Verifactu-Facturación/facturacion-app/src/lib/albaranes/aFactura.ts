/**
 * DE VARIOS ALBARANES A UNA FACTURA
 *
 * Los albaranes viven en dos sitios: la tabla `albaranes` de siempre
 * (pantalla Albaranes) y los albaranes de venta como documento (`invoices`
 * con tipo 'albaran', en Documentos). Los dos se facturan igual —se marcan
 * varios y sale una factura por cliente— y esta pieza es la que decide
 * cómo, sin tocar la base de datos, para poder probarla entera:
 *
 *   · cuáles se pueden facturar y, de los que no, por qué. Si en la
 *     selección hay alguno que no, no se factura ninguno: un albarán
 *     borrador o ya facturado metido sin querer en el lote se colaba
 *     callado, y el lote salía con menos albaranes de los que se creía;
 *   · cuántas facturas salen: una por cliente, salvo que sus albaranes no
 *     puedan ir juntos (descuentos de pie distintos, otra retención, otro
 *     impuesto u otra obra), y entonces se dice por qué;
 *   · la factura de cada grupo: las líneas de todos sus albaranes en orden
 *     de entrega, recalculadas con la misma cuenta que una factura normal,
 *     los datos del cliente de su ficha (con sus días y su forma de pago),
 *     y la referencia de cada albarán —número, fecha y qué líneas son
 *     suyas—, que es lo que pide una factura recapitulativa (art. 13 del
 *     Reglamento de facturación);
 *   · el número: el siguiente de la serie de facturas sin pisar ninguno
 *     que este equipo ya conozca.
 */

import {
  InvoiceStatus,
  type Albaran, type Client, type CompanySettings, type Invoice, type InvoiceLineItem, type PaymentMethod,
} from '@/lib/types';
import type { NombreImpuesto } from '@/lib/impuesto';
import { calculateInvoiceTotals, calculateLineSubtotal, calculateLineTax, addDays, generateInvoiceNumber } from '@/lib/utils';
import { customColsDeLineas, CLAVE_CLIENTE_OCASIONAL } from '@/lib/plantillas/datos';
import { esOperacionIntracomunitaria, tipoOperacion349 } from '@/lib/intracomunitarias';
import { claveCliente } from './facturacionPeriodo';

/** De qué pantalla viene: la tabla `albaranes` o un documento de tipo albarán. */
export type OrigenAlbaran = 'albaran' | 'documento';

export type EstadoAlbaran = 'borrador' | 'expedido' | 'facturado' | 'anulado' | 'otro';

/** Un albarán de cualquiera de los dos sitios, con lo que hace falta para facturarlo. */
export interface AlbaranParaFacturar {
  id: string;
  origen: OrigenAlbaran;
  number: string;
  issueDate: string;
  estado: EstadoAlbaran;
  sentido: 'venta' | 'compra';
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  lineItems: InvoiceLineItem[];
  total: number;
  descuentosPie: [number, number, number];
  retencionPct: number;
  /** El impuesto con el que se guardó (sólo los documentos lo tienen, desde la 077). */
  impuesto?: NombreImpuesto;
  obraId?: string;
  vendedorId?: string;
  almacenId?: string;
  tarifaId?: string;
  paymentMethod?: PaymentMethod;
  datosExtras: Record<string, string>;
  /** La factura que ya lo recoge, si la hay. */
  factura?: { id: string; number: string };
  /** El objeto del que sale, para volver a guardarlo tal cual. */
  fuente: Albaran | Invoice;
}

/**
 * Lo que la factura apunta de cada albarán que recoge: el enlace de la
 * factura a sus albaranes. Va en `datosExtras`, en una clave reservada
 * como el cliente ocasional, para no pedir una columna nueva.
 */
export const CLAVE_ALBARANES = '__albaranes';

export interface RefAlbaran {
  id: string;
  origen: OrigenAlbaran;
  numero: string;
  fecha: string;
  /** Los id de las líneas de la factura que salen de este albarán. */
  lineas: string[];
}

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function porFechaYNumero(a: AlbaranParaFacturar, b: AlbaranParaFacturar): number {
  return (a.issueDate || '').localeCompare(b.issueDate || '')
    || (a.number || '').localeCompare(b.number || '', undefined, { numeric: true });
}

// ------------------------------------------------------------
// Los dos orígenes, en una sola forma
// ------------------------------------------------------------

/** Un albarán de la pantalla Albaranes. */
export function desdeAlbaran(a: Albaran, facturas: readonly Invoice[] = []): AlbaranParaFacturar {
  const factura = a.invoiceId ? facturas.find(f => f.id === a.invoiceId) : undefined;
  return {
    id: a.id,
    origen: 'albaran',
    number: a.number,
    issueDate: a.issueDate,
    estado: a.status,
    sentido: 'venta',
    clientId: a.clientId || '',
    clientName: a.clientName || '',
    clientNif: a.clientNif || '',
    clientAddress: a.clientAddress || '',
    lineItems: (a.lineItems || []) as InvoiceLineItem[],
    total: Number(a.total || 0),
    descuentosPie: [0, 0, 0],
    retencionPct: 0,
    datosExtras: a.datosExtras ?? {},
    factura: a.invoiceId ? { id: a.invoiceId, number: factura?.number ?? '' } : undefined,
    fuente: a,
  };
}

const ESTADO_DE_DOCUMENTO: Partial<Record<InvoiceStatus, EstadoAlbaran>> = {
  [InvoiceStatus.BORRADOR]: 'borrador',
  [InvoiceStatus.EXPEDIDO]: 'expedido',
  [InvoiceStatus.FACTURADO]: 'facturado',
  [InvoiceStatus.ANULADA]: 'anulado',
};

/** Los albaranes que recoge una factura hecha con esta pieza. */
export function albaranesDeLaFactura(factura: Pick<Invoice, 'datosExtras'>): RefAlbaran[] {
  const crudo = factura.datosExtras?.[CLAVE_ALBARANES];
  if (!crudo) return [];
  try {
    const lista = JSON.parse(crudo);
    return Array.isArray(lista) ? lista.filter(r => r && typeof r.id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * La factura viva (no anulada) que ya recoge este albarán de documento.
 * Cuenta también la que se hizo desde la ficha del albarán («Convertir a
 * factura»), que lo apunta como su documento de origen y no le cambia el
 * estado: sin esto, ese albarán seguía «expedido» y se podía facturar otra
 * vez desde la lista.
 */
export function facturaQueRecoge(albaranId: string, documentos: readonly Invoice[]): Invoice | undefined {
  return documentos.find(d => (d.tipo ?? 'factura') === 'factura'
    && d.status !== InvoiceStatus.ANULADA
    && (d.documentoOrigenId === albaranId || albaranesDeLaFactura(d).some(r => r.id === albaranId)));
}

/** Un albarán de venta de Documentos (`invoices` con tipo 'albaran'). */
export function desdeDocumento(d: Invoice, documentos: readonly Invoice[] = []): AlbaranParaFacturar {
  const recoge = facturaQueRecoge(d.id, documentos);
  let estado: EstadoAlbaran = d.tipo === 'albaran' ? (ESTADO_DE_DOCUMENTO[d.status] ?? 'otro') : 'otro';
  if (estado === 'expedido' && recoge) estado = 'facturado';
  return {
    id: d.id,
    origen: 'documento',
    number: d.number,
    issueDate: d.issueDate,
    estado,
    sentido: d.sentido ?? 'venta',
    clientId: d.clientId || '',
    clientName: d.clientName || '',
    clientNif: d.clientNif || '',
    clientAddress: d.clientAddress || '',
    lineItems: d.lineItems || [],
    total: Number(d.total || 0),
    descuentosPie: [d.globalDiscountPercent1 || 0, d.globalDiscountPercent2 || 0, d.globalDiscountPercent3 || 0],
    retencionPct: d.retencionPct || 0,
    impuesto: d.impuesto,
    obraId: d.obraId || undefined,
    vendedorId: d.vendedorId || undefined,
    almacenId: d.almacenId || undefined,
    tarifaId: d.tarifaId || undefined,
    paymentMethod: d.paymentMethod,
    datosExtras: d.datosExtras ?? {},
    factura: recoge ? { id: recoge.id, number: recoge.number } : undefined,
    fuente: d,
  };
}

// ------------------------------------------------------------
// Qué se puede facturar
// ------------------------------------------------------------

/** Por qué este albarán no se puede facturar ahora; null si se puede. */
export function motivoNoFacturable(a: AlbaranParaFacturar): string | null {
  if (a.sentido === 'compra') return 'es de compra: se registra con la factura del proveedor';
  switch (a.estado) {
    case 'borrador': return 'aún no se ha expedido';
    case 'facturado': return a.factura?.number ? `ya está facturado en ${a.factura.number}` : 'ya está facturado';
    case 'anulado': return 'está anulado';
    case 'otro': return 'su estado no permite facturarlo';
  }
  if ((a.lineItems || []).length === 0) return 'no tiene líneas';
  return null;
}

export const esFacturable = (a: AlbaranParaFacturar) => motivoNoFacturable(a) === null;

export interface RevisionSeleccion {
  facturables: AlbaranParaFacturar[];
  rechazados: Array<{ albaran: AlbaranParaFacturar; motivo: string }>;
}

export function revisarSeleccion(lista: readonly AlbaranParaFacturar[]): RevisionSeleccion {
  const facturables: AlbaranParaFacturar[] = [];
  const rechazados: RevisionSeleccion['rechazados'] = [];
  for (const a of lista) {
    const motivo = motivoNoFacturable(a);
    if (motivo) rechazados.push({ albaran: a, motivo });
    else facturables.push(a);
  }
  return { facturables, rechazados };
}

/** «ALB-3 aún no se ha expedido; ALB-5 ya está facturado en F-2026-0012». */
export function explicarRechazados(rechazados: RevisionSeleccion['rechazados'], max = 4): string {
  const partes = rechazados.slice(0, max).map(r => `${r.albaran.number} ${r.motivo}`);
  const resto = rechazados.length - partes.length;
  return partes.join('; ') + (resto > 0 ? ` y ${resto} más` : '');
}

// ------------------------------------------------------------
// Cuántas facturas salen
// ------------------------------------------------------------

export interface GrupoFactura {
  clave: string;
  claveCliente: string;
  origen: OrigenAlbaran;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  albaranes: AlbaranParaFacturar[];
  descuentosPie: [number, number, number];
  retencionPct: number;
  impuesto?: NombreImpuesto;
  obraId?: string;
  /** Las líneas tal como irán en la factura (sin id definitivo). */
  lineas: InvoiceLineItem[];
  subtotal: number;
  totalTax: number;
  total: number;
  primeraEntrega: string;
  ultimaEntrega: string;
}

export interface PlanFacturas {
  grupos: GrupoFactura[];
  clientes: number;
  total: number;
  /** Clientes cuyos albaranes van en más de una factura, y por qué. */
  separados: Array<{ clientName: string; facturas: number; motivo: string }>;
}

const pieTexto = (d: readonly number[]) => d.map(n => Number(n || 0)).join('/');

/** Una línea del albarán lista para la factura: los tres descuentos y sus importes, recalculados. */
export function lineaParaFactura(li: InvoiceLineItem, id: string): InvoiceLineItem {
  const d1 = Number(li.discountPercent || 0);
  const d2 = Number(li.discountPercent2 || 0);
  const d3 = Number(li.discountPercent3 || 0);
  // Los importes se rehacen con la misma cuenta que cualquier factura
  // (utils): lo que guardaba el albarán podía venir de una versión de la
  // app que sólo aplicaba el primer descuento.
  const subtotal = calculateLineSubtotal(Number(li.quantity), Number(li.unitPrice), d1, d2, d3);
  const taxAmount = calculateLineTax(subtotal, Number(li.taxRate));
  return {
    ...li,
    id,
    discountPercent: d1,
    discountPercent2: d2,
    discountPercent3: d3,
    subtotal,
    taxAmount,
    total: Number((subtotal + taxAmount).toFixed(2)),
  };
}

/**
 * Agrupa los albaranes facturables: una factura por cliente y, dentro del
 * cliente, por lo que no puede ir mezclado en una misma factura —los
 * descuentos de pie, la retención, el impuesto y la obra son de la
 * factura entera, no de cada línea—.
 */
export function planDeFacturas(lista: readonly AlbaranParaFacturar[]): PlanFacturas {
  const porClave = new Map<string, AlbaranParaFacturar[]>();
  for (const a of lista) {
    const clave = [
      a.origen, claveCliente(a), pieTexto(a.descuentosPie), a.retencionPct || 0, a.impuesto ?? '', a.obraId ?? '',
    ].join('|');
    porClave.set(clave, [...(porClave.get(clave) ?? []), a]);
  }

  const grupos: GrupoFactura[] = [...porClave.entries()].map(([clave, deEste]) => {
    const albaranes = [...deEste].sort(porFechaYNumero);
    // Los datos del cliente, del albarán más reciente: si cambió la
    // dirección a mitad de mes, la factura lleva la de ahora (y si tiene
    // ficha, al crearla mandan los de la ficha).
    const reciente = albaranes[albaranes.length - 1];
    let n = 0;
    const lineas = albaranes.flatMap(a => a.lineItems.map(li => lineaParaFactura(li, `p${++n}`)));
    const totales = calculateInvoiceTotals(lineas, reciente.descuentosPie);
    return {
      clave,
      claveCliente: claveCliente(reciente),
      origen: reciente.origen,
      clientId: reciente.clientId,
      clientName: reciente.clientName,
      clientNif: reciente.clientNif,
      clientAddress: reciente.clientAddress,
      albaranes,
      descuentosPie: reciente.descuentosPie,
      retencionPct: reciente.retencionPct,
      impuesto: reciente.impuesto,
      obraId: reciente.obraId,
      lineas,
      subtotal: totales.subtotal,
      totalTax: totales.totalTax,
      total: totales.total,
      primeraEntrega: albaranes[0].issueDate,
      ultimaEntrega: reciente.issueDate,
    };
  }).sort((a, b) => a.clientName.localeCompare(b.clientName, 'es') || a.primeraEntrega.localeCompare(b.primeraEntrega));

  const porCliente = new Map<string, GrupoFactura[]>();
  for (const g of grupos) porCliente.set(g.claveCliente, [...(porCliente.get(g.claveCliente) ?? []), g]);

  const separados: PlanFacturas['separados'] = [];
  for (const deEste of porCliente.values()) {
    if (deEste.length < 2) continue;
    const motivos: string[] = [];
    const distinto = (f: (g: GrupoFactura) => string | number) => new Set(deEste.map(f)).size > 1;
    if (distinto(g => pieTexto(g.descuentosPie))) motivos.push('descuentos de pie distintos');
    if (distinto(g => g.retencionPct)) motivos.push('otra retención');
    if (distinto(g => g.impuesto ?? '')) motivos.push('otro impuesto');
    if (distinto(g => g.obraId ?? '')) motivos.push('obras distintas');
    separados.push({ clientName: deEste[0].clientName, facturas: deEste.length, motivo: motivos.join(', ') });
  }

  return {
    grupos,
    clientes: porCliente.size,
    total: redondear(grupos.reduce((s, g) => s + g.total, 0)),
    separados,
  };
}

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

/** «3 facturas para 3 clientes · total 1.234,56 €». */
export function resumenDelPlan(plan: Pick<PlanFacturas, 'grupos' | 'clientes' | 'total'>): string {
  const f = plan.grupos.length;
  return `${f} ${f === 1 ? 'factura' : 'facturas'} para ${plan.clientes} ${plan.clientes === 1 ? 'cliente' : 'clientes'} · total ${euros(plan.total)}`;
}

// ------------------------------------------------------------
// La factura de cada grupo
// ------------------------------------------------------------

const fechaEs = (iso: string) => {
  const [a, m, d] = (iso || '').split('-');
  return d ? `${d}/${m}/${a}` : iso;
};

/**
 * La nota de la factura: la fecha de las operaciones (el Reglamento la
 * pide cuando no coincide con la de la factura) y cada albarán con su
 * fecha, su importe y las líneas que le tocan, para que el cliente cuadre
 * cada entrega con lo que se le cobra.
 */
export function notaDeFactura(grupo: Pick<GrupoFactura, 'albaranes' | 'primeraEntrega' | 'ultimaEntrega'>): string {
  const operaciones = grupo.primeraEntrega === grupo.ultimaEntrega
    ? `Fecha de la operación: ${fechaEs(grupo.primeraEntrega)}.`
    : `Operaciones realizadas del ${fechaEs(grupo.primeraEntrega)} al ${fechaEs(grupo.ultimaEntrega)}.`;
  let desde = 1;
  const lista = grupo.albaranes.map(a => {
    const n = a.lineItems.length;
    const lineas = n === 1 ? `línea ${desde}` : `líneas ${desde}-${desde + n - 1}`;
    desde += n;
    return `${a.number} del ${fechaEs(a.issueDate)} (${lineas}, ${euros(a.total || 0)})`;
  }).join('; ');
  const cuantos = grupo.albaranes.length === 1 ? 'el albarán' : `los ${grupo.albaranes.length} albaranes`;
  return `${operaciones}\nFactura de ${cuantos}: ${lista}.`;
}

/** Lo que tienen todos igual; si alguno difiere, nada. */
function comun<T>(valores: Array<T | undefined>): T | undefined {
  const distintos = new Set(valores.map(v => v ?? null));
  return distintos.size === 1 ? (valores[0] ?? undefined) : undefined;
}

export interface ContextoFactura {
  cliente?: Client;
  ajustes: CompanySettings;
  serie: string;
  numero: string;
  /** AAAA-MM-DD de la factura. */
  hoy: string;
  ahora: string;
  nuevoId: () => string;
}

/** La factura borrador de un grupo, lista para `saveInvoice`. */
export function facturaDelGrupo(grupo: GrupoFactura, ctx: ContextoFactura): Invoice {
  const { cliente, ajustes } = ctx;
  const refs: RefAlbaran[] = [];
  const lineItems: InvoiceLineItem[] = [];
  for (const a of grupo.albaranes) {
    const ids: string[] = [];
    for (const li of a.lineItems) {
      const id = ctx.nuevoId();
      ids.push(id);
      lineItems.push(lineaParaFactura(li, id));
    }
    refs.push({ id: a.id, origen: a.origen, numero: a.number, fecha: a.issueDate, lineas: ids });
  }
  const totales = calculateInvoiceTotals(lineItems, grupo.descuentosPie);

  // El cliente: el de su ficha, que es donde están sus datos fiscales de
  // ahora, sus días de pago y su forma de pago. Sin ficha (cliente
  // ocasional), lo que traía el albarán más reciente.
  const reciente = grupo.albaranes[grupo.albaranes.length - 1];
  const direccionFicha = cliente
    ? [cliente.address, [cliente.postalCode, cliente.city].filter(Boolean).join(' ')].map(s => (s ?? '').trim()).filter(Boolean).join(', ')
    : '';
  const ocasional: Record<string, string> = !cliente && reciente.datosExtras[CLAVE_CLIENTE_OCASIONAL]
    ? { [CLAVE_CLIENTE_OCASIONAL]: reciente.datosExtras[CLAVE_CLIENTE_OCASIONAL] }
    : {};
  const formaDePago = cliente?.defaultPaymentMethod
    || comun(grupo.albaranes.map(a => a.paymentMethod))
    || ajustes.defaultPaymentMethod;
  const dias = cliente ? Number(cliente.paymentDays ?? ajustes.defaultPaymentDays) : Number(ajustes.defaultPaymentDays ?? 0);

  const primero = grupo.albaranes[0];
  const factura: Invoice = {
    id: ctx.nuevoId(),
    tipo: 'factura',
    sentido: 'venta',
    number: ctx.numero,
    series: ctx.serie,
    status: InvoiceStatus.BORRADOR,
    clientId: cliente?.id ?? grupo.clientId ?? '',
    clientName: cliente ? (cliente.tradeName || cliente.businessName) : grupo.clientName,
    clientNif: cliente ? cliente.nif : grupo.clientNif,
    clientAddress: cliente ? (direccionFicha || grupo.clientAddress) : grupo.clientAddress,
    issueDate: ctx.hoy,
    dueDate: addDays(ctx.hoy, Number.isFinite(dias) ? dias : 0),
    paymentMethod: formaDePago,
    lineItems,
    subtotal: totales.subtotal,
    totalDiscount: totales.totalDiscount,
    taxBreakdown: totales.taxBreakdown,
    totalTax: totales.totalTax,
    total: totales.total,
    globalDiscountPercent1: grupo.descuentosPie[0] || 0,
    globalDiscountPercent2: grupo.descuentosPie[1] || 0,
    globalDiscountPercent3: grupo.descuentosPie[2] || 0,
    retencionPct: grupo.retencionPct || undefined,
    impuesto: grupo.impuesto,
    obraId: grupo.obraId,
    vendedorId: comun(grupo.albaranes.map(a => a.vendedorId)),
    almacenId: comun(grupo.albaranes.map(a => a.almacenId)),
    tarifaId: comun(grupo.albaranes.map(a => a.tarifaId)),
    // El documento de origen es un albarán: así la base de datos sabe que
    // esta factura no vuelve a sacar la mercancía del stock (ya la sacó el
    // albarán al expedirse, migración 074). Los de la tabla `albaranes` se
    // enlazan al revés, con su `invoice_id`, y no necesitan esto.
    documentoOrigenId: grupo.origen === 'documento' ? primero.id : undefined,
    documentoOrigenNumber: grupo.albaranes.length === 1
      ? primero.number
      : `${primero.number} y ${grupo.albaranes.length - 1} más`,
    notes: notaDeFactura(grupo),
    datosExtras: {
      ...ocasional,
      ...customColsDeLineas(lineItems),
      [CLAVE_ALBARANES]: JSON.stringify(refs),
    },
    esIntracomunitaria: cliente ? esOperacionIntracomunitaria(cliente, ajustes) : false,
    clientVatNumber: cliente?.vatNumber,
    paidAmount: 0,
    paymentRecordIds: [],
    createdAt: ctx.ahora,
    updatedAt: ctx.ahora,
  };
  if (factura.esIntracomunitaria) factura.tipoOperacion349 = tipoOperacion349(factura) || 'E';
  return factura;
}

// ------------------------------------------------------------
// El número
// ------------------------------------------------------------

/**
 * El siguiente número de la serie de facturas de la empresa.
 *
 * Hay dos contadores para lo mismo: el de siempre (`nextInvoiceNumber`,
 * el que usa Nueva factura) y el de la serie `factura_venta` (el que usa
 * Documentos). Cada pantalla avanzaba el suyo, y el que se quedaba atrás
 * proponía un número ya usado. Aquí se coge el mayor de los dos y, por si
 * los dos van atrás, el siguiente al último de esa serie y ese año que ya
 * conozca este equipo: sin conexión no hay servidor que lo corrija.
 */
export function siguienteNumeroDeFactura(
  ajustes: Pick<CompanySettings, 'invoiceSeries' | 'nextInvoiceNumber' | 'seriesDocumentos'>,
  facturas: readonly Pick<Invoice, 'series' | 'number'>[],
  anio: number,
): { serie: string; numero: string; secuencia: number } {
  const serie = ajustes.invoiceSeries || 'FAC';
  const fv = ajustes.seriesDocumentos?.factura_venta;
  const patron = new RegExp(`^${serie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${anio}-(\\d+)$`);
  const ultimo = facturas.reduce((max, f) => {
    if (f.series !== serie) return max;
    const m = patron.exec(f.number || '');
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const secuencia = Math.max(
    Number(ajustes.nextInvoiceNumber || 1),
    fv?.serie === serie ? Number(fv.nextNumber || 1) : 1,
    ultimo + 1,
  );
  return { serie, numero: generateInvoiceNumber(serie, secuencia, anio), secuencia };
}

// ------------------------------------------------------------
// Lo que no deja seguir
// ------------------------------------------------------------

/**
 * Una factura no puede llevar un impuesto distinto del de sus albaranes.
 * La factura coge el régimen que tenga la empresa al guardarse (077), así
 * que un albarán hecho con IVA cuando la empresa ya factura con IGIC (o al
 * revés) saldría con el rótulo cambiado y unos tipos que no son los suyos.
 */
export function impuestoQueNoCasa(grupos: readonly GrupoFactura[], deLaEmpresa: NombreImpuesto): string | null {
  const malos = grupos.flatMap(g => g.albaranes).filter(a => a.impuesto && a.impuesto !== deLaEmpresa);
  if (malos.length === 0) return null;
  const lista = malos.slice(0, 3).map(a => a.number).join(', ') + (malos.length > 3 ? ` y ${malos.length - 3} más` : '');
  return `${lista} se ${malos.length === 1 ? 'hizo' : 'hicieron'} con ${malos[0].impuesto} y tu empresa factura ahora con ${deLaEmpresa}. `
    + 'Revisa sus tipos y haz esa factura a mano: así no sale con el impuesto cambiado.';
}

/**
 * Un fallo a mitad de un lote: las facturas que ya se crearon siguen
 * creadas (y sus albaranes, facturados), y la pantalla tiene que poder
 * decir cuáles son además de qué falló.
 */
export class ErrorAlFacturar extends Error {
  readonly creadas: Invoice[];
  constructor(mensaje: string, creadas: Invoice[] = []) {
    super(mensaje);
    this.name = 'ErrorAlFacturar';
    this.creadas = creadas;
  }
}
