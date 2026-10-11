import { describe, expect, it } from 'vitest';
import { claveReparada, repararCabecera, repararColumnas } from './columnasCajas';

describe('columnas de mayorista', () => {
  it('la plantilla de Sucamosa queda bien conectada', () => {
    const r = repararColumnas(
      ['ref', 'descripcion', 'custom_col_1', 'custom_col_2', 'cantidad', 'precio', 'impuesto_pct', 'importe_total'],
      ['CÓDIGO', 'DESCRIPCIÓN', 'CAJ.', 'U/C', 'UDES.', 'RECIO', 'IGIC', 'TOTAL'],
    );
    expect(r.claves).toEqual(['ref', 'descripcion', 'cajas', 'uds_caja', 'uds_linea', 'precio', 'impuesto_pct', 'importe_total']);
    expect(r.cabeceras[5]).toBe('PRECIO');
  });
  it('«Cajas» de una plantilla de distribución pasa a ser las cajas', () => {
    expect(claveReparada('cantidad', 'Cajas')).toBe('cajas');
  });
  it('no toca columnas propias que no son de cajas', () => {
    expect(claveReparada('custom_col_1', 'Lote')).toBe('custom_col_1');
    expect(claveReparada('precio', 'CAJ.')).toBe('precio');
  });
  it('variantes de U/C', () => {
    for (const c of ['U/C', 'UDS/CAJA', 'Uds. caja', 'U.C.', 'UxC']) expect(claveReparada(null, c)).toBe('uds_caja');
  });
  it('no repite un dato que ya tenía otra columna', () => {
    expect(repararColumnas(['cajas', 'custom_col_1'], ['Bultos', 'CAJ.']).claves).toEqual(['cajas', 'custom_col_1']);
  });
  it('cabeceras con la primera letra perdida', () => {
    expect(repararCabecera('RECIO')).toBe('PRECIO');
    expect(repararCabecera('mporte')).toBe('Importe');
    expect(repararCabecera('IGIC')).toBe('IGIC');
    expect(repararCabecera('UDES.')).toBe('UDES.');
  });
});
