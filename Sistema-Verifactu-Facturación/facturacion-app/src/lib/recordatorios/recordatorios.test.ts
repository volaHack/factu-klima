import { describe, expect, it } from 'vitest';
import { mensaje, porCliente, telefonoWhatsApp, toca, tonoDe, vencidas, type FacturaCobro } from './textos';
import { facturaDeFila } from './filas';

const f = (over: Partial<FacturaCobro>): FacturaCobro => ({
  id: 'f1', number: 'FAC-2026-0001', clientId: 'c1', clientName: 'Acme SL', issueDate: '2026-01-01', dueDate: '2026-01-31',
  status: 'emitida', total: 121, subtotal: 100, ...over,
});

const HOY = '2026-03-01';

describe('vencidas', () => {
  it('sólo facturas de venta vencidas y con algo pendiente', () => {
    const v = vencidas([
      f({}),
      f({ id: 'a', dueDate: '2026-03-05' }), // aún no vence
      f({ id: 'b', status: 'pagada' }),
      f({ id: 'c', status: 'anulada' }),
      f({ id: 'd', sentido: 'compra' }),
      f({ id: 'e', tipo: 'rectificativa' }),
      f({ id: 'g', status: 'parcial', paidAmount: 121 }), // cobrada entera
      f({ id: 'h', status: 'parcial', paidAmount: 100 }),
    ], HOY);
    expect(v.map(x => x.factura.id)).toEqual(['f1', 'h']);
    expect(v[0].diasRetraso).toBe(29);
    expect(v[1].pendiente).toBe(21);
  });

  it('con retención reclama el neto', () => {
    const [v] = vencidas([f({ total: 121, subtotal: 100, retencionPct: 15 })], HOY);
    expect(v.pendiente).toBe(106);
  });

  it('agrupa por cliente, la más antigua primero', () => {
    const d = porCliente(vencidas([
      f({}), f({ id: 'f2', number: 'FAC-2026-0002', dueDate: '2026-02-20', total: 60.5, subtotal: 50 }),
      f({ id: 'f3', clientId: 'c2', clientName: 'Beta', dueDate: '2025-12-01' }),
    ], HOY));
    expect(d.map(x => x.cliente)).toEqual(['Beta', 'Acme SL']);
    expect(d[1]).toMatchObject({ total: 181.5, maxRetraso: 29 });
    expect(d[1].facturas).toHaveLength(2);
  });
});

describe('mensaje', () => {
  const de = { nombre: 'Klima Solutions', email: 'admin@klima.es', telefono: '600 000 000', iban: 'ES91 2100 0418 4502 0005 1332' };

  it('el tono sube con el retraso', () => {
    expect(tonoDe(5)).toBe('amable');
    expect(tonoDe(20)).toBe('recordatorio');
    expect(tonoDe(60)).toBe('firme');
  });

  it('un mensaje con todas las facturas, el total, el IBAN y la firma', () => {
    const [d] = porCliente(vencidas([f({}), f({ id: 'f2', number: 'FAC-2026-0002', dueDate: '2026-02-20' })], HOY));
    const m = mensaje(d, de);
    expect(m.asunto).toBe('Recordatorio: 2 facturas vencidas');
    expect(m.texto).toContain('FAC-2026-0001, vencida el 31/01/2026');
    expect(m.texto).toContain('FAC-2026-0002');
    expect(m.texto).toMatch(/Total pendiente: 242,00\s€/);
    expect(m.texto).toContain('ES91 2100 0418 4502 0005 1332');
    expect(m.texto.trim().endsWith('600 000 000 · admin@klima.es')).toBe(true);
  });

  it('primer aviso de una sola factura', () => {
    const [d] = porCliente(vencidas([f({ dueDate: '2026-02-25' })], HOY));
    const m = mensaje(d, { nombre: 'Klima' });
    expect(m.asunto).toBe('Factura FAC-2026-0001 pendiente de pago');
    expect(m.texto).toContain('no hagáis caso');
    expect(m.texto).not.toContain('transferencia');
  });
});

describe('cuándo toca', () => {
  const [d] = porCliente(vencidas([f({ dueDate: '2026-02-27' })], HOY)); // 2 días
  it('el primero tras los días de gracia; luego cada tantos días', () => {
    expect(toca(d, undefined, HOY, 7, 3)).toBe(false);
    expect(toca(d, undefined, HOY, 7, 1)).toBe(true);
    expect(toca(d, '2026-02-25T09:00:00Z', HOY, 7, 1)).toBe(false);
    expect(toca(d, '2026-02-20T09:00:00Z', HOY, 7, 1)).toBe(true);
  });
});

describe('utilidades', () => {
  it('teléfonos para WhatsApp', () => {
    expect(telefonoWhatsApp('+34 600 12 34 56')).toBe('34600123456');
    expect(telefonoWhatsApp('600123456')).toBe('34600123456');
    expect(telefonoWhatsApp('0034 961 234 567')).toBe('34961234567');
    expect(telefonoWhatsApp('')).toBeNull();
    expect(telefonoWhatsApp('123')).toBeNull();
  });

  it('filas de la base de datos', () => {
    const x = facturaDeFila({ id: 'i', number: 'N', client_id: 'c', client_name: 'C', issue_date: '2026-01-01', due_date: '2026-01-31', status: 'emitida', total: '121.00', subtotal: '100', retencion_pct: '15', paid_amount: null });
    expect(x).toMatchObject({ total: 121, subtotal: 100, retencionPct: 15, paidAmount: 0, sentido: 'venta', tipo: 'factura' });
  });
});
