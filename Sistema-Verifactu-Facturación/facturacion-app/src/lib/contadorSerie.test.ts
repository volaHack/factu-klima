import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompanySettings } from './types';

// Los ajustes guardados, de mentira: aquí sólo importa qué contador sube.
const ajustes = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }));
const storage = vi.hoisted(() => ({
  getCompanySettings: vi.fn(async () => ajustes.actual),
  saveCompanySettings: vi.fn(async (s: Record<string, unknown>) => { ajustes.actual = s; }),
}));
vi.mock('./storage', async (original) => ({ ...(await original<typeof import('./storage')>()), ...storage }));

import { actualizarContadorSerie, numeroDeDocumento } from './documentos';

const base = (): Record<string, unknown> => ({
  businessName: 'Distribuciones Rogar S.L.',
  invoiceSeries: 'F', nextInvoiceNumber: 1200,
  albaranSeries: 'ALB', nextAlbaranNumber: 30,
  seriesDocumentos: { pedido_venta: { serie: 'PED', nextNumber: 9 }, factura_venta: { serie: 'FAC', nextNumber: 27 } },
});

beforeEach(() => { vi.clearAllMocks(); ajustes.actual = base(); });

describe('actualizarContadorSerie', () => {
  it('la factura sacada de un documento sube el contador de Facturas: la siguiente «Nueva factura» no repite número', async () => {
    const s = ajustes.actual as unknown as CompanySettings;
    const { number } = numeroDeDocumento(s, 'factura', 'venta');
    expect(number).toMatch(/^F-\d{4}-1200$/);
    await actualizarContadorSerie(s, 'factura_venta', number);
    const guardado = ajustes.actual as unknown as CompanySettings;
    expect(guardado.nextInvoiceNumber).toBe(1201);
    expect(guardado.seriesDocumentos?.factura_venta).toEqual({ serie: 'F', nextNumber: 1201 });
    expect(numeroDeDocumento(guardado, 'factura', 'venta').number).toMatch(/-1201$/);
  });

  it('el albarán sube también el contador de la pantalla Albaranes', async () => {
    await actualizarContadorSerie(ajustes.actual as unknown as CompanySettings, 'albaran_venta', 'ALB-2026-0030');
    expect((ajustes.actual as unknown as CompanySettings).nextAlbaranNumber).toBe(31);
  });

  it('un número de la serie del vendedor no hace saltar el contador de la empresa', async () => {
    await actualizarContadorSerie(ajustes.actual as unknown as CompanySettings, 'pedido_venta', 'V1P-2026-0050');
    expect(storage.saveCompanySettings).not.toHaveBeenCalled();
    expect((ajustes.actual as unknown as CompanySettings).seriesDocumentos?.pedido_venta?.nextNumber).toBe(9);
  });

  it('parte de los ajustes de ahora, no de la copia que la pantalla cargó al abrirse', async () => {
    const copiaVieja = base() as unknown as CompanySettings;
    ajustes.actual = { ...base(), businessName: 'Rogar (cambiado en otra pestaña)', nextInvoiceNumber: 1250 };
    await actualizarContadorSerie(copiaVieja, 'pedido_venta', 'PED-2026-0009');
    const guardado = ajustes.actual as unknown as CompanySettings;
    expect(guardado.businessName).toBe('Rogar (cambiado en otra pestaña)');
    expect(guardado.nextInvoiceNumber).toBe(1250);
    expect(guardado.seriesDocumentos?.pedido_venta?.nextNumber).toBe(10);
  });

  it('nunca baja un contador que ya iba por delante', async () => {
    await actualizarContadorSerie(ajustes.actual as unknown as CompanySettings, 'pedido_venta', 'PED-2026-0003');
    expect((ajustes.actual as unknown as CompanySettings).seriesDocumentos?.pedido_venta?.nextNumber).toBe(9);
  });
});
