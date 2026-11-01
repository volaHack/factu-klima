/**
 * LO QUE HACEN LOS DOS BOTONES DE LA COLA DEL ALMACÉN
 *
 * Nada nuevo: cada botón llama a la misma función de storage que ya usa la
 * ficha del documento, así que guardan igual con y sin conexión (lo que no
 * sube se queda en la cola de sincronización) y la base de datos mueve el
 * stock donde siempre. No se emite ninguna factura.
 *
 *   «Preparado»  pone (o quita) la marca en `datosExtras` y guarda el
 *                documento tal cual: ni estado ni stock cambian.
 *   «Entregado»  un albarán: se expide (expedirAlbaranVenta o, si es de la
 *                pantalla «Albaranes», expedirAlbaran). Es lo que descuenta
 *                el stock, los lotes y los números de serie.
 *                un pedido: no tiene estado de entregado, así que sale con
 *                su albarán, como con «Convertir en Albarán», sólo con lo
 *                que falta, y ese albarán se expide.
 */

import {
  saveDocumento, saveAlbaran, expedirAlbaranVenta, expedirAlbaran, getCompanySettings, getInvoices,
} from './storage';
import { actualizarContadorSerie } from './documentos';
import { albaranDeEntrega, conMarcaPreparado, type MarcaPreparado, type PedidoEnCola } from './prepararPedidos';
import type { Albaran, Invoice } from './types';
import { getToday } from './utils';

export interface DatosDeLaCola {
  documentos: readonly Invoice[];
  albaranes: readonly Albaran[];
}

function buscar(p: PedidoEnCola, datos: DatosDeLaCola): Invoice | Albaran {
  const d = p.origen === 'documento'
    ? datos.documentos.find(x => x.id === p.id)
    : datos.albaranes.find(x => x.id === p.id);
  if (!d) throw new Error(`No se encuentra ${p.numero}. Vuelve a cargar la pantalla.`);
  return d;
}

/** Pone la marca de preparado, o la quita con `null`. */
export async function marcarPreparado(p: PedidoEnCola, datos: DatosDeLaCola, marca: MarcaPreparado | null): Promise<void> {
  const d = buscar(p, datos);
  const datosExtras = conMarcaPreparado(d.datosExtras, marca);
  if (p.origen === 'documento') await saveDocumento({ ...(d as Invoice), datosExtras, updatedAt: new Date().toISOString() });
  else await saveAlbaran({ ...(d as Albaran), datosExtras, updatedAt: new Date().toISOString() });
}

/** Lo entrega. Devuelve el número del albarán que queda expedido. */
export async function marcarEntregado(p: PedidoEnCola, datos: DatosDeLaCola): Promise<string> {
  const d = buscar(p, datos);
  if (p.origen === 'albaran') return (await expedirAlbaran(d.id)).number;
  if (p.tipo === 'albaran') return (await expedirAlbaranVenta(d.id)).number;

  // Lo servido, con los documentos de ahora y no con los que la pantalla
  // cargó: si el pedido acaba de salir con su albarán (otro toque, otro
  // equipo) y la cola aún no se ha repintado, con la foto vieja saldría un
  // segundo albarán con lo mismo y el stock se descontaría dos veces.
  const [settings, ahora] = await Promise.all([getCompanySettings(), getInvoices().catch(() => [] as Invoice[])]);
  const documentos = ahora.length ? ahora : datos.documentos;
  const pedido = (documentos.find(x => x.id === d.id) ?? d) as Invoice;
  const albaran = albaranDeEntrega(pedido, documentos, settings, getToday());
  if (albaran.lineItems.length === 0) throw new Error(`Al pedido ${p.numero} ya no le queda nada por servir.`);
  const guardado = await saveDocumento(albaran);
  await actualizarContadorSerie(settings, 'albaran_venta', guardado.number);
  return (await expedirAlbaranVenta(guardado.id)).number;
}
