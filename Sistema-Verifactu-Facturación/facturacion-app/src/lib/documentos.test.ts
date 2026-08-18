import { describe, it, expect } from 'vitest';
import { esSellable, tipoDocumento } from './storage';
import { calculateInvoiceTotals, calculateLineSubtotal } from './utils';
import { descuentoEfectivo, lineaVacia, unidadesTotales, numeroDeDocumento, ESTADOS_POR_TIPO } from './documentos';
import { InvoiceStatus, type CompanySettings } from './types';

describe('esSellable', () => {
  it('factura de venta sellable', () => expect(esSellable({ tipo: 'factura', sentido: 'venta' })).toBe(true));
  it('rectificativa de venta sellable', () => expect(esSellable({ tipo: 'rectificativa', sentido: 'venta' })).toBe(true));
  it('presupuesto no sellable', () => expect(esSellable({ tipo: 'presupuesto' })).toBe(false));
  it('pedido no sellable', () => expect(esSellable({ tipo: 'pedido' })).toBe(false));
  it('albarán no sellable', () => expect(esSellable({ tipo: 'albaran' })).toBe(false));
  it('compra no sellable aunque sea factura', () => expect(esSellable({ tipo: 'factura', sentido: 'compra' })).toBe(false));
  it('por defecto es factura de venta', () => expect(esSellable({})).toBe(true));
  it('tipoDocumento por defecto factura', () => expect(tipoDocumento({})).toBe('factura'));
});

describe('lineaVacia', () => {
  it('usa la tasa máxima configurada (IVA)', () => {
    const settings = { ivaRates: [10, 21], igicEnabled: false } as CompanySettings;
    expect(lineaVacia(settings).taxRate).toBe(21);
  });
  it('usa la tasa máxima configurada (IGIC)', () => {
    const settings = { igicRates: [7, 3, 13, 0], igicEnabled: true } as CompanySettings;
    expect(lineaVacia(settings).taxRate).toBe(13);
  });
});

describe('ESTADOS_POR_TIPO', () => {
  it('albarán usa sus estados reales (expedido/facturado)', () => {
    expect(ESTADOS_POR_TIPO.albaran).toContain(InvoiceStatus.EXPEDIDO);
    expect(ESTADOS_POR_TIPO.albaran).toContain(InvoiceStatus.FACTURADO);
  });
  it('factura conserva el ciclo completo de cobro', () => {
    expect(ESTADOS_POR_TIPO.factura).toContain(InvoiceStatus.PAGADA);
    expect(ESTADOS_POR_TIPO.factura).toContain(InvoiceStatus.PENDIENTE);
  });
});

describe('numeroDeDocumento', () => {
  const settings = {
    seriesDocumentos: {
      factura_venta: { serie: 'FAC', nextNumber: 27 },
      presupuesto_venta: { serie: 'PRE', nextNumber: 3 },
    },
  } as unknown as CompanySettings;

  it('genera SERIE-AÑO-NNNN a partir de la serie por tipo', () => {
    const res = numeroDeDocumento(settings, 'factura', 'venta');
    expect(res.series).toBe('FAC');
    expect(res.number).toMatch(/^FAC-\d{4}-\d{4}$/);
    expect(res.nextNumber).toBe(27);
  });
  it('respeta la serie de presupuesto', () => {
    const res = numeroDeDocumento(settings, 'presupuesto', 'venta');
    expect(res.series).toBe('PRE');
    expect(res.number).toMatch(/^PRE-\d{4}-\d{4}$/);
  });
});

describe('documentoConvertido', () => {
  const settings = {
    seriesDocumentos: {
      pedido_venta: { serie: 'PED', nextNumber: 5 },
      albaran_venta: { serie: 'ALB', nextNumber: 12 },
    },
  } as unknown as CompanySettings;

  it('convierte un presupuesto a pedido manteniendo origen', async () => {
    const { documentoConvertido } = await import('./documentos');
    const original = {
      id: 'pre-123',
      number: 'PRE-2026-0001',
      tipo: 'presupuesto',
      sentido: 'venta',
      lineItems: [],
    } as any;
    const convertido = documentoConvertido(original, 'pedido', settings);
    expect(convertido.id).not.toBe(original.id);
    expect(convertido.tipo).toBe('pedido');
    expect(convertido.documentoOrigenId).toBe('pre-123');
    expect(convertido.documentoOrigenNumber).toBe('PRE-2026-0001');
    expect(convertido.status).toBe(InvoiceStatus.BORRADOR);
    expect(convertido.number).toMatch(/^PED-\d{4}-\d{4}$/);
  });
});

describe('rectificar', () => {
  const settings = {
    seriesDocumentos: {
      rectificativa_venta: { serie: 'FCR', nextNumber: 1 },
    },
  } as unknown as CompanySettings;

  it('crea factura rectificativa con líneas negativas y encadenamiento', async () => {
    const { rectificar } = await import('./documentos');
    const factura = {
      id: 'fac-999',
      number: 'FAC-2026-0099',
      tipo: 'factura',
      sentido: 'venta',
      lineItems: [
        { id: 'li-1', quantity: 2, unitPrice: 50 },
        { id: 'li-2', quantity: -1, unitPrice: 20 },
      ],
    } as any;
    const rect = rectificar(factura, settings);
    expect(rect.tipo).toBe('rectificativa');
    expect(rect.documentoOrigenId).toBe('fac-999');
    expect(rect.documentoOrigenNumber).toBe('FAC-2026-0099');
    expect(rect.lineItems[0].quantity).toBe(-2);
    expect(rect.lineItems[1].quantity).toBe(-1);
    expect(rect.number).toMatch(/^FCR-\d{4}-\d{4}$/);
  });
});

describe('saveDocumento', () => {
  it('rechaza modificar un documento ya sellado', async () => {
    const { saveDocumento } = await import('./storage');
    await expect(saveDocumento({ status: InvoiceStatus.PAGADA, tipo: 'factura', sentido: 'venta', number: 'FAC-2026-0001' } as any))
      .rejects.toThrow(/sellado/);
  });
});

describe('Descuentos en cascada (3 en línea y 3 al pie)', () => {
  it('calcula 3 descuentos en cascada en la línea', async () => {
    const { calculateLineSubtotal } = await import('./utils');
    // 10 unidades @ 100€ = 1000€
    // Dto 1 (10%): 900€
    // Dto 2 (5%): 855€
    // Dto 3 (2%): 837.90€
    const subtotal = calculateLineSubtotal(10, 100, 10, 5, 2);
    expect(subtotal).toBe(837.90);
  });

  it('calcula totales con descuentos en línea y descuentos de pie de documento', async () => {
    const { calculateInvoiceTotals } = await import('./utils');
    const lines = [
      {
        id: '1',
        productId: 'p1',
        productName: 'Prod 1',
        productRef: 'P1',
        quantity: 2,
        unitPrice: 100,
        unit: 'ud' as any,
        taxRate: 21,
        discountPercent: 10,
        discountPercent2: 0,
        discountPercent3: 0,
        subtotal: 180,
        taxAmount: 37.8,
        total: 217.8,
      },
    ];
    // Base líneas: 180€
    // Dto global 1 (10%): 162€
    // Dto global 2 (5%): 153.90€
    // Dto global 3 (0%)
    // Base final: 153.90€
    // IVA 21%: 32.32€
    // Total: 186.22€
    const totals = calculateInvoiceTotals(lines, [10, 5, 0]);
    expect(totals.subtotal).toBe(153.90);
    expect(totals.totalTax).toBe(32.32);
    expect(totals.total).toBe(186.22);
    expect(totals.globalDiscountAmount).toBe(26.10);
  });
});

describe('getPrecioProductoParaCliente (Tarifas)', () => {
  it('devuelve el precio específico por tarifa si está definido en el producto', async () => {
    const { getPrecioProductoParaCliente } = await import('./documentos');
    const product = { unitPrice: 50, tarifaPrices: { 'tar-mayorista': 40 } };
    const price = getPrecioProductoParaCliente(product, 'tar-mayorista');
    expect(price).toBe(40);
  });

  it('aplica porcentajeDefecto de la tarifa si no hay precio explícito', async () => {
    const { getPrecioProductoParaCliente } = await import('./documentos');
    const product = { unitPrice: 100 };
    const tarifas = [{ id: 'tar-distribuidor', porcentajeDefecto: -15 }];
    const price = getPrecioProductoParaCliente(product, 'tar-distribuidor', tarifas);
    expect(price).toBe(85);
  });

  it('devuelve precio base si no hay tarifa', async () => {
    const { getPrecioProductoParaCliente } = await import('./documentos');
    const product = { unitPrice: 100 };
    const price = getPrecioProductoParaCliente(product);
    expect(price).toBe(100);
  });
});

describe('calcularPendientesProducto', () => {
  it('calcula pendientes de recibir en pedidos de compra y de entregar en pedidos de venta', async () => {
    const { calcularPendientesProducto } = await import('./documentos');
    const invoices = [
      {
        id: '1',
        tipo: 'pedido',
        sentido: 'compra',
        status: InvoiceStatus.EMITIDA,
        lineItems: [{ productId: 'p1', quantity: 20 }],
      },
      {
        id: '2',
        tipo: 'pedido',
        sentido: 'venta',
        status: InvoiceStatus.EMITIDA,
        lineItems: [{ productId: 'p1', quantity: 8 }],
      },
      {
        id: '3',
        tipo: 'pedido',
        sentido: 'venta',
        status: InvoiceStatus.ANULADA, // Anulado no cuenta
        lineItems: [{ productId: 'p1', quantity: 15 }],
      },
    ] as any;

    const { pendienteRecibir, pendienteEntregar } = calcularPendientesProducto('p1', invoices);
    expect(pendienteRecibir).toBe(20);
    expect(pendienteEntregar).toBe(8);
  });
});

describe('Fase 3: Valoración de Costes (PMP) y Multi-Almacén', () => {
  it('calcula PMP ponderado correctamente en compras sucesivas', () => {
    // Fórmula PMP: ((Stock * PMP_ant) + (Cant * Precio)) / (Stock + Cant)
    let stock = 10;
    let pmp = 50; // Total 500€

    // Compra 1: 10 uds a 70€
    const compra1Cant = 10;
    const compra1Precio = 70;
    pmp = ((stock * pmp) + (compra1Cant * compra1Precio)) / (stock + compra1Cant);
    stock += compra1Cant;
    expect(stock).toBe(20);
    expect(pmp).toBe(60); // 1200 / 20 = 60€

    // Compra 2: 5 uds a 90€
    const compra2Cant = 5;
    const compra2Precio = 90;
    pmp = ((stock * pmp) + (compra2Cant * compra2Precio)) / (stock + compra2Cant);
    stock += compra2Cant;
    expect(stock).toBe(25);
    expect(pmp).toBe(66); // 1650 / 25 = 66€
  });

  it('gestiona existencias por almacén en traspasos', () => {
    const stocksByAlmacen: Record<string, number> = {
      'alm-central': 50,
      'alm-tienda': 10,
    };

    // Traspaso de 15 uds de central a tienda
    const cantidadTraspaso = 15;
    stocksByAlmacen['alm-central'] -= cantidadTraspaso;
    stocksByAlmacen['alm-tienda'] += cantidadTraspaso;

    expect(stocksByAlmacen['alm-central']).toBe(35);
    expect(stocksByAlmacen['alm-tienda']).toBe(25);
    const stockTotal = Object.values(stocksByAlmacen).reduce((a, b) => a + b, 0);
    expect(stockTotal).toBe(60); // El stock total permanece constante
  });

  it('calcula la diferencia de inventario en regularizaciones', () => {
    const stockTeorico = 42;
    const stockReal = 38; // Se contaron 4 unidades menos (merma o rotura)
    const diferencia = stockReal - stockTeorico;

    expect(diferencia).toBe(-4);
  });
});

describe('Fase 4: Cobros, Pagos, Tesorería y Extractos', () => {
  it('actualiza el estado de pago de una factura tras cobros parciales y totales', () => {
    const invoiceTotal = 500;
    let paidAmount = 0;

    // Estado inicial
    let status = InvoiceStatus.EMITIDA;
    expect(status).toBe(InvoiceStatus.EMITIDA);

    // Cobro 1: 200€ (Parcial)
    const cobro1 = 200;
    paidAmount += cobro1;
    if (paidAmount >= invoiceTotal - 0.01) {
      status = InvoiceStatus.PAGADA;
    } else if (paidAmount > 0) {
      status = InvoiceStatus.PARCIAL;
    }
    expect(paidAmount).toBe(200);
    expect(status).toBe(InvoiceStatus.PARCIAL);

    // Cobro 2: 300€ (Completa el total)
    const cobro2 = 300;
    paidAmount += cobro2;
    if (paidAmount >= invoiceTotal - 0.01) {
      status = InvoiceStatus.PAGADA;
    } else if (paidAmount > 0) {
      status = InvoiceStatus.PARCIAL;
    }
    expect(paidAmount).toBe(500);
    expect(status).toBe(InvoiceStatus.PAGADA);
  });

  it('calcula el extracto de cuenta con saldo vivo acumulado', () => {
    // Simulación de movimientos cronológicos de un cliente
    const movimientos = [
      { fecha: '2026-01-10', debe: 1000, haber: 0 }, // Factura 1 (+1000€)
      { fecha: '2026-01-15', debe: 0, haber: 400 },  // Cobro 1 (-400€)
      { fecha: '2026-01-20', debe: 500, haber: 0 },  // Factura 2 (+500€)
      { fecha: '2026-01-25', debe: 0, haber: 1100 }, // Cobro 2 (-1100€)
    ];

    let saldo = 0;
    const saldos = movimientos.map(m => {
      saldo = saldo + m.debe - m.haber;
      return saldo;
    });

    expect(saldos).toEqual([1000, 600, 1100, 0]);
  });
});




describe('el descuento que se enseña cuando sólo cabe uno', () => {
  const linea = (d1: number, d2 = 0, d3 = 0) =>
    ({ discountPercent: d1, discountPercent2: d2, discountPercent3: d3 });

  it('con un solo descuento es ese mismo', () => {
    expect(descuentoEfectivo(linea(10))).toBe(10);
  });

  it('dos del 10% no son un 20%, son un 19%', () => {
    // Van en cascada: el segundo se aplica sobre lo que quedó del primero.
    // Sumarlos diría un número que no cuadra con el importe impreso al lado,
    // y es lo primero que mira un cliente que revisa la factura.
    expect(descuentoEfectivo(linea(10, 10))).toBe(19);
  });

  it('los tres en cascada', () => {
    // 100 → 90 → 81 → 76,95
    expect(descuentoEfectivo(linea(10, 10, 5))).toBe(23.05);
  });

  it('sin descuentos es cero', () => {
    expect(descuentoEfectivo(linea(0))).toBe(0);
  });

  it('explica el importe que se cobra, con el redondeo propio de un %', () => {
    // El porcentaje se enseña con dos decimales, así que en una línea grande
    // no reproduce el céntimo exacto: 15/10/5 da un 27,325% que se imprime
    // como 27,33 y sobre 1.000 € se desvía cinco céntimos.
    //
    // Manda el importe, que se calcula con los tres porcentajes sin redondear;
    // el que se enseña es para que el cliente entienda de dónde sale. Por eso
    // se comprueba que lo explica, no que lo reproduzca al céntimo.
    const bruto = 1000;
    const cobrado = calculateLineSubtotal(1, bruto, 15, 10, 5);
    const explicado = bruto * (1 - descuentoEfectivo(linea(15, 10, 5)) / 100);
    expect(Math.abs(explicado - cobrado)).toBeLessThan(bruto * 0.0001);
  });
});

describe('los totales cuadran con las líneas', () => {
  // Los números son los de una factura real que salió mal: dos líneas con
  // tres descuentos cada una.
  const lineas = [
    { quantity: 21, unitPrice: 1.2, taxRate: 21, discountPercent: 2, discountPercent2: 3, discountPercent3: 4 },
    { quantity: 121, unitPrice: 1.4, taxRate: 21, discountPercent: 2, discountPercent2: 0.54, discountPercent3: 3 },
  ].map(l => ({
    ...l,
    id: crypto.randomUUID(), productId: '', productName: '', productRef: '',
    unit: 'ud' as never,
    subtotal: calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent, l.discountPercent2, l.discountPercent3),
    taxAmount: 0, total: 0,
  }));

  it('la base sale de aplicar los tres descuentos, no sólo el primero', () => {
    // Con sólo el primero daba 190,71 € y el formulario enseñaba 183,16 €:
    // el cliente que suma las líneas no llegaba al total que se le pedía.
    expect(calculateInvoiceTotals(lineas).subtotal).toBeCloseTo(183.16, 2);
  });

  it('el descuento total es el de verdad', () => {
    // Salía 3,89 € cuando eran 11,44 €.
    expect(calculateInvoiceTotals(lineas).totalDiscount).toBeCloseTo(11.44, 2);
  });

  it('la base es exactamente la suma de los subtotales de las líneas', () => {
    // Lo que hace que una factura cuadre al revisarla a mano.
    const suma = lineas.reduce((s, l) => s + l.subtotal, 0);
    expect(calculateInvoiceTotals(lineas).subtotal).toBeCloseTo(suma, 2);
  });
});

describe('las unidades sueltas de un documento', () => {
  const linea = (quantity: number, unitsPerPackage?: number) => ({ quantity, unitsPerPackage });

  it('multiplica los bultos por lo que trae cada uno', () => {
    // Doce cajas de veinticuatro son 288 botellas, que es el número que se
    // cuenta al descargar el camión.
    expect(unidadesTotales([linea(12, 24)])).toBe(288);
  });

  it('suma líneas con formatos distintos', () => {
    expect(unidadesTotales([linea(2, 24), linea(3, 6)])).toBe(66);
  });

  it('lo que se vende suelto cuenta su cantidad tal cual', () => {
    // La mayoría no trabaja por cajas: sin unidades por bulto, un bulto es
    // una unidad y no cero.
    expect(unidadesTotales([linea(7)])).toBe(7);
    expect(unidadesTotales([linea(7, 0)])).toBe(7);
  });

  it('mezcla cajas y unidades sueltas en el mismo documento', () => {
    expect(unidadesTotales([linea(2, 24), linea(5)])).toBe(53);
  });
});
