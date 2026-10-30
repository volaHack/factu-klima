import { describe, it, expect } from 'vitest';
import {
  borrarBorrador, claveBorrador, guardarBorrador, leerBorrador, resumenBorrador, tieneContenido,
  VERSION_BORRADOR, type Almacen, type BorradorFactura,
} from './borradorLocal';
import { PaymentMethod, UnitOfMeasure, type InvoiceLineItem } from './types';

class AlmacenDePrueba implements Almacen {
  datos = new Map<string, string>();
  getItem(k: string) { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string) { this.datos.set(k, v); }
  removeItem(k: string) { this.datos.delete(k); }
}

const roto: Almacen = {
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('cuota llena'); },
  removeItem: () => { throw new Error('bloqueado'); },
};

const linea = (o: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: 'l1', productId: 'agua', productName: 'Agua', productRef: 'A1', quantity: 24, unitPrice: 0.5,
  unit: UnitOfMeasure.UNIDAD, taxRate: 10, discountPercent: 0, subtotal: 12, taxAmount: 1.2, total: 13.2, ...o,
});

const borrador = (o: Partial<BorradorFactura> = {}): BorradorFactura => ({
  version: VERSION_BORRADOR,
  guardado: '2026-10-30T10:00:00.000Z',
  clientId: 'bar',
  clienteNombre: 'Bar de la esquina',
  clienteOcasional: false,
  clienteManual: { nombre: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '' },
  issueDate: '2026-10-30',
  dueDate: '2026-11-29',
  paymentMethod: PaymentMethod.TRANSFERENCIA,
  notes: '',
  globalDiscounts: [0, 0, 0],
  lineItems: [linea(), linea({ id: 'l2' }), linea({ id: 'l3', productId: '', productName: 'Portes' }), linea({ id: 'l4', productId: '', productName: '' })],
  datosExtras: {},
  cobradaAlEmitir: false,
  total: 245,
  ...o,
});

const hoy = new Date('2026-10-30T12:00:00Z');

describe('la factura sin terminar', () => {
  it('se guarda y se recupera por cuenta', () => {
    const a = new AlmacenDePrueba();
    expect(guardarBorrador(a, 'ana', borrador())).toBe(true);
    expect(leerBorrador(a, 'ana', hoy)).toEqual(borrador());
    // Otra cuenta en el mismo equipo no la ve.
    expect(leerBorrador(a, 'luis', hoy)).toBeNull();
    expect(a.datos.has(claveBorrador('ana'))).toBe(true);
  });

  it('sin sesión no se guarda nada', () => {
    const a = new AlmacenDePrueba();
    expect(guardarBorrador(a, null, borrador())).toBe(false);
    expect(a.datos.size).toBe(0);
    expect(leerBorrador(a, null, hoy)).toBeNull();
  });

  it('una pantalla en blanco no se guarda, y borra la copia vieja', () => {
    const a = new AlmacenDePrueba();
    guardarBorrador(a, 'ana', borrador());
    const vacio = borrador({ clientId: '', clienteNombre: '', lineItems: [linea({ productId: '', productName: ' ' })] });
    expect(tieneContenido(vacio)).toBe(false);
    expect(guardarBorrador(a, 'ana', vacio)).toBe(false);
    expect(leerBorrador(a, 'ana', hoy)).toBeNull();
    expect(tieneContenido(borrador({ clientId: '', lineItems: [], notes: 'Llamar antes' }))).toBe(true);
  });

  it('caduca a los 30 días', () => {
    const a = new AlmacenDePrueba();
    guardarBorrador(a, 'ana', borrador({ guardado: '2026-09-01T10:00:00Z' }));
    expect(leerBorrador(a, 'ana', hoy)).toBeNull();
    expect(a.datos.size).toBe(0);
  });

  it('lo que no es una copia válida se tira sin romper nada', () => {
    const a = new AlmacenDePrueba();
    a.setItem(claveBorrador('ana'), '{esto no es json');
    expect(leerBorrador(a, 'ana', hoy)).toBeNull();
    a.setItem(claveBorrador('ana'), JSON.stringify({ version: 99, lineItems: [] }));
    expect(leerBorrador(a, 'ana', hoy)).toBeNull();
    expect(a.datos.size).toBe(0);
  });

  it('completa lo que falte de una copia antigua', () => {
    const a = new AlmacenDePrueba();
    const parcial: Partial<BorradorFactura> = borrador();
    delete parcial.clienteManual;
    delete parcial.globalDiscounts;
    a.setItem(claveBorrador('ana'), JSON.stringify(parcial));
    const b = leerBorrador(a, 'ana', hoy)!;
    expect(b.globalDiscounts).toEqual([0, 0, 0]);
    expect(b.clienteManual.nombre).toBe('');
  });

  it('un almacenamiento bloqueado o lleno no rompe la pantalla', () => {
    expect(guardarBorrador(roto, 'ana', borrador())).toBe(false);
    expect(leerBorrador(roto, 'ana', hoy)).toBeNull();
    expect(() => borrarBorrador(roto, 'ana')).not.toThrow();
    expect(guardarBorrador(null, 'ana', borrador())).toBe(false);
  });

  it('se borra al terminar', () => {
    const a = new AlmacenDePrueba();
    guardarBorrador(a, 'ana', borrador());
    borrarBorrador(a, 'ana');
    expect(leerBorrador(a, 'ana', hoy)).toBeNull();
  });

  it('el aviso dice para quién, cuántas líneas y cuánto', () => {
    expect(resumenBorrador(borrador()).replace(/\s/g, ' ')).toBe('Tienes una factura sin terminar para Bar de la esquina (3 líneas, 245,00 €)');
    expect(resumenBorrador(borrador({ clientId: '', clienteNombre: '', lineItems: [linea()], total: 13.2 })).replace(/\s/g, ' '))
      .toBe('Tienes una factura sin terminar sin cliente todavía (1 línea, 13,20 €)');
    const ocasional = borrador({ clienteOcasional: true, clienteManual: { ...borrador().clienteManual, nombre: 'Marta' } });
    expect(resumenBorrador(ocasional)).toMatch(/para Marta/);
  });
});
