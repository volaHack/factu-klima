/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from './types';
import { clientesFrios } from './clientesFrios';
import { sumarDiasIso } from './perfilPago';

const HOY = '2026-10-27';
const ficha = (id: string, extra: Record<string, unknown> = {}) => ({ id, businessName: `Ficha ${id}`, tradeName: '', active: true, ...extra }) as any;
const doc = (cliente: string, dia: string, extra: Record<string, unknown> = {}) => ({
  id: `${cliente}-${dia}`, number: dia, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.PAGADA, clientId: cliente,
  issueDate: dia, total: 100, lineItems: [], ...extra,
}) as any;
/** `n` pedidos cada `cada` días, el último hace `hace` días. */
const ritmo = (cliente: string, n: number, cada: number, hace: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => doc(cliente, sumarDiasIso(HOY, -hace - (n - 1 - i) * cada), extra));

describe('clientes que se enfrían', () => {
  it('avisa del que pide cada 9 días y lleva 23 sin pedir', () => {
    const frios = clientesFrios(ritmo('pepe', 6, 9, 23, { total: 80 }), [ficha('pepe', { tradeName: 'Bar Pepe' })], HOY);
    expect(frios).toHaveLength(1);
    expect(frios[0]).toMatchObject({ nombre: 'Bar Pepe', cadaDias: 9, diasSinPedir: 23, ticketMedio: 80, veces: 2.6 });
    expect(frios[0].texto).toBe('Pide cada 9 días, lleva 23 sin pedir');
  });

  it('no avisa de quien va a su ritmo, ni de un hábito que no lo es', () => {
    const docs = [...ritmo('a', 6, 9, 10), ...ritmo('b', 3, 9, 40)];
    expect(clientesFrios(docs, [ficha('a'), ficha('b')], HOY)).toEqual([]);
  });

  it('a quien pide cada dos días, cuatro sin pedir es un puente', () => {
    expect(clientesFrios(ritmo('a', 10, 2, 5), [ficha('a')], HOY)).toEqual([]);
    expect(clientesFrios(ritmo('a', 10, 2, 9), [ficha('a')], HOY)).toHaveLength(1);
  });

  it('la mediana aguanta unas vacaciones', () => {
    const docs = [...ritmo('a', 5, 7, 60), ...ritmo('a', 4, 7, 15)];
    expect(clientesFrios(docs, [ficha('a')], HOY)[0].cadaDias).toBe(7);
  });

  it('fuera los que ya se fueron, los ocasionales, los presupuestos y lo del mismo día', () => {
    expect(clientesFrios(ritmo('a', 6, 9, 200), [ficha('a')], HOY)).toEqual([]);
    expect(clientesFrios(ritmo('a', 6, 9, 23), [ficha('a', { isWalkIn: true })], HOY)).toEqual([]);
    expect(clientesFrios(ritmo('a', 6, 9, 23, { tipo: 'presupuesto' }), [ficha('a')], HOY)).toEqual([]);
    const mismoDia = [...ritmo('a', 3, 9, 23), doc('a', sumarDiasIso(HOY, -23), { tipo: 'albaran', id: 'alb' })];
    expect(clientesFrios(mismoDia, [ficha('a')], HOY)).toEqual([]);
  });

  it('primero el que más dinero se juega', () => {
    const docs = [...ritmo('poco', 6, 9, 30, { total: 20 }), ...ritmo('mucho', 6, 9, 23, { total: 900 })];
    expect(clientesFrios(docs, [ficha('poco'), ficha('mucho')], HOY).map(c => c.clienteId)).toEqual(['mucho', 'poco']);
  });
});
