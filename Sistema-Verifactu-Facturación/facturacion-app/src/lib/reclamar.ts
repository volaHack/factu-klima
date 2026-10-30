/**
 * RECLAMAR UN COBRO EN UN TOQUE
 *
 * Los recordatorios (`recordatorios/textos.ts`) ya saben qué facturas están
 * vencidas y a quién; sus textos son los del envío automático y se quedan,
 * a propósito, en un recordatorio: el programa no reclama solo. Esto es lo
 * que se manda cuando RECLAMA LA PERSONA, desde la ficha del cliente o desde
 * «Para hoy»: el mismo cálculo de vencidas, con un tono que puede subir
 * hasta el último aviso, y en dos tamaños:
 *
 *   · correo: con asunto, el detalle de cada factura y el IBAN;
 *   · WhatsApp: corto, que se lea en la pantalla del móvil sin desplazar.
 *
 * El tono sale del retraso de la más antigua, pero es una propuesta: quien
 * reclama conoce al cliente y lo puede cambiar antes de mandarlo. Todos son
 * educados; el último aviso es firme y deja la puerta abierta a hablarlo.
 */

import type { Invoice } from './types';
import {
  EMAIL_VALIDO, porCliente, telefonoWhatsApp, vencidas, type Deudor, type Remitente,
} from './recordatorios/textos';

export type TonoReclamacion = 'amable' | 'firme' | 'ultimo';
export type CanalReclamacion = 'correo' | 'whatsapp';

export const TONOS: { id: TonoReclamacion; nombre: string }[] = [
  { id: 'amable', nombre: 'Amable' },
  { id: 'firme', nombre: 'Firme' },
  { id: 'ultimo', nombre: 'Último aviso' },
];

/** Hasta tres semanas, amable; hasta dos meses, firme; después, último aviso. */
export function tonoReclamacion(maxRetraso: number): TonoReclamacion {
  if (maxRetraso > 60) return 'ultimo';
  if (maxRetraso > 21) return 'firme';
  return 'amable';
}

/** Lo que un cliente tiene vencido hoy, junto (o null si no tiene nada). */
export function deudorDe(docs: readonly Invoice[], clienteId: string, hoy: string): Deudor | null {
  return porCliente(vencidas(docs.filter(d => d.clientId === clienteId), hoy))[0] ?? null;
}

/** Todos los que deben algo vencido, del retraso más largo al más corto. */
export function deudoresDe(docs: readonly Invoice[], hoy: string): Deudor[] {
  return porCliente(vencidas([...docs], hoy));
}

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n);
const fecha = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export interface TextoReclamacion { asunto: string; texto: string }

export function textoReclamacion(d: Deudor, de: Remitente, tono: TonoReclamacion, canal: CanalReclamacion): TextoReclamacion {
  const una = d.facturas.length === 1;
  const numeros = d.facturas.map(v => v.factura.number).join(', ');
  const asunto = {
    amable: una ? `Factura ${numeros} pendiente de pago` : `${d.facturas.length} facturas pendientes de pago`,
    firme: una ? `Factura ${numeros} vencida: te pedimos el pago` : `${d.facturas.length} facturas vencidas: te pedimos el pago`,
    ultimo: una ? `Último aviso: factura ${numeros} sin pagar` : `Último aviso: ${d.facturas.length} facturas sin pagar`,
  }[tono];

  const entrada = {
    amable: una
      ? 'Te escribimos porque esta factura ya ha vencido y todavía no nos consta el pago:'
      : 'Te escribimos porque estas facturas ya han vencido y todavía no nos consta el pago:',
    firme: una
      ? `Esta factura lleva ${dias(d.maxRetraso)} vencida y seguimos sin recibir el pago:`
      : `Estas facturas siguen sin pagar; la más antigua lleva ${dias(d.maxRetraso)} vencida:`,
    ultimo: una
      ? `Te escribimos por última vez por esta factura, que lleva ${dias(d.maxRetraso)} vencida:`
      : `Te escribimos por última vez por estas facturas; la más antigua lleva ${dias(d.maxRetraso)} vencida:`,
  }[tono];

  const cierre = {
    amable: 'Si ya está pagado, no hace falta que hagas nada, y perdona la molestia.',
    firme: 'Te pedimos que lo revises y nos digas cuándo podemos contar con el pago. Si hay algún problema con la factura, cuéntanoslo y lo resolvemos.',
    ultimo: 'Necesitamos que nos confirmes una fecha de pago en los próximos 7 días. Si no tenemos noticias, tendremos que gestionarlo por otra vía, y preferimos resolverlo hablando contigo.',
  }[tono];

  const iban = de.iban?.replace(/\s+/g, ' ').trim();

  if (canal === 'whatsapp') {
    const lineas = [
      `Hola, te escribimos de ${de.nombre || 'nuestra parte'}.`,
      entrada,
      ...d.facturas.map(v => `• ${v.factura.number}: ${euros(v.pendiente)} (vencida hace ${dias(v.diasRetraso)})`),
      `Total: ${euros(d.total)}${iban ? `. IBAN: ${iban}` : ''}`,
      cierre,
      'Gracias.',
    ];
    return { asunto, texto: lineas.join('\n') };
  }

  const lineas = [
    'Hola:',
    '',
    entrada,
    '',
    ...d.facturas.map(v => `  · ${v.factura.number}, vencida el ${fecha(v.factura.dueDate)} (hace ${dias(v.diasRetraso)}): ${euros(v.pendiente)}`),
    '',
    `Total pendiente: ${euros(d.total)}`,
  ];
  if (iban) lineas.push('', `Puedes pagar por transferencia a ${iban}, indicando el número de factura.`);
  lineas.push('', cierre, '', 'Un saludo,', de.nombre);
  if (de.telefono || de.email) lineas.push([de.telefono, de.email].filter(Boolean).join(' · '));
  return { asunto, texto: lineas.join('\n') };
}

/** Enlace de WhatsApp con el texto puesto, o null si el teléfono no sirve. */
export function enlaceWhatsApp(telefono: string | undefined, texto: string): string | null {
  const tel = telefonoWhatsApp(telefono);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null;
}

/** Enlace `mailto:` con asunto y cuerpo, o null si el correo no es válido. */
export function enlaceCorreo(email: string | undefined, t: TextoReclamacion): string | null {
  const e = email?.trim();
  if (!e || !EMAIL_VALIDO.test(e)) return null;
  return `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(t.asunto)}&body=${encodeURIComponent(t.texto)}`;
}
