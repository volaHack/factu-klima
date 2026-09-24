/**
 * RECORDATORIOS DE COBRO
 *
 * Qué facturas están vencidas, a quién hay que recordárselo y con qué
 * palabras. Sin dependencias del navegador ni del servidor: lo usan la
 * pantalla y el envío automático diario.
 *
 * Un mensaje por cliente, con todas sus facturas vencidas juntas: tres
 * correos el mismo día por tres facturas del mismo cliente son un mal
 * recordatorio. El tono sube con el retraso, sin llegar a reclamar: eso ya
 * es cosa de la persona, no del programa.
 */

import { totalAPagar } from '../retenciones';

/** Lo mínimo de una factura que hace falta aquí (vale la del programa y la fila de la base de datos ya mapeada). */
export interface FacturaCobro {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  subtotal: number;
  retencionPct?: number;
  paidAmount?: number;
  sentido?: string;
  tipo?: string;
  cancelledAt?: string;
  posSessionId?: string;
}

export interface Vencida {
  factura: FacturaCobro;
  diasRetraso: number;
  pendiente: number;
}

export interface Deudor {
  clienteId: string;
  cliente: string;
  facturas: Vencida[];
  total: number;
  /** El retraso de la más antigua. */
  maxRetraso: number;
}

export type Tono = 'amable' | 'recordatorio' | 'firme';

const r2 = (n: number) => Math.round(n * 100) / 100;
const ESTADOS = new Set(['emitida', 'pendiente', 'vencida', 'parcial']);

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
}

export function vencidas(facturas: FacturaCobro[], hoy: string): Vencida[] {
  const out: Vencida[] = [];
  for (const f of facturas) {
    if (f.sentido === 'compra' || (f.tipo && f.tipo !== 'factura') || f.cancelledAt || f.posSessionId) continue;
    if (!ESTADOS.has(String(f.status)) || !f.dueDate || f.dueDate >= hoy) continue;
    const pendiente = r2(totalAPagar(f.total, f.subtotal, f.retencionPct) - (f.paidAmount || 0));
    if (pendiente <= 0.009) continue;
    out.push({ factura: f, diasRetraso: diasEntre(f.dueDate, hoy), pendiente });
  }
  return out.sort((a, b) => b.diasRetraso - a.diasRetraso);
}

export function porCliente(lista: Vencida[]): Deudor[] {
  const mapa = new Map<string, Deudor>();
  for (const v of lista) {
    const k = v.factura.clientId || v.factura.clientName;
    const d = mapa.get(k) ?? { clienteId: v.factura.clientId, cliente: v.factura.clientName, facturas: [], total: 0, maxRetraso: 0 };
    d.facturas.push(v);
    d.total = r2(d.total + v.pendiente);
    d.maxRetraso = Math.max(d.maxRetraso, v.diasRetraso);
    mapa.set(k, d);
  }
  return [...mapa.values()].sort((a, b) => b.maxRetraso - a.maxRetraso || b.total - a.total);
}

export function tonoDe(maxRetraso: number): Tono {
  if (maxRetraso > 45) return 'firme';
  if (maxRetraso > 15) return 'recordatorio';
  return 'amable';
}

export interface Remitente {
  nombre: string;
  email?: string;
  telefono?: string;
  iban?: string;
}

const euros = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = (iso: string) => iso.split('-').reverse().join('/');

/** Asunto y texto del recordatorio para un cliente. */
export function mensaje(d: Deudor, de: Remitente): { asunto: string; texto: string } {
  const tono = tonoDe(d.maxRetraso);
  const una = d.facturas.length === 1;
  const numeros = d.facturas.map(v => v.factura.number).join(', ');
  const asunto = {
    amable: una ? `Factura ${numeros} pendiente de pago` : `Facturas pendientes de pago (${d.facturas.length})`,
    recordatorio: una ? `Recordatorio: factura ${numeros} vencida` : `Recordatorio: ${d.facturas.length} facturas vencidas`,
    firme: una ? `Segundo aviso: factura ${numeros} sin pagar` : `Segundo aviso: ${d.facturas.length} facturas sin pagar`,
  }[tono];

  const detalle = d.facturas
    .map(v => `  · ${v.factura.number}, vencida el ${fecha(v.factura.dueDate)}: ${euros(v.pendiente)}`)
    .join('\n');

  const entrada = {
    amable: una
      ? `Te escribimos porque la factura ${numeros} venció hace unos días y aún no nos consta el pago:`
      : 'Te escribimos porque estas facturas ya han vencido y aún no nos consta el pago:',
    recordatorio: una
      ? 'Te recordamos que la siguiente factura sigue pendiente:'
      : 'Te recordamos que las siguientes facturas siguen pendientes:',
    firme: una
      ? `La siguiente factura lleva más de ${d.maxRetraso} días vencida y seguimos sin recibir el pago:`
      : `Las siguientes facturas siguen sin pagar; la más antigua lleva ${d.maxRetraso} días vencida:`,
  }[tono];

  const cierre = {
    amable: 'Si ya lo habéis pagado, no hagáis caso de este mensaje, y perdonad la molestia.',
    recordatorio: 'Si ya está pagado, te agradecemos que nos envíes el justificante para localizarlo.',
    firme: 'Te pedimos que lo reviséis y nos digáis cuándo podemos contar con el pago. Si hay algún problema con la factura, háblanos y lo resolvemos.',
  }[tono];

  const lineas = [
    'Hola:',
    '',
    entrada,
    '',
    detalle,
    '',
    `Total pendiente: ${euros(d.total)}`,
  ];
  if (de.iban) lineas.push('', `Puedes pagar por transferencia a ${de.iban.replace(/\s+/g, ' ').trim()}, indicando el número de factura.`);
  lineas.push('', cierre, '', 'Un saludo,', de.nombre);
  if (de.telefono || de.email) lineas.push([de.telefono, de.email].filter(Boolean).join(' · '));
  return { asunto, texto: lineas.join('\n') };
}

/** ¿Toca otro recordatorio? El primero, tras `primeroTras` días de retraso; los demás, cada `cada` días. */
export function toca(d: Deudor, ultimo: string | undefined, hoy: string, cada: number, primeroTras: number): boolean {
  if (!ultimo) return d.maxRetraso >= primeroTras;
  return diasEntre(ultimo.slice(0, 10), hoy) >= cada;
}

/** «+34 600 12 34 56» o «600123456» → «34600123456», para wa.me. */
export function telefonoWhatsApp(telefono: string | undefined): string | null {
  if (!telefono) return null;
  let t = telefono.replace(/[^\d+]/g, '');
  if (t.startsWith('+')) t = t.slice(1);
  else if (t.startsWith('00')) t = t.slice(2);
  else if (/^[6789]\d{8}$/.test(t)) t = '34' + t;
  return /^\d{8,15}$/.test(t) ? t : null;
}

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
