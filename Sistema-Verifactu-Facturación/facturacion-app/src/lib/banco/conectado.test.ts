import { describe, expect, it } from 'vitest';
import { movimientosDesdeBanco } from './conectado';

const cobro = {
  entry_reference: 'REF-1', transaction_amount: { amount: '1210.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT',
  booking_date: '2026-09-10', value_date: '2026-09-10', remittance_information: ['FAC-2026-0012'], debtor: { name: 'CLIENTE SL' }, status: 'BOOK',
};
const cargo = {
  entry_reference: 'REF-2', transaction_amount: { amount: '60.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT',
  booking_date: '2026-09-05', remittance_information: ['RECIBO LUZ'], creditor: { name: 'IBERDROLA' }, status: 'BOOK',
};

describe('movimientosDesdeBanco', () => {
  it('pone el signo según CRDT/DBIT y ordena por fecha', () => {
    const m = movimientosDesdeBanco([cobro, cargo], 'ES00');
    expect(m.map(x => x.importe)).toEqual([-60.5, 1210]);
    expect(m[1].fecha).toBe('2026-09-10');
  });

  it('el concepto junta la contraparte y el texto del banco (así casa con la factura)', () => {
    const [, entrada] = movimientosDesdeBanco([cobro, cargo], 'ES00');
    expect(entrada.concepto).toBe('CLIENTE SL · FAC-2026-0012');
    expect(entrada.referencia).toBe('REF-1');
  });

  it('el id es el mismo en cada lectura: lo conciliado sigue conciliado', () => {
    expect(movimientosDesdeBanco([cobro], 'ES00')[0].id).toBe(movimientosDesdeBanco([cobro], 'ES00')[0].id);
    expect(movimientosDesdeBanco([cobro], 'ES00')[0].id).not.toBe(movimientosDesdeBanco([cobro], 'ES99')[0].id);
  });

  it('fuera lo pendiente, lo que no es en euros y lo que no trae fecha', () => {
    const m = movimientosDesdeBanco([
      { ...cobro, status: 'PDNG' },
      { ...cobro, entry_reference: 'X', transaction_amount: { amount: '5', currency: 'USD' } },
      { ...cobro, entry_reference: 'Y', booking_date: null, value_date: null },
    ], 'ES00');
    expect(m).toEqual([]);
  });

  it('sin referencia, dos cargos iguales el mismo día son dos movimientos', () => {
    const sinRef = { ...cargo, entry_reference: null };
    const m = movimientosDesdeBanco([sinRef, sinRef], 'ES00');
    expect(m).toHaveLength(2);
    expect(m[0].id).not.toBe(m[1].id);
  });
});
