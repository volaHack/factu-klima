import { describe, expect, it } from 'vitest';
import {
  comunicacionesPosibles, diasHabilesHasta, domingoDePascua, esDiaHabil, festivosNacionales, plazoComunicacion, sumarDiasHabiles, tareasPendientes,
} from './estados';
import { alcanceDe, leerConfigFe, obligatoriaDesde, tipoFiscalDe } from './ambito';

describe('plazos de comunicación (4 días hábiles)', () => {
  it('Pascua y Viernes Santo', () => {
    expect(domingoDePascua(2026)).toBe('2026-04-05');
    expect(domingoDePascua(2027)).toBe('2027-03-28');
    expect(domingoDePascua(2028)).toBe('2028-04-16');
    expect(festivosNacionales(2026).has('2026-04-03')).toBe(true);
    expect(festivosNacionales(2028).has('2028-04-14')).toBe(true);
  });

  it('no cuentan sábados, domingos ni festivos nacionales', () => {
    expect(esDiaHabil('2026-10-05')).toBe(true); // lunes
    expect(esDiaHabil('2026-10-10')).toBe(false); // sábado
    expect(esDiaHabil('2026-10-12')).toBe(false); // Fiesta Nacional
    // Lunes 5 de octubre de 2026 → martes 6, miércoles 7, jueves 8, viernes 9.
    expect(plazoComunicacion('2026-10-05')).toBe('2026-10-09');
    // Jueves 8 → viernes 9, (sáb, dom, lunes 12 festivo) martes 13, miércoles 14, jueves 15.
    expect(plazoComunicacion('2026-10-08')).toBe('2026-10-15');
    // Navidad y fin de año.
    expect(plazoComunicacion('2026-12-23')).toBe('2026-12-30');
    expect(sumarDiasHabiles('2026-12-30', 2)).toBe('2027-01-04');
  });

  it('días que quedan', () => {
    expect(diasHabilesHasta('2026-10-09', '2026-10-05')).toBe(4);
    expect(diasHabilesHasta('2026-10-05', '2026-10-05')).toBe(0);
    expect(diasHabilesHasta('2026-10-05', '2026-10-07')).toBe(-2);
  });
});

describe('qué se puede comunicar', () => {
  it('quien recibe: aceptar, rechazar y pagar', () => {
    expect(comunicacionesPosibles('recibida', 'recibida')).toEqual(['aceptacion', 'rechazo', 'pago']);
    expect(comunicacionesPosibles('recibida', 'aceptada')).toContain('pago');
    expect(comunicacionesPosibles('recibida', 'pagada')).toEqual([]);
  });
  it('quien emite: cobro, impago y anulación (voluntarios)', () => {
    expect(comunicacionesPosibles('emitida', 'enviada')).toEqual(['cobro', 'impago', 'anulacion']);
    expect(comunicacionesPosibles('emitida', 'anulada')).toEqual([]);
  });
  it('tareas: decidir las recibidas y avisar del pago de las vencidas', () => {
    const t = tareasPendientes([
      { id: '1', sentido: 'recibida', estado: 'recibida', numero: 'A-1', total: 10, fecha: '2026-09-01', vencimiento: '2026-10-01', nombreEmisor: 'Papelería' },
      { id: '2', sentido: 'recibida', estado: 'aceptada', numero: 'A-2', total: 10, fecha: '2026-09-01', vencimiento: '2026-12-01' },
      { id: '3', sentido: 'recibida', estado: 'pagada', numero: 'A-3', total: 10, fecha: '2026-09-01', vencimiento: '2026-09-02' },
      { id: '4', sentido: 'emitida', estado: 'enviada', numero: 'F-1', total: 10, fecha: '2026-09-01' },
    ], '2026-10-05');
    expect(t.map(x => `${x.feId}:${x.tipo}`)).toEqual(['1:decidir', '1:pago']);
    expect(t[1].urgente).toBe(true);
  });
});

describe('a quién afecta la obligación', () => {
  const f = { tipo: 'factura' as const, sentido: 'venta' as const, tipoFacturaFiscal: undefined, esIntracomunitaria: false, clientNif: 'B87654321', posSessionId: undefined };
  it('tipo de cliente deducido del NIF', () => {
    expect(tipoFiscalDe({ nif: 'B87654321' })).toBe('empresa');
    expect(tipoFiscalDe({ nif: 'ESB87654321' })).toBe('empresa');
    expect(tipoFiscalDe({ nif: '12345678Z' })).toBe('particular');
    expect(tipoFiscalDe({ nif: '12345678Z', tipoFiscal: 'autonomo' })).toBe('autonomo');
    expect(tipoFiscalDe({ nif: 'P3500100A' })).toBe('administracion');
    expect(tipoFiscalDe({ nif: 'B87654321', dir3: { oficinaContable: 'L01350016' } })).toBe('administracion');
  });
  it('empresas y autónomos de España, sí', () => {
    expect(alcanceDe(f, { nif: 'B87654321', country: 'España' }).obligatoria).toBe(true);
    expect(alcanceDe({ ...f, clientNif: '12345678Z' }, { nif: '12345678Z', tipoFiscal: 'autonomo' }).obligatoria).toBe(true);
  });
  it('particulares, tickets, Administraciones y extranjeros, no', () => {
    expect(alcanceDe({ ...f, clientNif: '12345678Z' }, { nif: '12345678Z' })).toMatchObject({ obligatoria: false, posible: true });
    expect(alcanceDe({ ...f, tipoFacturaFiscal: 'F2' }, { nif: 'B87654321' })).toMatchObject({ obligatoria: false, posible: false });
    expect(alcanceDe(f, { nif: 'P3500100A' }).obligatoria).toBe(false);
    expect(alcanceDe({ ...f, esIntracomunitaria: true }, { nif: 'FR40303265045', country: 'Francia' }).obligatoria).toBe(false);
    expect(alcanceDe({ ...f, clientNif: '' }, undefined).posible).toBe(false);
    expect(alcanceDe({ ...f, sentido: 'compra' }, { nif: 'B87654321' }).posible).toBe(false);
  });
  it('calendario y ajustes por defecto', () => {
    expect(obligatoriaDesde({}).texto).toBe('octubre de 2028');
    expect(obligatoriaDesde({ volumenMas8M: true }).texto).toBe('octubre de 2027');
    expect(leerConfigFe(null)).toEqual({ canal: 'simulado', automatica: true, comunicarCobros: false });
    expect(leerConfigFe({ comunicarCobros: true }).comunicarCobros).toBe(true);
  });
});
