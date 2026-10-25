import { describe, it, expect } from 'vitest';
import { esNombreImpuesto, impuestoDeEmpresa, impuestoDeFactura } from './impuesto';

describe('impuesto de una factura', () => {
  it('manda lo que guarda la factura, aunque la empresa haya cambiado de régimen', () => {
    expect(impuestoDeFactura({ impuesto: 'IGIC' }, { igicEnabled: false })).toBe('IGIC');
    expect(impuestoDeFactura({ impuesto: 'IVA' }, { igicEnabled: true })).toBe('IVA');
  });

  it('sin impuesto guardado (facturas anteriores) usa el régimen de la empresa', () => {
    expect(impuestoDeFactura({}, { igicEnabled: true })).toBe('IGIC');
    expect(impuestoDeFactura({ impuesto: null }, { igicEnabled: false })).toBe('IVA');
    expect(impuestoDeFactura(null, null)).toBe('IVA');
  });

  it('la empresa sin ajustes es de IVA', () => {
    expect(impuestoDeEmpresa(undefined)).toBe('IVA');
    expect(impuestoDeEmpresa({ igicEnabled: true })).toBe('IGIC');
  });

  it('sólo reconoce los dos nombres', () => {
    expect(esNombreImpuesto('IGIC')).toBe(true);
    expect(esNombreImpuesto('igic')).toBe(false);
    expect(esNombreImpuesto(null)).toBe(false);
  });
});
