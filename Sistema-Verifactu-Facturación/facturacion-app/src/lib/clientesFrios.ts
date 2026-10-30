/**
 * CLIENTES QUE SE ESTÁN ENFRIANDO
 *
 * El cliente que se va no avisa: deja de pedir. El bar que pedía cada nueve
 * días lleva tres semanas sin llamar y nadie lo nota hasta que, a fin de
 * trimestre, las ventas no cuadran. Esto lo nota a tiempo: compara lo que
 * lleva sin pedir con su ritmo de siempre.
 *
 *   · Su ritmo es la MEDIANA de los días entre pedido y pedido, no la
 *     media: un mes de vacaciones no debe hacer creer que pide cada seis
 *     semanas.
 *   · Hace falta un hábito para hablar de él: cuatro pedidos (tres huecos)
 *     en el último año. Dos facturas sueltas no son un ritmo.
 *   · Se avisa cuando lleva el doble de su ritmo, y al menos una semana más
 *     de lo normal: a quien pide cada dos días, cuatro sin pedir es un
 *     puente, no una alarma.
 *   · Pasados seis meses ya no se está enfriando, se ha ido: eso es otra
 *     conversación y no llena el panel de nombres antiguos.
 *
 * Cuentan los pedidos de verdad: facturas, albaranes y pedidos de venta
 * (ni presupuestos, ni borradores, ni anulados, ni tickets del TPV, que no
 * tienen cliente fijo), y varios documentos el mismo día son un pedido.
 */

import { InvoiceStatus, type Client, type Invoice } from './types';
import { diaLocal, diasEntreDias, restarMesesIso } from './perfilPago';

export interface ClienteFrio {
  clienteId: string;
  nombre: string;
  /** Su ritmo habitual, en días. */
  cadaDias: number;
  diasSinPedir: number;
  ultimoPedido: string;
  /** Lo que suele pedir cada vez (total medio por pedido del último año). */
  ticketMedio: number;
  /** Cuántas veces su ritmo lleva sin pedir. */
  veces: number;
  /** «Pide cada 9 días, lleva 23 sin pedir». */
  texto: string;
}

const MINIMO_PEDIDOS = 4;
const VECES_PARA_AVISAR = 2;
const DIAS_DE_MAS = 7;
const MESES_PARA_DARLO_POR_IDO = 6;

const QUE_CUENTA = new Set(['factura', 'albaran', 'pedido']);
const NO_CUENTA: readonly string[] = [InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO, InvoiceStatus.PRE_APROBACION];

function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function clientesFrios(docs: readonly Invoice[], clientes: readonly Client[], hoy: string): ClienteFrio[] {
  const desde = restarMesesIso(hoy, 12);
  const ido = restarMesesIso(hoy, MESES_PARA_DARLO_POR_IDO);
  const fichas = new Map(clientes.map(c => [c.id, c]));

  const porCliente = new Map<string, { dias: Map<string, number> }>();
  for (const d of docs) {
    if (!d.clientId || d.sentido === 'compra' || d.posSessionId || d.cancelledAt) continue;
    if (!QUE_CUENTA.has(d.tipo ?? 'factura') || NO_CUENTA.includes(d.status)) continue;
    const dia = diaLocal(d.issueDate);
    if (!dia || dia < desde || dia > hoy) continue;
    const c = porCliente.get(d.clientId) ?? { dias: new Map<string, number>() };
    // Un albarán y su factura del mismo día son el mismo pedido: se cuenta el mayor.
    c.dias.set(dia, Math.max(c.dias.get(dia) ?? 0, d.total || 0));
    porCliente.set(d.clientId, c);
  }

  const out: ClienteFrio[] = [];
  for (const [id, c] of porCliente) {
    const ficha = fichas.get(id);
    if (!ficha || ficha.isWalkIn || ficha.esProveedor || ficha.active === false) continue;
    const dias = [...c.dias.keys()].sort();
    if (dias.length < MINIMO_PEDIDOS) continue;
    const ultimo = dias[dias.length - 1];
    if (ultimo < ido) continue;

    const huecos = dias.slice(1).map((d, i) => diasEntreDias(dias[i], d));
    const cadaDias = Math.max(1, Math.round(mediana(huecos)));
    const diasSinPedir = diasEntreDias(ultimo, hoy);
    if (diasSinPedir < cadaDias * VECES_PARA_AVISAR || diasSinPedir < cadaDias + DIAS_DE_MAS) continue;

    const importes = [...c.dias.values()];
    out.push({
      clienteId: id,
      nombre: ficha.tradeName || ficha.businessName,
      cadaDias,
      diasSinPedir,
      ultimoPedido: ultimo,
      ticketMedio: Math.round((importes.reduce((s, x) => s + x, 0) / importes.length) * 100) / 100,
      veces: Math.round((diasSinPedir / cadaDias) * 10) / 10,
      texto: `Pide cada ${cadaDias} ${cadaDias === 1 ? 'día' : 'días'}, lleva ${diasSinPedir} sin pedir`,
    });
  }
  // Primero lo que más se juega: lo que deja de entrar por cada ritmo perdido.
  return out.sort((a, b) => (b.ticketMedio * (b.diasSinPedir / b.cadaDias)) - (a.ticketMedio * (a.diasSinPedir / a.cadaDias)));
}
