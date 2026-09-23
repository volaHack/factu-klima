import { describe, it, expect } from 'vitest';

import { tipoFiscalAlEmitir } from './tipoAlEmitir';

/**
 * Los nueve registros que había en cola para la AEAT eran facturas
 * completas (F1) sin NIF del cliente: se sellaron sin problema y no se
 * habrían podido enviar nunca. Esto fija la regla que lo evita.
 */
describe('completa o simplificada, al emitir', () => {
  it('«Venta al público» sin NIF por 6,75 € sale como simplificada', () => {
    expect(tipoFiscalAlEmitir({ tipo: 'factura', clientNif: '', total: 6.75 })).toBe('F2');
  });

  it('justo 400 € todavía es simplificada', () => {
    expect(tipoFiscalAlEmitir({ tipo: 'factura', total: 400 })).toBe('F2');
  });

  it('más de 400 € sin NIF no se deja emitir', () => {
    expect(() => tipoFiscalAlEmitir({ tipo: 'factura', total: 721.64, number: 'FAC-0003' }))
      .toThrow(/FAC-0003.*400 €.*NIF/);
  });

  it('con NIF, o con NIF-IVA extranjero, decide la base de datos como siempre', () => {
    expect(tipoFiscalAlEmitir({ tipo: 'factura', clientNif: 'B12345678', total: 5000 })).toBeUndefined();
    expect(tipoFiscalAlEmitir({ tipo: 'factura', clientVatNumber: 'FR12345678901', total: 5000 })).toBeUndefined();
  });

  it('los tickets del TPV y las rectificativas siguen su regla', () => {
    expect(tipoFiscalAlEmitir({ tipo: 'factura', posSessionId: 'x', total: 900 })).toBeUndefined();
    expect(tipoFiscalAlEmitir({ tipo: 'rectificativa', total: 900 })).toBeUndefined();
  });

  it('un tipo puesto a mano se respeta', () => {
    expect(tipoFiscalAlEmitir({ tipo: 'factura', tipoFacturaFiscal: 'F1', total: 900 })).toBe('F1');
  });
});
