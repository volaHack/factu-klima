import { describe, expect, it } from 'vitest';
import { InvoiceStatus, type Gasto, type Invoice } from '../types';
import type { TareaHoy } from '../panelHoy';
import { mesAnteriorA, resumenDelMes } from './resumen';
import { avisosImportantes, huellaAvisos, tocaAvisar } from './avisos';
import { correoAvisos, correoResumen } from './correos';

function f(over: Partial<Invoice>): Invoice {
  return {
    id: Math.random().toString(36).slice(2), number: 'F-1', series: 'F', clientId: 'c1', clientName: 'Bar Paco',
    issueDate: '2026-09-10', dueDate: '2026-10-10', status: InvoiceStatus.EMITIDA, total: 100, paidAmount: 0,
    lineItems: [], subtotal: 100, totalTax: 0, taxBreakdown: [], tipo: 'factura', sentido: 'venta', ...over,
  } as Invoice;
}
const g = (fecha: string, total: number) => ({ id: fecha + total, fecha, total, concepto: 'x' } as Gasto);

describe('mesAnteriorA', () => {
  it('el mes que acaba de terminar', () => {
    expect(mesAnteriorA(new Date(2026, 9, 1, 9))).toBe('2026-09');
    expect(mesAnteriorA(new Date(2026, 0, 3, 9))).toBe('2025-12');
  });
});

describe('resumenDelMes', () => {
  const facturas = [
    f({ issueDate: '2026-09-02', total: 1000, clientName: 'Hotel Sol', status: InvoiceStatus.PAGADA, paidDate: '2026-09-20' }),
    f({ issueDate: '2026-09-15', total: 500, clientName: 'Bar Paco', status: InvoiceStatus.EMITIDA, dueDate: '2026-10-15' }),
    f({ issueDate: '2026-09-20', total: 300, clientName: 'Hotel Sol', status: InvoiceStatus.VENCIDA, dueDate: '2026-09-25', number: 'F-9' }),
    f({ issueDate: '2026-09-21', total: 999, status: InvoiceStatus.BORRADOR }),
    f({ issueDate: '2026-09-22', total: 888, status: InvoiceStatus.ANULADA }),
    f({ issueDate: '2026-08-10', total: 1200, status: InvoiceStatus.PAGADA, paidDate: '2026-08-30' }),
  ];
  const r = resumenDelMes(facturas, [g('2026-09-05', 200), g('2026-09-30', 50), g('2026-08-01', 999)], '2026-09', new Date(2026, 9, 1, 9));

  it('facturado y nº de facturas del mes, sin borradores ni anuladas', () => {
    expect(r.facturado).toBe(1800);
    expect(r.facturas).toBe(3);
  });
  it('comparado con el mes anterior', () => {
    expect(r.anterior).toBe(1200);
    expect(r.variacion).toBe(50);
  });
  it('cobrado en el mes y gastos del mes', () => {
    expect(r.cobrado).toBe(1000);
    expect(r.gastos).toBe(250);
  });
  it('pendiente de cobro y vencido a día de hoy', () => {
    expect(r.pendiente).toBe(800);
    expect(r.vencido).toBe(300);
    expect(r.vencidas[0]).toMatchObject({ numero: 'F-9', cliente: 'Hotel Sol', total: 300 });
  });
  it('mejores clientes del mes', () => {
    expect(r.mejoresClientes[0]).toEqual({ nombre: 'Hotel Sol', total: 1300 });
  });
  it('nombre del mes en castellano', () => {
    expect(r.nombreMes).toBe('septiembre de 2026');
  });
  it('un mes sin nada no rompe y no inventa porcentajes', () => {
    const vacio = resumenDelMes([], [], '2026-09', new Date(2026, 9, 1));
    expect(vacio.facturado).toBe(0);
    expect(vacio.variacion).toBeNull();
  });
});

const tarea = (id: string, tono: TareaHoy['tono'], titulo = id): TareaHoy => ({ id, tono, titulo, detalle: '', href: '/x', accion: 'Ver' });

describe('avisos por correo', () => {
  it('sólo lo urgente o importante (no lo informativo)', () => {
    expect(avisosImportantes([tarea('a', 'peligro'), tarea('b', 'info'), tarea('c', 'aviso')]).map(t => t.id)).toEqual(['a', 'c']);
  });
  it('la huella cambia si cambia lo que se avisa', () => {
    expect(huellaAvisos([tarea('a', 'peligro', '3 vencidas')])).not.toBe(huellaAvisos([tarea('a', 'peligro', '4 vencidas')]));
  });
  it('se avisa si hay algo nuevo; si es lo mismo, como mucho una vez por semana', () => {
    const ahora = new Date('2026-10-11T07:00:00Z');
    expect(tocaAvisar({ importantes: 1, huella: 'x', ultimaHuella: null, ultimoEn: null, ahora })).toBe(true);
    expect(tocaAvisar({ importantes: 1, huella: 'x', ultimaHuella: 'x', ultimoEn: '2026-10-08T07:00:00Z', ahora })).toBe(false);
    expect(tocaAvisar({ importantes: 1, huella: 'x', ultimaHuella: 'x', ultimoEn: '2026-10-04T07:00:00Z', ahora })).toBe(true);
    expect(tocaAvisar({ importantes: 1, huella: 'y', ultimaHuella: 'x', ultimoEn: '2026-10-10T07:00:00Z', ahora })).toBe(true);
    expect(tocaAvisar({ importantes: 0, huella: '', ultimaHuella: 'x', ultimoEn: null, ahora })).toBe(false);
  });
});

describe('correos', () => {
  const urls = { app: 'https://klimafacturas.com', baja: 'https://klimafacturas.com/api/correos/baja?t=abc' };
  it('resumen: asunto con el mes y cifras', () => {
    const r = resumenDelMes([f({ issueDate: '2026-09-02', total: 1000 })], [], '2026-09', new Date(2026, 9, 1));
    const c = correoResumen(r, { empresa: 'Distribuciones <Sol>', nombre: 'Ana' }, urls);
    expect(c.asunto.replace(/\u00a0/g, ' ')).toBe('Tu septiembre de 2026 en KlimaFacturas: 1.000,00 € facturados');
    expect(c.html).toContain('Distribuciones &lt;Sol&gt;');
    expect(c.html).toContain('Dejar de recibir estos correos');
    expect(c.texto.replace(/\u00a0/g, ' ')).toContain('Facturado: 1.000,00 €');
  });
  it('avisos: uno por tarea, con su enlace a la app', () => {
    const c = correoAvisos([tarea('vencidas', 'peligro', '3 facturas vencidas sin cobrar')], { empresa: 'Sol', nombre: null }, urls);
    expect(c.asunto).toBe('KlimaFacturas: 3 facturas vencidas sin cobrar');
    expect(c.html).toContain('https://klimafacturas.com/x');
  });
  it('avisos: con varias, el asunto las cuenta', () => {
    const c = correoAvisos([tarea('a', 'peligro', 'Uno'), tarea('b', 'aviso', 'Dos')], { empresa: 'Sol', nombre: null }, urls);
    expect(c.asunto).toBe('KlimaFacturas: 2 cosas que mirar hoy');
  });
});
