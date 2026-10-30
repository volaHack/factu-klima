/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from './types';
import { deudorDe, deudoresDe, enlaceCorreo, enlaceWhatsApp, textoReclamacion, tonoReclamacion } from './reclamar';

const HOY = '2026-10-27';
const f = (id: string, extra: Record<string, unknown> = {}) => ({
  id, number: id, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, clientId: 'c1', clientName: 'Bar Pepe',
  issueDate: '2026-08-01', dueDate: '2026-09-12', total: 640, subtotal: 640, paidAmount: 0, lineItems: [], ...extra,
}) as any;
const DE = { nombre: 'Taller Sol', telefono: '600 11 22 33', email: 'hola@taller.test', iban: 'ES00 0000  0000 0000' };
const plano = (s: string) => s.replace(/ /g, ' ');

describe('reclamar', () => {
  it('el tono sube con el retraso', () => {
    expect(tonoReclamacion(5)).toBe('amable');
    expect(tonoReclamacion(21)).toBe('amable');
    expect(tonoReclamacion(45)).toBe('firme');
    expect(tonoReclamacion(61)).toBe('ultimo');
  });

  it('junta las vencidas del cliente y deja fuera lo que no ha vencido', () => {
    const docs = [f('F1'), f('F2', { dueDate: '2026-10-20', total: 100, subtotal: 100 }), f('F3', { dueDate: '2026-11-20' }), f('X', { clientId: 'c2' })];
    const d = deudorDe(docs, 'c1', HOY)!;
    expect(d.facturas.map(v => v.factura.number)).toEqual(['F1', 'F2']);
    expect(d.total).toBe(740);
    expect(d.maxRetraso).toBe(45);
    expect(deudorDe([f('F3', { dueDate: '2026-11-20' })], 'c1', HOY)).toBeNull();
    expect(deudoresDe(docs, HOY).map(x => x.clienteId)).toEqual(['c1', 'c2']);
  });

  it('el correo lleva cada factura, sus días de retraso, el total y el IBAN', () => {
    const d = deudorDe([f('F1')], 'c1', HOY)!;
    const t = textoReclamacion(d, DE, 'firme', 'correo');
    expect(t.asunto).toBe('Factura F1 vencida: te pedimos el pago');
    const texto = plano(t.texto);
    expect(texto).toContain('Esta factura lleva 45 días vencida');
    expect(texto).toContain('F1, vencida el 12/09/2026 (hace 45 días): 640,00 €');
    expect(texto).toContain('Total pendiente: 640,00 €');
    expect(texto).toContain('transferencia a ES00 0000 0000 0000');
    expect(texto.endsWith('Taller Sol\n600 11 22 33 · hola@taller.test')).toBe(true);
  });

  it('el WhatsApp es corto y el último aviso pide una fecha sin perder las formas', () => {
    const d = deudorDe([f('F1'), f('F2', { dueDate: '2026-07-01', total: 50, subtotal: 50 })], 'c1', HOY)!;
    const t = textoReclamacion(d, DE, 'ultimo', 'whatsapp');
    expect(t.asunto).toBe('Último aviso: 2 facturas sin pagar');
    const lineas = plano(t.texto).split('\n');
    expect(lineas[0]).toBe('Hola, te escribimos de Taller Sol.');
    expect(lineas).toContain('• F2: 50,00 € (vencida hace 118 días)');
    expect(t.texto).toContain('próximos 7 días');
    expect(lineas.length).toBeLessThanOrEqual(8);
  });

  it('enlaces de WhatsApp y de correo, sólo con datos que sirven', () => {
    expect(enlaceWhatsApp('600 11 22 33', 'a b')).toBe('https://wa.me/34600112233?text=a%20b');
    expect(enlaceWhatsApp('12', 'x')).toBeNull();
    expect(enlaceCorreo('cli@ente.test', { asunto: 'A', texto: 'B C' })).toBe('mailto:cli%40ente.test?subject=A&body=B%20C');
    expect(enlaceCorreo('sin-arroba', { asunto: 'A', texto: 'B' })).toBeNull();
  });
});
