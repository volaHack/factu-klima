import { describe, it, expect } from 'vitest';
import {
  esOperacionIntracomunitaria, tipoOperacion349, generarDatos349,
  generarFichero349, validarVatNumber, calcularResumenIntracomunitarias,
} from './intracomunitarias';
import type { Invoice, Client, CompanySettings, UnitOfMeasure } from './types';

const baseClient: Client = {
  id: 'c1', nif: '12345678Z', businessName: 'Cliente Español', tradeName: 'Test',
  email: '', phone: '', contactPerson: '', address: 'Calle 1', city: 'Madrid',
  postalCode: '28001', province: 'Madrid', country: 'ES',
  paymentDays: 30, defaultPaymentMethod: 'transferencia' as any,
  notes: '', active: true, createdAt: '', updatedAt: '',
};

const settings: CompanySettings = {
  businessName: 'Mi Empresa S.L.',
  nif: 'B12345678',
  tradeName: 'Test',
  sector: 'informatica',
  accentTheme: 'rose',
  email: '',
  phone: '',
  website: '',
  address: 'Calle Test 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  invoiceSeries: 'F',
  nextInvoiceNumber: 1,
  defaultPaymentDays: 30,
  defaultPaymentMethod: 'transferencia' as any,
  invoiceFooterText: '',
  tpvSeries: 'T',
  nextTpvNumber: 1,
  iban: '',
  bankName: '',
  verifactuEnabled: true,
  logoUrl: '',
};

const baseInvoice: Invoice = {
  id: 'inv-1',
  number: 'F-2026-0001',
  series: 'F',
  clientId: 'c1',
  clientName: 'Entreprise Française SARL',
  clientNif: '',
  clientAddress: 'Rue de Paris 1',
  issueDate: '2026-08-01',
  dueDate: '2026-09-01',
  status: 'emitida' as any,
  lineItems: [
    {
      id: 'li-1', productId: 'p1', productName: 'Servicio', productRef: 'S01',
      quantity: 1, unitPrice: 5000, unit: 'ud' as UnitOfMeasure,
      taxRate: 0, discountPercent: 0, subtotal: 5000, taxAmount: 0, total: 5000,
    },
  ],
  subtotal: 5000,
  totalDiscount: 0,
  taxBreakdown: [{ rate: 0, base: 5000, amount: 0 }],
  totalTax: 0,
  total: 5000,
  paymentMethod: 'transferencia' as any,
  notes: '',
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
  tipo: 'factura',
  sentido: 'venta',
  esIntracomunitaria: true,
  clientVatNumber: 'FR12345678901',
};

describe('esOperacionIntracomunitaria', () => {
  it('devuelve false para clientes españoles', () => {
    expect(esOperacionIntracomunitaria(baseClient)).toBe(false);
  });

  it('devuelve true para clientes con país UE no español', () => {
    const french = { ...baseClient, country: 'FR' };
    expect(esOperacionIntracomunitaria(french)).toBe(true);
  });

  it('devuelve true para clientes con VAT Number de país UE', () => {
    const withVat = { ...baseClient, vatNumber: 'DE123456789' };
    expect(esOperacionIntracomunitaria(withVat)).toBe(true);
  });

  it('devuelve false para clientes con VAT español', () => {
    const esVat = { ...baseClient, vatNumber: 'ESB12345678' };
    expect(esOperacionIntracomunitaria(esVat)).toBe(false);
  });

  it('devuelve false para países fuera de la UE', () => {
    const uk = { ...baseClient, country: 'GB' };
    expect(esOperacionIntracomunitaria(uk)).toBe(false);
  });
});

describe('tipoOperacion349', () => {
  it('devuelve E para entregas de bienes intracomunitarias', () => {
    const bienes: Invoice = {
      ...baseInvoice,
      lineItems: [
        { ...baseInvoice.lineItems[0], unit: 'kg' as UnitOfMeasure },
      ],
    };
    expect(tipoOperacion349(bienes)).toBe('E');
  });

  it('devuelve S para prestaciones de servicios', () => {
    expect(tipoOperacion349(baseInvoice)).toBe('S');
  });

  it('devuelve A para adquisiciones de bienes', () => {
    const compra: Invoice = {
      ...baseInvoice,
      sentido: 'compra',
      lineItems: [
        { ...baseInvoice.lineItems[0], unit: 'caja' as UnitOfMeasure },
      ],
    };
    expect(tipoOperacion349(compra)).toBe('A');
  });

  it('devuelve I para adquisiciones de servicios', () => {
    const compraServicio: Invoice = {
      ...baseInvoice,
      sentido: 'compra',
    };
    expect(tipoOperacion349(compraServicio)).toBe('I');
  });

  it('devuelve null si no es intracomunitaria', () => {
    const nacional: Invoice = { ...baseInvoice, esIntracomunitaria: false };
    expect(tipoOperacion349(nacional)).toBeNull();
  });
});

describe('generarDatos349', () => {
  it('agrupa operaciones por operador y clave', () => {
    const inv2: Invoice = {
      ...baseInvoice, id: 'inv-2', number: 'F-2026-0002',
      subtotal: 3000, total: 3000,
    };
    const datos = generarDatos349([baseInvoice, inv2], 2026, '3T');
    expect(datos.ejercicio).toBe(2026);
    expect(datos.periodo).toBe('3T');
    expect(datos.totalOperaciones).toBe(1); // misma clave + operador → se suma
    expect(datos.totalBaseImponible).toBe(8000);
  });

  it('separa operadores con diferente clave', () => {
    const compra: Invoice = {
      ...baseInvoice, id: 'inv-2', sentido: 'compra',
      clientVatNumber: 'FR12345678901',
      tipoOperacion349: 'I',
    };
    const datos = generarDatos349([baseInvoice, compra], 2026, '3T');
    expect(datos.totalOperaciones).toBe(2);
  });

  it('ignora presupuestos y borradores', () => {
    const borrador: Invoice = { ...baseInvoice, status: 'borrador' as any };
    const datos = generarDatos349([borrador], 2026, '3T');
    expect(datos.totalOperaciones).toBe(0);
  });
});

describe('generarFichero349', () => {
  it('genera fichero con registro tipo 1 y tipo 2', () => {
    const datos = generarDatos349([baseInvoice], 2026, '3T');
    const fichero = generarFichero349(datos, settings);
    const lineas = fichero.split('\r\n');

    expect(lineas.length).toBe(2);
    expect(lineas[0][0]).toBe('1'); // Registro declarante
    expect(lineas[1][0]).toBe('2'); // Registro operador

    // El NIF del declarante está en posiciones 9-17
    expect(lineas[0].substring(8, 17)).toBe('B12345678');
  });

  it('cada línea tiene exactamente 500 caracteres', () => {
    const datos = generarDatos349([baseInvoice], 2026, '3T');
    const fichero = generarFichero349(datos, settings);
    const lineas = fichero.split('\r\n');
    for (const linea of lineas) {
      expect(linea.length).toBe(500);
    }
  });
});

describe('validarVatNumber', () => {
  it('valida un VAT francés correcto', () => {
    const result = validarVatNumber('FR12345678901');
    expect(result.valido).toBe(true);
    expect(result.pais).toBe('Francia');
  });

  it('valida un VAT alemán correcto', () => {
    const result = validarVatNumber('DE123456789');
    expect(result.valido).toBe(true);
    expect(result.pais).toBe('Alemania');
  });

  it('rechaza un VAT español (no se usa para intracomunitaria)', () => {
    const result = validarVatNumber('ESB12345678');
    expect(result.valido).toBe(false);
    expect(result.error).toContain('españoles');
  });

  it('rechaza un VAT con formato incorrecto', () => {
    const result = validarVatNumber('FR123');
    expect(result.valido).toBe(false);
  });

  it('rechaza un país que no es UE', () => {
    const result = validarVatNumber('US12345');
    expect(result.valido).toBe(false);
    expect(result.error).toContain('UE');
  });

  it('rechaza cadena vacía o demasiado corta', () => {
    expect(validarVatNumber('').valido).toBe(false);
    expect(validarVatNumber('FR').valido).toBe(false);
  });

  it('valida un VAT portugués correcto', () => {
    expect(validarVatNumber('PT123456789').valido).toBe(true);
  });

  it('valida un VAT italiano correcto', () => {
    expect(validarVatNumber('IT12345678901').valido).toBe(true);
  });
});

describe('calcularResumenIntracomunitarias', () => {
  it('cuenta entregas y servicios', () => {
    const bienes: Invoice = {
      ...baseInvoice, id: 'inv-2',
      lineItems: [{ ...baseInvoice.lineItems[0], unit: 'kg' as UnitOfMeasure }],
      tipoOperacion349: 'E',
    };
    const resumen = calcularResumenIntracomunitarias([baseInvoice, bienes]);
    expect(resumen.operaciones).toBe(2);
    expect(resumen.totalServicios).toBe(5000);
    expect(resumen.totalEntregas).toBe(5000);
  });

  it('detecta facturas incompletas (sin VAT Number)', () => {
    const sinVat: Invoice = { ...baseInvoice, clientVatNumber: undefined };
    const resumen = calcularResumenIntracomunitarias([sinVat]);
    expect(resumen.facturasIncompletas).toBe(1);
  });
});
