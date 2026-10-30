/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from './types';
import {
  diasLaborables, facturadoEnMes, guardarObjetivo, leerImporte, leerObjetivo, objetivoPropuesto, progresoObjetivo,
} from './objetivoMes';

const plano = (s: string) => s.replace(/ /g, ' ');
const f = (dia: string, total: number, extra: Record<string, unknown> = {}) =>
  ({ id: dia, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, issueDate: dia, total, ...extra }) as any;

describe('objetivo del mes', () => {
  it('cuenta los laborables sin domingos ni sábados', () => {
    // Octubre de 2026 empieza en jueves: 22 laborables.
    expect(diasLaborables('2026-10-01', '2026-10-31')).toBe(22);
    expect(diasLaborables('2026-10-24', '2026-10-25')).toBe(0);
    expect(diasLaborables('2026-10-27', '2026-10-31')).toBe(4);
  });

  it('el ritmo, la proyección y lo que falta por día', () => {
    // Martes 27: han pasado 19 laborables y quedan 4 (hoy incluido).
    const p = progresoObjetivo(15000, 9500, '2026-10-27');
    expect(p.porcentaje).toBe(63);
    expect(p.proyeccion).toBe(11000);
    expect(p.falta).toBe(5500);
    expect(p.faltaPorDia).toBe(1375);
    expect(p.llega).toBe(false);
    expect(plano(p.texto)).toBe('Vas al 63 % · a este ritmo cerrarás en 11.000 € · te faltan 1.375 €/día');
  });

  it('cumplido, y un mes que empieza en fin de semana', () => {
    expect(progresoObjetivo(1000, 1200, '2026-10-27').texto).toBe('Vas al 120 % · objetivo cumplido');
    // Sábado 1 de agosto: ningún laborable todavía, sin dividir entre cero.
    expect(progresoObjetivo(1000, 0, '2026-08-01').proyeccion).toBe(0);
  });

  it('propone la media de los tres meses anteriores más un 10 %', () => {
    const docs = [
      f('2026-07-10', 9000), f('2026-08-05', 10000), f('2026-09-20', 11000),
      f('2026-09-21', 5000, { status: InvoiceStatus.ANULADA }), f('2026-09-22', 5000, { sentido: 'compra' }),
      f('2026-10-02', 99999), f('2026-06-30', 99999),
    ];
    expect(facturadoEnMes(docs, '2026-09')).toBe(11000);
    expect(objetivoPropuesto(docs, '2026-10-27')).toBe(11000);
    expect(objetivoPropuesto([], '2026-10-27')).toBeNull();
  });

  it('lee el importe como se escribe en España y como lo escribe un teclado en inglés', () => {
    expect(leerImporte('12.000')).toBe(12000);
    expect(leerImporte('12.000,50 €')).toBe(12000.5);
    expect(leerImporte('12000.5')).toBe(12000.5);
    expect(leerImporte('1.234.567')).toBe(1234567);
    expect(leerImporte('')).toBeNull();
    expect(leerImporte('-5')).toBeNull();
    expect(leerImporte('doce')).toBeNull();
  });

  it('se guarda por cuenta y sin romperse si el navegador no deja', () => {
    const datos = new Map<string, string>();
    const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); }, removeItem: (k: string) => { datos.delete(k); } };
    expect(guardarObjetivo('u1', 14300, almacen)).toBe(true);
    expect(leerObjetivo('u1', almacen)).toBe(14300);
    expect(leerObjetivo('u2', almacen)).toBeNull();
    guardarObjetivo('u1', null, almacen);
    expect(leerObjetivo('u1', almacen)).toBeNull();
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => {} };
    expect(leerObjetivo('u1', roto)).toBeNull();
    expect(guardarObjetivo('u1', 5, roto)).toBe(false);
    expect(leerObjetivo('u1', null)).toBeNull();
  });
});
