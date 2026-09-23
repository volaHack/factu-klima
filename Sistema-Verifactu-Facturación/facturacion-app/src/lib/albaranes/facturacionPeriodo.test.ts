import { describe, it, expect } from 'vitest';

import { agruparPendientes, claveCliente, lineasDelGrupo, notaDelGrupo, periodoDelMes } from './facturacionPeriodo';
import type { Albaran } from '@/lib/types';

function albaran(p: Partial<Albaran> & { number: string; issueDate: string }): Albaran {
  return {
    id: p.number, series: 'ALB', clientId: '', clientName: 'Cliente', clientNif: '', clientAddress: '',
    status: 'expedido', subtotal: 0, totalDiscount: 0, taxBreakdown: [], totalTax: 0, total: 100,
    notes: '', createdAt: '', updatedAt: '',
    lineItems: [{
      id: 'l-' + p.number, productId: 'p', productName: 'Saco de cemento', productRef: '', quantity: 1,
      unitPrice: 100, unit: 'ud', taxRate: 7, discountPercent: 10, discountPercent2: 5,
      subtotal: 100, taxAmount: 7, total: 107,
    }],
    ...p,
  } as Albaran;
}

describe('periodo de un mes', () => {
  it('va del 1 al último día, también en febrero bisiesto', () => {
    expect(periodoDelMes('2026-03')).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(periodoDelMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
  });
});

describe('quién es el cliente de cada albarán', () => {
  it('sin ficha, dos clientes distintos NO acaban en la misma factura', () => {
    // Agrupar sólo por la ficha los juntaba: los dos tenían clientId ''.
    const grupos = agruparPendientes([
      albaran({ number: 'A1', issueDate: '2026-03-02', clientName: 'Bar Pepe', clientNif: 'B11111111' }),
      albaran({ number: 'A2', issueDate: '2026-03-03', clientName: 'Bar Lola', clientNif: 'B22222222' }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it('el mismo NIF escrito de dos formas es el mismo cliente', () => {
    expect(claveCliente({ clientId: '', clientNif: 'b-1111 1111', clientName: 'x' }))
      .toBe(claveCliente({ clientId: '', clientNif: 'B11111111', clientName: 'y' }));
  });
});

describe('qué entra en la factura del mes', () => {
  const lista = [
    albaran({ number: 'ALB-3', issueDate: '2026-03-20', clientId: 'c1', clientName: 'Rivas', total: 200 }),
    albaran({ number: 'ALB-1', issueDate: '2026-03-02', clientId: 'c1', clientName: 'Rivas', total: 100 }),
    albaran({ number: 'ALB-2', issueDate: '2026-04-01', clientId: 'c1', clientName: 'Rivas' }),
    albaran({ number: 'ALB-4', issueDate: '2026-03-10', clientId: 'c1', clientName: 'Rivas', status: 'borrador' }),
    albaran({ number: 'ALB-5', issueDate: '2026-03-11', clientId: 'c1', clientName: 'Rivas', status: 'facturado' }),
    albaran({ number: 'ALB-6', issueDate: '2026-03-15', clientId: 'c2', clientName: 'Norte', total: 999 }),
  ];

  it('sólo los expedidos dentro de las fechas, por cliente y de más a menos importe', () => {
    const grupos = agruparPendientes(lista, periodoDelMes('2026-03'));
    expect(grupos.map(g => g.clientName)).toEqual(['Norte', 'Rivas']);
    const rivas = grupos[1];
    expect(rivas.albaranes.map(a => a.number)).toEqual(['ALB-1', 'ALB-3']);
    expect(rivas.total).toBe(300);
    expect([rivas.primeraEntrega, rivas.ultimaEntrega]).toEqual(['2026-03-02', '2026-03-20']);
  });

  it('las líneas van en orden de entrega y conservan los tres descuentos', () => {
    const [, rivas] = agruparPendientes(lista, periodoDelMes('2026-03'));
    let n = 0;
    const lineas = lineasDelGrupo(rivas, () => `n${++n}`);
    expect(lineas.map(l => l.id)).toEqual(['n1', 'n2']);
    expect(lineas[0]).toMatchObject({ discountPercent: 10, discountPercent2: 5, discountPercent3: 0 });
  });

  it('la nota cita cada albarán con fecha e importe, y el periodo de las operaciones', () => {
    const [, rivas] = agruparPendientes(lista, periodoDelMes('2026-03'));
    const nota = notaDelGrupo(rivas);
    expect(nota).toContain('Operaciones realizadas del 02/03/2026 al 20/03/2026.');
    expect(nota).toMatch(/ALB-1 \(02\/03\/2026, 100,00\s€\); ALB-3 \(20\/03\/2026, 200,00\s€\)/);
  });
});
