/**
 * CADENAS Y CENTRALES DE COMPRA
 *
 * Cinco sucursales que facturan cada una por su lado son cinco clientes,
 * pero para negociar condiciones o para saber quién pesa más en la cartera
 * lo que importa es el volumen conjunto de la cadena entera.
 */

import type { Client, Invoice } from './types';

export interface ResumenGrupo {
  grupoId: string;
  nombre: string;
  numClientes: number;
  facturado: number;
  numFacturas: number;
}

/** Los clientes que pertenecen a un grupo. */
export function clientesDelGrupo(grupoId: string, clients: Client[]): Client[] {
  return clients.filter(c => c.grupoId === grupoId);
}

/** Lo facturado a todos los clientes de un grupo, sumado como si fuera uno solo. */
export function facturadoDeGrupo(
  grupoId: string,
  clients: Client[],
  invoices: Invoice[],
  opciones: { desde?: string; hasta?: string } = {},
): { facturado: number; numFacturas: number } {
  const idsDelGrupo = new Set(clientesDelGrupo(grupoId, clients).map(c => c.id));
  const facturas = invoices
    .filter(inv => idsDelGrupo.has(inv.clientId))
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => (inv.sentido ?? 'venta') === 'venta')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada')
    .filter(inv => !opciones.desde || inv.issueDate >= opciones.desde)
    .filter(inv => !opciones.hasta || inv.issueDate <= opciones.hasta);

  return {
    facturado: redondear(facturas.reduce((s, f) => s + f.total, 0)),
    numFacturas: facturas.length,
  };
}

/** El resumen de todos los grupos, el que más factura primero. */
export function resumenGrupos(
  grupos: { id: string; nombre: string }[],
  clients: Client[],
  invoices: Invoice[],
  opciones: { desde?: string; hasta?: string } = {},
): ResumenGrupo[] {
  return grupos
    .map(g => {
      const { facturado, numFacturas } = facturadoDeGrupo(g.id, clients, invoices, opciones);
      return {
        grupoId: g.id,
        nombre: g.nombre,
        numClientes: clientesDelGrupo(g.id, clients).length,
        facturado,
        numFacturas,
      };
    })
    .sort((a, b) => b.facturado - a.facturado);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
