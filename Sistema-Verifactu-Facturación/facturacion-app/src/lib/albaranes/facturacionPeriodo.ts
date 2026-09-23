/**
 * FACTURAR LOS ALBARANES DE UN PERIODO, POR CLIENTE
 *
 * En distribución y reformas se entrega con albarán durante el mes y se
 * factura todo junto al final: una factura por cliente con sus entregas
 * (factura recapitulativa, art. 13 del Reglamento de facturación). Antes
 * había que marcar los albaranes uno a uno; aquí se reúnen solos por
 * cliente y por fechas.
 *
 * Lo que decide esta pieza, sin tocar la base de datos, para poder
 * probarlo entero:
 *   - qué albaranes entran (sólo los expedidos, dentro de las fechas);
 *   - de quién es cada uno —la ficha del cliente, y si no hay ficha, su
 *     NIF o su nombre—, porque agrupar sólo por la ficha metía en UNA
 *     factura a todos los clientes sin ficha;
 *   - en qué orden van las líneas (por fecha de entrega);
 *   - qué se escribe en la factura para que el cliente cuadre cada
 *     albarán con lo que se le cobra, y la fecha de las operaciones, que
 *     el Reglamento exige cuando no coincide con la de la factura.
 */

import type { Albaran, InvoiceLineItem } from '@/lib/types';

export interface Periodo {
  /** AAAA-MM-DD, incluido. */
  desde: string;
  /** AAAA-MM-DD, incluido. */
  hasta: string;
}

export interface GrupoAFacturar {
  clave: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  albaranes: Albaran[];
  total: number;
  /** Fecha de la primera y la última entrega del grupo. */
  primeraEntrega: string;
  ultimaEntrega: string;
}

/** El periodo de un mes («2026-03») de principio a fin. */
export function periodoDelMes(mes: string): Periodo {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { desde: `${ano}-${mm}-01`, hasta: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** De quién es un albarán: la ficha si la hay; si no, el NIF; si no, el nombre. */
export function claveCliente(a: Pick<Albaran, 'clientId' | 'clientNif' | 'clientName'>): string {
  if (a.clientId?.trim()) return `id:${a.clientId.trim()}`;
  const nif = (a.clientNif ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (nif) return `nif:${nif}`;
  return `nombre:${(a.clientName ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function porFechaYNumero(a: Albaran, b: Albaran): number {
  return (a.issueDate || '').localeCompare(b.issueDate || '') || (a.number || '').localeCompare(b.number || '');
}

/**
 * Los albaranes expedidos del periodo, agrupados por cliente y ordenados
 * de más a menos importe. Sin periodo, todos los expedidos.
 */
export function agruparPendientes(albaranes: readonly Albaran[], periodo?: Periodo): GrupoAFacturar[] {
  const grupos = new Map<string, Albaran[]>();
  for (const a of albaranes) {
    if (a.status !== 'expedido') continue;
    if (periodo && (a.issueDate < periodo.desde || a.issueDate > periodo.hasta)) continue;
    const clave = claveCliente(a);
    grupos.set(clave, [...(grupos.get(clave) ?? []), a]);
  }

  return [...grupos.entries()]
    .map(([clave, lista]) => {
      const ordenados = [...lista].sort(porFechaYNumero);
      // Los datos del cliente, del albarán más reciente: si le cambió la
      // dirección a mitad de mes, la factura lleva la de ahora.
      const reciente = ordenados[ordenados.length - 1];
      return {
        clave,
        clientId: reciente.clientId,
        clientName: reciente.clientName,
        clientNif: reciente.clientNif,
        clientAddress: reciente.clientAddress,
        albaranes: ordenados,
        total: redondear(ordenados.reduce((s, a) => s + (a.total || 0), 0)),
        primeraEntrega: ordenados[0].issueDate,
        ultimaEntrega: reciente.issueDate,
      };
    })
    .sort((a, b) => b.total - a.total || a.clientName.localeCompare(b.clientName));
}

/** Las líneas de la factura: las de cada albarán, en orden de entrega. */
export function lineasDelGrupo(grupo: GrupoAFacturar, nuevoId: () => string): InvoiceLineItem[] {
  return grupo.albaranes.flatMap(a => (a.lineItems || []).map(li => ({
    ...li,
    id: nuevoId(),
    // Los tres descuentos, no sólo el primero: copiando a mano se quedaban
    // por el camino y la factura que salía del albarán cobraba de más.
    discountPercent: li.discountPercent,
    discountPercent2: li.discountPercent2 ?? 0,
    discountPercent3: li.discountPercent3 ?? 0,
  })));
}

const fechaEs = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

/**
 * La nota de la factura: qué albaranes recoge, cuánto era cada uno, y la
 * fecha de las operaciones.
 */
export function notaDelGrupo(grupo: GrupoAFacturar): string {
  const operaciones = grupo.primeraEntrega === grupo.ultimaEntrega
    ? `Fecha de la operación: ${fechaEs(grupo.primeraEntrega)}.`
    : `Operaciones realizadas del ${fechaEs(grupo.primeraEntrega)} al ${fechaEs(grupo.ultimaEntrega)}.`;
  const lista = grupo.albaranes
    .map(a => `${a.number} (${fechaEs(a.issueDate)}, ${euros(a.total || 0)})`)
    .join('; ');
  return `${operaciones}\nFactura de ${grupo.albaranes.length === 1 ? 'el albarán' : `los ${grupo.albaranes.length} albaranes`}: ${lista}.`;
}
