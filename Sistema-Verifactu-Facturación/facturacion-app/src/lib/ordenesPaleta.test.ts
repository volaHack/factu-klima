/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { interpretarOrden, documentosPorNumero, type ContextoOrdenes } from './ordenesPaleta';

const clientes = [
  { id: 'c1', businessName: 'Pepe SL', tradeName: 'Bar Pepe', nif: 'B12345678', city: 'Arrecife', active: true },
  { id: 'c2', businessName: 'Almazara Sur SA', tradeName: '', nif: 'B87654321', city: 'Jaén', active: true, esProveedor: true },
  { id: 'c3', businessName: 'Óptica Núñez', tradeName: '', nif: 'B11111111', city: 'Teror', active: true },
] as any;
const documentos = [
  { id: 'f1', number: 'F-2026-1127', tipo: 'factura', sentido: 'venta', status: 'emitida', clientId: 'c1', clientName: 'Bar Pepe', issueDate: '2026-10-02', dueDate: '2026-11-01', total: 121, lineItems: [] },
  { id: 'f2', number: 'F-2026-0012', tipo: 'factura', sentido: 'venta', status: 'pagada', clientId: 'c1', clientName: 'Bar Pepe', issueDate: '2026-01-10', dueDate: '2026-02-10', total: 50, lineItems: [] },
  { id: 'f3', number: 'F-2026-0900', tipo: 'factura', sentido: 'venta', status: 'vencida', clientId: 'c1', clientName: 'Bar Pepe', issueDate: '2026-08-01', dueDate: '2026-09-01', total: 80, lineItems: [] },
] as any;
const ctx: ContextoOrdenes = { clientes, documentos };
const primera = (t: string, c: ContextoOrdenes = ctx) => interpretarOrden(t, c)[0];

describe('órdenes del buscador', () => {
  it('«factura bar pepe» abre una factura nueva con ese cliente, con tildes, mayúsculas o abreviado', () => {
    for (const t of ['factura bar pepe', 'FACTURA Bar Pepe', 'fra pepe', 'nueva factura para bar pepe', 'Facturar a Pepe']) {
      expect(primera(t), t).toMatchObject({ icono: 'factura', href: '/facturas/nueva?cliente=c1', titulo: 'Nueva factura para Bar Pepe' });
    }
    expect(primera('fra optica nunez')).toMatchObject({ href: '/facturas/nueva?cliente=c3' });
    expect(primera('fra óptica')).toMatchObject({ href: '/facturas/nueva?cliente=c3' });
  });

  it('un proveedor no sale como cliente de una venta', () => {
    expect(primera('factura almazara')).toMatchObject({ titulo: 'Nueva factura sin cliente', href: '/facturas/nueva' });
  });

  it('«factura» a secas es una nueva, con su tecla; «facturas» es la lista', () => {
    expect(primera('factura')).toMatchObject({ titulo: 'Nueva factura', href: '/facturas/nueva', tecla: 'N' });
    expect(primera('facturas')).toMatchObject({ href: '/facturas', tecla: 'F' });
  });

  it('presupuestos, albaranes y pedidos van a su pantalla con el cliente', () => {
    expect(primera('presupuesto bar pepe')?.href).toBe('/documentos/nuevo?tipo=presupuesto&sentido=venta&clientId=c1');
    expect(primera('ppto pepe')?.href).toBe('/documentos/nuevo?tipo=presupuesto&sentido=venta&clientId=c1');
    expect(primera('albarán pepe')?.href).toBe('/documentos/nuevo?tipo=albaran&sentido=venta&clientId=c1');
    expect(primera('alb pepe')?.href).toBe('/documentos/nuevo?tipo=albaran&sentido=venta&clientId=c1');
    expect(primera('pedido pepe')?.href).toBe('/documentos/nuevo?tipo=pedido&sentido=venta&clientId=c1');
  });

  it('sin el módulo encendido no se ofrece', () => {
    expect(interpretarOrden('presupuesto pepe', { ...ctx, modulos: ['albaranes'] })).toEqual([]);
    expect(primera('alb pepe', { ...ctx, modulos: ['albaranes'] })?.icono).toBe('albaran');
  });

  it('el perfil de trabajo decide qué puede abrir', () => {
    expect(interpretarOrden('fra pepe', { ...ctx, puede: h => !h.startsWith('/facturas') })).toEqual([]);
  });

  it('«cobrar F-2026-1127» abre esa factura, se escriba como se escriba el número', () => {
    for (const t of ['cobrar F-2026-1127', 'Cobrar f20261127', 'cobro 1127']) {
      expect(primera(t), t).toMatchObject({ icono: 'cobrar', href: '/facturas/f1', titulo: 'Cobrar Factura F-2026-1127' });
    }
    expect(primera('cobrar 0012')?.detalle).toContain('ya está cobrada');
  });

  it('«cobrar pepe» enseña lo que tiene pendiente, lo más antiguo primero', () => {
    expect(interpretarOrden('cobrar pepe', ctx).map(o => o.href)).toEqual(['/facturas/f3', '/facturas/f1']);
    expect(primera('cobrar optica')).toMatchObject({ href: '/tesoreria?tab=cobros&nuevo=cobro' });
  });

  it('«factura» con un número que existe la abre en vez de crear otra', () => {
    expect(primera('factura F-2026-0012')).toMatchObject({ href: '/facturas/f2' });
  });

  it('altas de fichas en cualquier orden', () => {
    expect(primera('cliente nuevo')?.href).toBe('/clientes?tipo=clientes&nuevo=1');
    expect(primera('Nuevo Cliente')?.href).toBe('/clientes?tipo=clientes&nuevo=1');
    expect(primera('producto nuevo')?.href).toBe('/productos?nuevo=1');
    expect(primera('dar de alta un artículo')?.href).toBe('/productos?nuevo=1');
    expect(primera('alta proveedor')?.href).toBe('/clientes?tipo=proveedores&nuevo=1');
  });

  it('ir a pantallas por su nombre corto, o por el menú', () => {
    expect(primera('ir a tesorería')?.href).toBe('/tesoreria');
    expect(primera('ve a teso')?.href).toBe('/tesoreria');
    expect(primera('vencidas')?.href).toBe('/tesoreria?tab=vencimientos');
    expect(primera('Impagadas')?.href).toBe('/tesoreria?tab=vencimientos');
    expect(primera('ir al panel')).toMatchObject({ href: '/dashboard', tecla: 'D' });
    expect(primera('ir a listados fiscales')?.href).toBe('/listados-fiscales');
  });

  it('lo que no es una orden no devuelve nada', () => {
    expect(interpretarOrden('aceite de oliva virgen', ctx)).toEqual([]);
    expect(interpretarOrden('   ', ctx)).toEqual([]);
  });

  it('el número de documento casa entero o por el final, y pide al menos tres cifras', () => {
    expect(documentosPorNumero(documentos, '1127').map(d => d.id)).toEqual(['f1']);
    expect(documentosPorNumero(documentos, '27')).toEqual([]);
    expect(documentosPorNumero(documentos, 'pepe')).toEqual([]);
  });
});
