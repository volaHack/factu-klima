/**
 * El contrato y el relleno de datos tienen que ir a la par. Si alguien añade
 * un campo a `contrato.ts` y se olvida de rellenarlo en `datos.ts`, el campo
 * aparece en el selector del revisor, el usuario lo asigna, y la factura sale
 * con ese hueco en blanco sin que nada haya avisado. Este test lo impide.
 */

import { describe, expect, it } from 'vitest';
import {
  CAMPOS, COLUMNAS_LINEAS, campoPorClave, clavesValidas, datosDeEjemplo,
  esColumnaPersonalizada, etiquetaDeColumnaPersonalizada, siguienteColumnaPersonalizada,
} from './contrato';
import {
  construirDatos, clienteManualComoDatosExtras, customColsDeLineas, lineasConCustomCols,
} from './datos';
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type Client, type CompanySettings, type Invoice } from '../types';

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

describe('cliente ocasional (sin ficha)', () => {
  const manual = {
    nombre: 'María López García',
    nif: '12345678Z',
    direccion: 'Calle del Pino 7',
    cp: '41001',
    ciudad: 'Sevilla',
    provincia: 'Sevilla',
    email: 'maria@ejemplo.es',
    telefono: '954 111 222',
  };

  const facturaManual = {
    ...FACTURA,
    clientId: '',
    clientName: manual.nombre,
    clientNif: manual.nif,
    clientAddress: manual.direccion,
    datosExtras: { ...clienteManualComoDatosExtras(manual) },
  };

  it('rellena los campos del receptor desde el cliente ocasional', () => {
    const datos = construirDatos({ tipo: 'factura', documento: facturaManual }, AJUSTES);
    expect(datos.campos.cliente_nombre).toBe(manual.nombre);
    expect(datos.campos.cliente_nif).toBe(manual.nif);
    expect(datos.campos.cliente_direccion).toBe(manual.direccion);
    expect(datos.campos.cliente_cp).toBe(manual.cp);
    expect(datos.campos.cliente_ciudad).toBe(manual.ciudad);
    expect(datos.campos.cliente_provincia).toBe(manual.provincia);
    expect(datos.campos.cliente_email).toBe(manual.email);
    expect(datos.campos.cliente_telefono).toBe(manual.telefono);
    expect(datos.campos.cliente_poblacion).toContain(manual.cp);
    expect(datos.campos.cliente_poblacion).toContain(manual.ciudad);
  });

  it('no rellena CP/ciudad/provincia sin cliente manual', () => {
    const datos = construirDatos({ tipo: 'factura', documento: FACTURA }, AJUSTES);
    expect(datos.campos.cliente_cp).toBe('');
    expect(datos.campos.cliente_ciudad).toBe('');
    expect(datos.campos.cliente_provincia).toBe('');
  });

  it('la ficha del cliente manda cuando existe', () => {
    const conCliente = construirDatos({ tipo: 'factura', documento: facturaManual }, AJUSTES, {
      cliente: { id: 'c1', nif: 'A87654321', address: 'Avenida del Puerto 45', postalCode: '28001', city: 'Madrid', province: 'Madrid', email: 'c@ejemplo.es', phone: '910 000 000' } as Client,
    });
    expect(conCliente.campos.cliente_cp).toBe('28001');
    expect(conCliente.campos.cliente_ciudad).toBe('Madrid');
    expect(conCliente.campos.cliente_email).toBe('c@ejemplo.es');
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

describe('columnas personalizadas', () => {
  it('reconoce solo claves custom_col_N', () => {
    expect(esColumnaPersonalizada('custom_col_1')).toBe(true);
    expect(esColumnaPersonalizada('custom_col_42')).toBe(true);
    expect(esColumnaPersonalizada('custom_1')).toBe(false);
    expect(esColumnaPersonalizada('nombre')).toBe(false);
  });

  it('asigna la siguiente clave libre', () => {
    expect(siguienteColumnaPersonalizada([])).toBe('custom_col_1');
    expect(siguienteColumnaPersonalizada(['custom_col_1', 'custom_col_3'])).toBe('custom_col_2');
    expect(siguienteColumnaPersonalizada(['custom_col_1', 'custom_col_2'])).toBe('custom_col_3');
  });

  it('etiqueta la columna para mostrar en el selector', () => {
    expect(etiquetaDeColumnaPersonalizada('custom_col_4')).toBe('Dato de columna 4');
  });

  it('redondea ida y vuelta de customCols por línea en datosExtras', () => {
    const lineas = [{
      ...FACTURA.lineItems[0],
      customCols: { custom_col_1: 'PALETS', custom_col_2: '5' },
    }];
    const extras = customColsDeLineas(lineas);
    expect(extras).toHaveProperty('__lineas');
    const vueltas = lineasConCustomCols(lineas, extras);
    expect(vueltas[0].customCols).toEqual({ custom_col_1: 'PALETS', custom_col_2: '5' });
  });

  it('conserva customCols de la línea cuando no hay datos guardados', () => {
    const lineas = [{ ...FACTURA.lineItems[0], customCols: { custom_col_1: 'X' } }];
    const vueltas = lineasConCustomCols(lineas, {});
    expect(vueltas[0].customCols).toEqual({ custom_col_1: 'X' });
  });

  it('rellena celdas custom_col_N en la tabla de líneas', () => {
    const conCols = construirDatos(
      { tipo: 'factura', documento: { ...FACTURA, lineItems: [{
        ...FACTURA.lineItems[0], customCols: { custom_col_1: 'PALETS' },
      }] } },
      AJUSTES,
    );
    expect(conCols.lineas[0].custom_col_1).toBe('PALETS');
  });
});
