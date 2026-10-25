import { describe, it, expect } from 'vitest';
import { avisoRegimen, zonaFiscal } from './regimenFiscal';

describe('zona fiscal por la dirección', () => {
  it('los códigos postales 35 y 38 son de Canarias', () => {
    expect(zonaFiscal({ postalCode: '35500' })).toBe('canarias');
    expect(zonaFiscal({ postalCode: '38001' })).toBe('canarias');
  });
  it('el resto de provincias, no', () => {
    expect(zonaFiscal({ postalCode: '28001' })).toBe('resto');
    expect(zonaFiscal({ postalCode: '07001' })).toBe('resto');
  });
  it('Ceuta y Melilla tienen su propio impuesto: no se dice nada', () => {
    expect(zonaFiscal({ postalCode: '51001' })).toBeNull();
    expect(zonaFiscal({ postalCode: '52001' })).toBeNull();
  });
  it('sin código postal, mira la provincia', () => {
    expect(zonaFiscal({ province: 'Las Palmas' })).toBe('canarias');
    expect(zonaFiscal({ province: 'Santa Cruz de Tenerife' })).toBe('canarias');
    expect(zonaFiscal({ province: 'Madrid' })).toBeNull();
    expect(zonaFiscal({})).toBeNull();
  });
});

describe('aviso de régimen', () => {
  it('avisa a una empresa canaria que factura con IVA', () => {
    expect(avisoRegimen({ igicEnabled: false, postalCode: '35500' })?.titulo).toMatch(/Canarias/);
  });
  it('avisa a una empresa de fuera que factura con IGIC', () => {
    expect(avisoRegimen({ igicEnabled: true, postalCode: '28001' })?.titulo).toMatch(/IGIC/);
  });
  it('calla cuando cuadra o no se sabe', () => {
    expect(avisoRegimen({ igicEnabled: true, postalCode: '35500' })).toBeNull();
    expect(avisoRegimen({ igicEnabled: false, postalCode: '28001' })).toBeNull();
    expect(avisoRegimen({ igicEnabled: false })).toBeNull();
    expect(avisoRegimen(null)).toBeNull();
  });
});
