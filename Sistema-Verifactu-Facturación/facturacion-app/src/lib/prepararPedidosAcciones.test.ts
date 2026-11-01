import { describe, it, expect, vi, beforeEach } from 'vitest';

// Las vías de guardado de siempre, de mentira: aquí sólo importa a cuál se
// llama y con qué.
const storage = vi.hoisted(() => ({
  saveDocumento: vi.fn(async (d: unknown) => d),
  saveAlbaran: vi.fn(async (a: unknown) => a),
  expedirAlbaranVenta: vi.fn(async (id: string) => ({ id, number: `ALB-${id}` })),
  expedirAlbaran: vi.fn(async (id: string) => ({ id, number: `AE-${id}` })),
  getCompanySettings: vi.fn(async () => ({ seriesDocumentos: {} })),
  // Lo que hay guardado ahora en este equipo (vacío: se usa lo de la pantalla).
  getInvoices: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock('./storage', () => ({ ...storage, serieDeTipo: () => ({ serie: 'ALB', nextNumber: 7 }) }));
const contador = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./documentos', async (original) => ({ ...(await original<typeof import('./documentos')>()), actualizarContadorSerie: contador }));

import { marcarEntregado, marcarPreparado } from './prepararPedidosAcciones';
import { colaDeAlmacen, CLAVE_PREPARADO } from './prepararPedidos';
import { InvoiceStatus, UnitOfMeasure, type Albaran, type Invoice } from './types';

const linea = { id: 'l1', productId: 'p1', productName: 'Agua', productRef: '', quantity: 12, unitPrice: 1, unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 0, subtotal: 12, taxAmount: 0.84, total: 12.84 };
const doc = (extra: Partial<Invoice>): Invoice => ({
  id: 'd1', number: 'PED-1', series: 'PED', clientId: 'c1', clientName: 'Bar Pepe', clientNif: '', clientAddress: '',
  issueDate: '2026-10-30', dueDate: '2026-10-30', status: InvoiceStatus.EMITIDA, lineItems: [linea],
  subtotal: 12, totalDiscount: 0, taxBreakdown: [], totalTax: 0.84, total: 12.84, paymentMethod: 'transferencia' as never,
  notes: '', tipo: 'pedido', sentido: 'venta', createdAt: '', updatedAt: '', ...extra,
});
const albaranDeEntrega: Albaran = {
  id: 'a1', number: 'AE-1', series: 'AE', clientId: 'c1', clientName: 'Bar Pepe', clientNif: '', clientAddress: '',
  issueDate: '2026-10-30', status: 'borrador', lineItems: [linea], subtotal: 0, totalDiscount: 0, taxBreakdown: [],
  totalTax: 0, total: 0, notes: '', createdAt: '', updatedAt: '',
};
const enCola = (documentos: Invoice[], albaranes: Albaran[] = []) => colaDeAlmacen({ documentos, albaranes, clientes: [], rutas: [] });

beforeEach(() => vi.clearAllMocks());

describe('«Preparado»', () => {
  it('guarda el documento por la vía de siempre con la marca, sin cambiar su estado', async () => {
    const d = doc({ datosExtras: { custom_1: 'x' } });
    await marcarPreparado(enCola([d])[0], { documentos: [d], albaranes: [] }, { en: '2026-10-31T09:00:00Z', por: 'Ana' });
    const guardado = storage.saveDocumento.mock.calls[0][0] as Invoice;
    expect(guardado.status).toBe(InvoiceStatus.EMITIDA);
    expect(guardado.datosExtras?.custom_1).toBe('x');
    expect(JSON.parse(guardado.datosExtras![CLAVE_PREPARADO])).toEqual({ en: '2026-10-31T09:00:00Z', por: 'Ana' });
  });

  it('un albarán de entrega se guarda en su tabla, y la marca se quita igual', async () => {
    const a = { ...albaranDeEntrega, datosExtras: { [CLAVE_PREPARADO]: '{"en":"2026-10-31"}' } };
    await marcarPreparado(enCola([], [a])[0], { documentos: [], albaranes: [a] }, null);
    expect(storage.saveDocumento).not.toHaveBeenCalled();
    expect((storage.saveAlbaran.mock.calls[0][0] as Albaran).datosExtras).toEqual({});
  });
});

describe('«Entregado»', () => {
  it('un albarán de venta se expide', async () => {
    const d = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.BORRADOR });
    expect(await marcarEntregado(enCola([d])[0], { documentos: [d], albaranes: [] })).toBe('ALB-alb');
    expect(storage.expedirAlbaranVenta).toHaveBeenCalledWith('alb');
    expect(storage.saveDocumento).not.toHaveBeenCalled();
  });

  it('un albarán de entrega se expide en su tabla', async () => {
    await marcarEntregado(enCola([], [albaranDeEntrega])[0], { documentos: [], albaranes: [albaranDeEntrega] });
    expect(storage.expedirAlbaran).toHaveBeenCalledWith('a1');
  });

  it('un pedido sale con su albarán, que se numera y se expide; no se emite ninguna factura', async () => {
    const d = doc({});
    await marcarEntregado(enCola([d])[0], { documentos: [d], albaranes: [] });
    const alb = storage.saveDocumento.mock.calls[0][0] as Invoice;
    expect([alb.tipo, alb.status, alb.documentoOrigenId]).toEqual(['albaran', InvoiceStatus.BORRADOR, 'd1']);
    expect(contador).toHaveBeenCalledWith(expect.anything(), 'albaran_venta', alb.number);
    expect(storage.expedirAlbaranVenta).toHaveBeenCalledWith(alb.id);
    expect(storage.saveDocumento).toHaveBeenCalledTimes(1);
  });

  it('cuenta lo servido con lo guardado ahora, no con la foto de la pantalla: un segundo toque no saca otro albarán', async () => {
    const d = doc({});
    const yaSalio = doc({ id: 'alb-ya', number: 'ALB-9', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'd1' });
    storage.getInvoices.mockResolvedValueOnce([d, yaSalio]);
    await expect(marcarEntregado(enCola([d])[0], { documentos: [d], albaranes: [] })).rejects.toThrow('ya no le queda nada por servir');
    expect(storage.saveDocumento).not.toHaveBeenCalled();
    expect(storage.expedirAlbaranVenta).not.toHaveBeenCalled();
  });

  it('si ya no está en los datos cargados, lo dice en vez de guardar a ciegas', async () => {
    const d = doc({});
    await expect(marcarEntregado(enCola([d])[0], { documentos: [], albaranes: [] })).rejects.toThrow('No se encuentra PED-1');
  });
});
