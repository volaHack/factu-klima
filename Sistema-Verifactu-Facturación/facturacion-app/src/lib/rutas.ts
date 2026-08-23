/**
 * LA HOJA DE LA JORNADA
 *
 * Qué hay que llevar y a quién, agrupado por ruta. Lo que hace falta para
 * salir con el reparto sin tener que ir mirando factura por factura.
 */

import type { Client, Invoice, RutaReparto } from './types';

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Los clientes de una ruta. */
export function clientesDeRuta(rutaId: string, clients: Client[]): Client[] {
  return clients.filter(c => c.rutaId === rutaId);
}

/**
 * Los albaranes que quedan por repartir en una ruta.
 *
 * Un albarán en borrador todavía no ha salido de puerta —EXPEDIDO es el
 * estado que dice que ya se entregó y que el stock se movió—, así que
 * «pendiente de repartir» es exactamente eso: albaranes de venta en
 * borrador de los clientes de la ruta.
 */
export function albaranesPendientesDeRuta(rutaId: string, clients: Client[], invoices: Invoice[]): Invoice[] {
  const idsDeLaRuta = new Set(clientesDeRuta(rutaId, clients).map(c => c.id));
  return invoices
    .filter(inv => inv.tipo === 'albaran')
    .filter(inv => (inv.sentido ?? 'venta') === 'venta')
    .filter(inv => inv.status === 'borrador')
    .filter(inv => idsDeLaRuta.has(inv.clientId))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/** Cuántas paradas y cuánto género (en importe) lleva la hoja de una ruta. */
export function resumenDeRuta(rutaId: string, clients: Client[], invoices: Invoice[]): { paradas: number; importe: number } {
  const albaranes = albaranesPendientesDeRuta(rutaId, clients, invoices);
  // Una parada por cliente, no por albarán: un cliente con dos albaranes es
  // una sola visita del camión.
  const clientesConReparto = new Set(albaranes.map(a => a.clientId));
  return {
    paradas: clientesConReparto.size,
    importe: Math.round(albaranes.reduce((s, a) => s + a.total, 0) * 100) / 100,
  };
}
