/**
 * El contrato y el relleno de datos tienen que ir a la par. Si alguien añade
 * un campo a `contrato.ts` y se olvida de rellenarlo en `datos.ts`, el campo
 * aparece en el selector del revisor, el usuario lo asigna, y la factura sale
 * con ese hueco en blanco sin que nada haya avisado. Este test lo impide.
 */

import { describe, expect, it } from 'vitest';
import { CAMPOS, COLUMNAS_LINEAS, campoPorClave, clavesValidas, datosDeEjemplo } from './contrato';
import { construirDatos } from './datos';
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type CompanySettings, type Invoice } from '../types';

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  email: 'hola@miempresa.es',
  phone: '910 000 000',
  website: 'www.miempresa.es',
  iban: 'ES12 1234 1234 1212 3456 7890',
  bankName: 'Banco Ejemplo',
  invoiceFooterText: 'Gracias por su confianza.',
  logoUrl: '',
  igicEnabled: false,
} as CompanySettings;

const FACTURA: Invoice = {
  id: 'f1',
  number: 'FAC-2026-0001',
  series: 'FAC',
  clientId: 'c1',
  clientName: 'Cliente de Prueba S.A.',
  clientNif: 'A87654321',
  clientAddress: 'Avenida del Puerto 45',
  issueDate: '2026-01-12',
  dueDate: '2026-02-11',
  status: InvoiceStatus.PENDIENTE,
  lineItems: [{
    id: 'l1',
    productId: 'p1',
    productName: 'Tomate rama',
    productRef: 'REF-001',
    quantity: 10,
    unitPrice: 12.5,
    unit: UnitOfMeasure.KG,
    taxRate: 21,
    discountPercent: 5,
    subtotal: 118.75,
    taxAmount: 24.94,
    total: 143.69,
  }],
  subtotal: 118.75,
  totalDiscount: 6.25,
  taxBreakdown: [{ rate: 21, base: 118.75, amount: 24.94 }],
  totalTax: 24.94,
  total: 143.69,
  paymentMethod: PaymentMethod.TRANSFERENCIA,
  notes: 'Entregar por la mañana.',
  createdAt: '2026-01-12T09:00:00.000Z',
  updatedAt: '2026-01-12T09:00:00.000Z',
};

describe('contrato de campos', () => {
  const datos = construirDatos({ tipo: 'factura', documento: FACTURA }, AJUSTES);

  it('rellena todas las claves del contrato', () => {
    for (const campo of CAMPOS) {
      expect(datos.campos[campo.clave], `falta la clave ${campo.clave}`).toBeTypeOf('string');
    }
  });

  it('no inventa claves que el contrato no conozca', () => {
    const validas = clavesValidas();
    for (const clave of Object.keys(datos.campos)) {
      expect(validas.has(clave), `la clave ${clave} no está en el contrato`).toBe(true);
    }
  });

  it('rellena todas las columnas de la tabla de líneas', () => {
    for (const columna of COLUMNAS_LINEAS) {
      expect(datos.lineas[0][columna.clave], `falta la columna ${columna.clave}`).toBeTypeOf('string');
    }
  });

  it('usa nombres de campo válidos como identificador', () => {
    // pdfme evalúa `{clave}` como expresión JavaScript en la cabecera y el
    // pie: un punto o un guion la romperían.
    for (const campo of CAMPOS) {
      expect(campo.clave).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('da un ejemplo para previsualizar sin factura real', () => {
    const ejemplo = datosDeEjemplo();
    expect(ejemplo.doc_numero).toBeTruthy();
    expect(Object.keys(ejemplo).length).toBe(CAMPOS.length);
  });
});

describe('formato de los datos', () => {
  const datos = construirDatos({ tipo: 'factura', documento: FACTURA }, AJUSTES);

  it('formatea importes y fechas a la española', () => {
    expect(datos.campos.total_general).toMatch(/143,69/);
    expect(datos.campos.doc_fecha).toBe('12/01/2026');
  });

  it('llama IGIC al impuesto cuando la empresa está en Canarias', () => {
    const canarias = construirDatos(
      { tipo: 'factura', documento: FACTURA },
      { ...AJUSTES, igicEnabled: true },
    );
    expect(canarias.campos.total_impuesto_nombre).toBe('IGIC');
    expect(canarias.impuestos[0].nombre).toContain('IGIC');
  });

  it('marca el descuento de la línea con un guion cuando no hay', () => {
    const sinDescuento = construirDatos(
      { tipo: 'factura', documento: { ...FACTURA, lineItems: [{ ...FACTURA.lineItems[0], discountPercent: 0 }] } },
      AJUSTES,
    );
    expect(sinDescuento.lineas[0].descuento_pct).toBe('—');
  });

  it('no inventa el QR de cotejo de una factura sin sellar', () => {
    expect(datos.campos.verifactu_qr).toBe('');
    expect(datos.campos.verifactu_huella).toBe('');
  });
});

describe('campos manuales', () => {
  it('los campos custom_1..5 están marcados como manuales', () => {
    for (const n of ['1', '2', '3', '4', '5']) {
      const campo = campoPorClave(`custom_${n}`);
      expect(campo?.manual).toBe(true);
    }
  });

  it('ningún campo con fuente automática es manual', () => {
    for (const clave of ['empresa_nombre', 'cliente_nombre', 'doc_numero', 'total_general']) {
      expect(campoPorClave(clave)?.manual).toBeFalsy();
    }
  });
});
