import { describe, it, expect } from 'vitest';
import { facturasParaRappel, tramoAplicable, calcularRappel, resumenRappels } from './rappels';
import { InvoiceStatus, type Invoice, type RappelConfig } from './types';

const config = (extra: Partial<RappelConfig> = {}): RappelConfig => ({
  id: 'r1', nombre: 'Rappel anual', activo: true,
  tramos: [{ desde: 5000, porcentaje: 2 }, { desde: 10000, porcentaje: 3 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Cliente', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 1000, totalDiscount: 0, totalTax: 210, total: 1210,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'venta',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('facturasParaRappel', () => {
  it('sin cliente, cuenta todas las ventas', () => {
    const facturas = [factura({ clientId: 'c1' }), factura({ clientId: 'c2' })];
    expect(facturasParaRappel(facturas, undefined)).toHaveLength(2);
  });

  it('con cliente, sólo las suyas', () => {
    const facturas = [factura({ clientId: 'c1' }), factura({ clientId: 'c2' })];
    expect(facturasParaRappel(facturas, 'c1')).toHaveLength(1);
  });

  it('presupuestos y pedidos no cuentan', () => {
    const facturas = [factura({ tipo: 'presupuesto' }), factura({ tipo: 'pedido' })];
    expect(facturasParaRappel(facturas, undefined)).toHaveLength(0);
  });

  it('borradores y anuladas no cuentan', () => {
    const facturas = [factura({ status: InvoiceStatus.BORRADOR }), factura({ status: InvoiceStatus.ANULADA })];
    expect(facturasParaRappel(facturas, undefined)).toHaveLength(0);
  });
});

describe('tramoAplicable', () => {
  const tramos = [{ desde: 5000, porcentaje: 2 }, { desde: 10000, porcentaje: 3 }];

  it('por debajo del primer tramo, ninguno', () => {
    expect(tramoAplicable(1000, tramos)).toBeNull();
  });

  it('entre el primero y el segundo, el primero', () => {
    expect(tramoAplicable(7000, tramos)?.porcentaje).toBe(2);
  });

  it('por encima del segundo, el segundo', () => {
    expect(tramoAplicable(12000, tramos)?.porcentaje).toBe(3);
  });

  it('justo en el umbral, ya cuenta ese tramo', () => {
    expect(tramoAplicable(5000, tramos)?.porcentaje).toBe(2);
  });

  it('no es acumulativo: se cobra el tramo más alto sobre todo, no por escalones', () => {
    // Si fuera acumulativo, 12000 daría 5000×2% + 5000×2%(hasta 10000, mismo
    // tramo en este caso)... la prueba clave es que el tramo elegido se
    // aplica sobre la base ENTERA en calcularRappel, no aquí trocitos.
    const tramo = tramoAplicable(12000, tramos);
    expect(tramo).toEqual({ desde: 10000, porcentaje: 3 });
  });

  it('sin tramos, nada', () => {
    expect(tramoAplicable(99999, [])).toBeNull();
  });

  it('da igual el orden en que vengan los tramos', () => {
    const desordenados = [{ desde: 10000, porcentaje: 3 }, { desde: 5000, porcentaje: 2 }];
    expect(tramoAplicable(7000, desordenados)?.porcentaje).toBe(2);
  });
});

describe('calcularRappel', () => {
  it('el importe es el porcentaje del tramo sobre TODA la base, no por escalones', () => {
    const facturas = [factura({ subtotal: 12000, total: 14520 })];
    const r = calcularRappel(config(), facturas);
    // 12000 × 3% = 360, no (5000×2% + 7000×3%) = 100+210 = 310.
    expect(r.importeRappel).toBe(360);
  });

  it('la base es el subtotal, no el total con IVA', () => {
    const facturas = [factura({ subtotal: 6000, total: 7260 })];
    const r = calcularRappel(config(), facturas);
    expect(r.baseCalculo).toBe(6000);
  });

  it('sin llegar a ningún tramo, el rappel es cero', () => {
    const facturas = [factura({ subtotal: 100 })];
    const r = calcularRappel(config(), facturas);
    expect(r.tramo).toBeNull();
    expect(r.importeRappel).toBe(0);
  });

  it('suma varias facturas del cliente', () => {
    const facturas = [
      factura({ clientId: 'c1', subtotal: 3000 }),
      factura({ clientId: 'c1', subtotal: 3000 }),
    ];
    const r = calcularRappel(config({ clienteId: 'c1' }), facturas);
    expect(r.baseCalculo).toBe(6000);
  });

  it('un rappel sin cliente asignado cuenta todas las ventas de la empresa', () => {
    const facturas = [factura({ clientId: 'c1', subtotal: 4000 }), factura({ clientId: 'c2', subtotal: 4000 })];
    const r = calcularRappel(config({ clienteId: undefined }), facturas);
    expect(r.baseCalculo).toBe(8000);
  });
});

describe('resumenRappels', () => {
  it('sólo las reglas activas', () => {
    const configs = [config({ id: 'r1', activo: true }), config({ id: 'r2', activo: false })];
    const facturas = [factura({ subtotal: 12000 })];
    expect(resumenRappels(configs, facturas).map(r => r.configId)).toEqual(['r1']);
  });

  it('ordena de más importe a menos', () => {
    const configs = [
      config({ id: 'r1', clienteId: 'c1', tramos: [{ desde: 100, porcentaje: 1 }] }),
      config({ id: 'r2', clienteId: 'c2', tramos: [{ desde: 100, porcentaje: 10 }] }),
    ];
    const facturas = [
      factura({ clientId: 'c1', subtotal: 1000 }),
      factura({ clientId: 'c2', subtotal: 1000 }),
    ];
    expect(resumenRappels(configs, facturas).map(r => r.configId)).toEqual(['r2', 'r1']);
  });

  it('sin reglas ni facturas no revienta', () => {
    expect(resumenRappels([], [])).toEqual([]);
  });
});
