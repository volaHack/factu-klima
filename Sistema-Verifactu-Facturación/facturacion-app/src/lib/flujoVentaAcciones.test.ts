import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lo guardado en este equipo, de mentira: aquí importa qué se guarda y cuándo se niega.
const guardados = vi.hoisted(() => ({ docs: [] as { id: string }[] }));
const storage = vi.hoisted(() => ({
  getInvoices: vi.fn(async () => guardados.docs),
  getInvoiceById: vi.fn(async (id: string) => guardados.docs.find(d => d.id === id)),
  getCompanySettings: vi.fn(async () => ({ invoiceSeries: 'F', nextInvoiceNumber: 1200, seriesDocumentos: {} })),
  saveDocumento: vi.fn(async (d: { id: string }) => { guardados.docs.push(d); return d; }),
  getApprovalByInvoiceId: vi.fn(async () => ({ id: 'apr1' })),
  getApprovalItems: vi.fn(async () => [{ lineItemId: 'l1', accepted: true, adjustedQuantity: 5 }]),
  // Las de compras (las prueba su agente): aquí importa que se llamen a ellas.
  recibirPedidoCompra: vi.fn(async (id: string) => ({ id: 'alb-c', tipo: 'albaran', documentoOrigenId: id })),
  facturarAlbaranesCompra: vi.fn(async (ids: string[], datos: unknown) => ({ id: 'fac-c', tipo: 'factura', ids, datos })),
  soltarAlbaranesDeFactura: vi.fn(async () => {}),
}));
vi.mock('./storage', () => ({ ...storage, serieDeTipo: () => ({ serie: 'PED', nextNumber: 9 }) }));
const contador = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./documentos', async (original) => ({
  ...(await original<typeof import('./documentos')>()),
  actualizarContadorSerie: contador,
  serieParaCliente: vi.fn(async () => null),
}));

import { anularDocumento, avisoAntesDeAnular, convertirYGuardar, registrarFacturaProveedor } from './flujoVentaAcciones';
import { InvoiceStatus, UnitOfMeasure, type Invoice } from './types';

const linea = { id: 'l1', productId: 'p1', productName: 'Agua', productRef: '', quantity: 12, unitPrice: 1, unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 0, subtotal: 12, taxAmount: 0.84, total: 12.84 };
const doc = (extra: Partial<Invoice>): Invoice => ({
  id: 'd1', number: 'PED-2026-0001', series: 'PED', clientId: 'c1', clientName: 'Bar Pepe', clientNif: '', clientAddress: '',
  issueDate: '2026-10-30', dueDate: '2026-10-30', status: InvoiceStatus.EMITIDA, lineItems: [linea],
  subtotal: 12, totalDiscount: 0, taxBreakdown: [], totalTax: 0.84, total: 12.84, paymentMethod: 'transferencia' as never,
  notes: '', tipo: 'pedido', sentido: 'venta', createdAt: '', updatedAt: '', ...extra,
});

beforeEach(() => { vi.clearAllMocks(); guardados.docs = []; Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); });

describe('convertirYGuardar', () => {
  it('guarda el documento nuevo en borrador, enganchado al original, y sube el contador de su serie', async () => {
    guardados.docs = [doc({})];
    const fac = await convertirYGuardar('d1', 'factura');
    expect([fac.tipo, fac.status, fac.documentoOrigenId, fac.number]).toEqual(['factura', InvoiceStatus.BORRADOR, 'd1', expect.stringMatching(/^F-\d{4}-1200$/)]);
    expect(contador).toHaveBeenCalledWith(expect.anything(), 'factura_venta', fac.number);
  });

  it('facturar un albarán que viene de un pedido: la factura cuelga del albarán y el albarán queda facturado', async () => {
    guardados.docs = [
      doc({}),
      doc({ id: 'alb', number: 'ALB-2026-0030', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'd1', documentoOrigenNumber: 'PED-2026-0001' }),
    ];
    const fac = await convertirYGuardar('alb', 'factura');
    expect([fac.documentoOrigenId, fac.documentoOrigenNumber]).toEqual(['alb', 'ALB-2026-0030']);
    const albaran = storage.saveDocumento.mock.calls.map(c => c[0] as unknown as Invoice).find(d => d.id === 'alb');
    expect(albaran?.status).toBe(InvoiceStatus.FACTURADO);
    // Y no se factura otra vez.
    guardados.docs = guardados.docs.map(d => (d.id === 'alb' ? albaran! : d));
    await expect(convertirYGuardar('alb', 'factura')).rejects.toThrow(/facturado/);
  });

  it('la segunda vez (otro clic, volver atrás) ve lo que ya salió y no crea nada', async () => {
    guardados.docs = [doc({})];
    await convertirYGuardar('d1', 'albaran');
    await expect(convertirYGuardar('d1', 'albaran')).rejects.toThrow(/servido del todo/);
    expect(storage.saveDocumento).toHaveBeenCalledTimes(1);
  });

  it('dos clics a la vez: el segundo no empieza', async () => {
    guardados.docs = [doc({ tipo: 'presupuesto' })];
    const [a, b] = await Promise.allSettled([convertirYGuardar('d1', 'pedido'), convertirYGuardar('d1', 'pedido')]);
    expect([a.status, b.status]).toEqual(['fulfilled', 'rejected']);
    expect(storage.saveDocumento).toHaveBeenCalledTimes(1);
  });

  it('un pedido aprobado a medias sale con lo que aprobó el cliente', async () => {
    guardados.docs = [doc({ status: InvoiceStatus.APROBADO_PARCIAL })];
    const alb = await convertirYGuardar('d1', 'albaran');
    expect(alb.lineItems.map(l => l.quantity)).toEqual([5]);
  });

  it('y sin conexión no adivina lo que aprobó', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    guardados.docs = [doc({ status: InvoiceStatus.APROBADO_PARCIAL })];
    await expect(convertirYGuardar('d1', 'albaran')).rejects.toThrow(/con conexión/);
    expect(storage.saveDocumento).not.toHaveBeenCalled();
  });
});

describe('en compras', () => {
  const compra = (extra: Partial<Invoice>) => doc({ sentido: 'compra', number: 'PEDC-2026-0001', ...extra });

  it('recibir un pedido de compra va por recibirPedidoCompra, que propone sólo lo pendiente', async () => {
    guardados.docs = [compra({})];
    const alb = await convertirYGuardar('d1', 'albaran');
    expect(storage.recibirPedidoCompra).toHaveBeenCalledWith('d1');
    expect(alb.id).toBe('alb-c');
    expect(storage.saveDocumento).not.toHaveBeenCalled();
  });

  it('la factura de un albarán recibido se registra con el número y las fechas del proveedor', async () => {
    guardados.docs = [compra({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO })];
    const datos = { numero: 'A-2211', fechaExpedicion: '2026-10-28', fechaRegistro: '2026-11-01' };
    await registrarFacturaProveedor('d1', datos);
    expect(storage.facturarAlbaranesCompra).toHaveBeenCalledWith(['d1'], datos);
  });

  it('sin esos datos no se crea a ciegas desde el botón de convertir', async () => {
    guardados.docs = [compra({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO })];
    await expect(convertirYGuardar('d1', 'factura')).rejects.toThrow(/factura del proveedor/);
    expect(storage.facturarAlbaranesCompra).not.toHaveBeenCalled();
  });

  it('la factura directa de un pedido de compra lleva también los datos del proveedor y sólo lo pendiente', async () => {
    guardados.docs = [compra({}), compra({ id: 'a1', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'd1', lineItems: [{ ...linea, quantity: 5 }] })];
    const fac = await registrarFacturaProveedor('d1', { numero: 'A-2211', fechaExpedicion: '2026-10-28', fechaRegistro: '2026-11-01' });
    expect(fac.lineItems.map(l => l.quantity)).toEqual([7]);
    expect([fac.issueDate, fac.datosExtras?.numeroFacturaProveedor, fac.datosExtras?.fechaRegistro]).toEqual(['2026-10-28', 'A-2211', '2026-11-01']);
    expect(contador).toHaveBeenCalledWith(expect.anything(), 'factura_compra', fac.number);
  });

  it('una factura de proveedor repetida no se registra', async () => {
    guardados.docs = [
      compra({}),
      compra({ id: 'f0', number: 'FACC-2026-0001', tipo: 'factura', status: InvoiceStatus.EMITIDA, datosExtras: { numeroFacturaProveedor: 'A-2211' } }),
    ];
    await expect(registrarFacturaProveedor('d1', { numero: 'A-2211' })).rejects.toThrow(/ya está registrada/);
  });
});

describe('anularDocumento', () => {
  it('un albarán ya facturado no se anula', async () => {
    guardados.docs = [doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO }), doc({ id: 'f1', number: 'F-2026-1200', tipo: 'factura', status: InvoiceStatus.BORRADOR, documentoOrigenId: 'd1' })];
    await expect(anularDocumento('d1', 'No llegó a salir')).rejects.toThrow(/F-2026-1200/);
    expect(storage.saveDocumento).not.toHaveBeenCalled();
  });

  it('un pedido sí, y queda anulado con su motivo', async () => {
    guardados.docs = [doc({})];
    await anularDocumento('d1', '  El cliente lo canceló por teléfono ');
    const guardado = storage.saveDocumento.mock.calls[0][0] as unknown as Invoice;
    expect([guardado.status, guardado.cancelReason]).toEqual([InvoiceStatus.ANULADA, 'El cliente lo canceló por teléfono']);
  });

  it('sin motivo no se anula', async () => {
    guardados.docs = [doc({})];
    await expect(anularDocumento('d1', '  ')).rejects.toThrow(/motivo/);
    expect(storage.saveDocumento).not.toHaveBeenCalled();
  });

  it('el aviso de antes de anular dice también lo que impide anular en compras (un pedido recibido entero)', async () => {
    guardados.docs = [doc({ sentido: 'compra' }), doc({ id: 'a1', sentido: 'compra', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'd1' })];
    expect(await avisoAntesDeAnular('d1')).toMatchObject({ bloquea: true, texto: expect.stringMatching(/servido entero/) });
  });
});
