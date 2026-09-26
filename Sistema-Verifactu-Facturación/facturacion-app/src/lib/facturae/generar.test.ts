import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Invoice } from '../types';
import { generarFacturae, partirNombre, problemasFacturae, type DatosFacturae } from './generar';

const EMPRESA = {
  businessName: 'Distribuciones Ejemplo SL', nif: 'B12345674', address: 'Calle Mayor 1', city: 'Valencia',
  postalCode: '46001', province: 'Valencia', iban: 'ES91 2100 0418 4502 0005 1332', igicEnabled: false,
};

function factura(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'f1', number: 'FAC-2026-0012', series: 'FAC', clientId: 'c1', clientName: 'Cliente Destino SA', clientNif: 'A58818501',
    clientAddress: 'Av. Diagonal 1', issueDate: '2026-09-20', dueDate: '2026-10-20', status: 'emitida',
    lineItems: [
      { id: 'l1', productId: 'p1', productName: 'Queso curado', productRef: 'Q-12', quantity: 10, unitPrice: 10, unit: 'kg', taxRate: 21, discountPercent: 10, subtotal: 90, taxAmount: 18.9, total: 108.9 },
      { id: 'l2', productId: 'p2', productName: 'Servicio de transporte', productRef: '', quantity: 1, unitPrice: 10, unit: 'ud', taxRate: 21, discountPercent: 0, subtotal: 10, taxAmount: 2.1, total: 12.1 },
    ],
    subtotal: 100, totalDiscount: 10, taxBreakdown: [{ rate: 21, base: 100, amount: 21 }], totalTax: 21, total: 121,
    paymentMethod: 'transferencia', notes: 'Gracias por su compra', createdAt: '', updatedAt: '', tipo: 'factura',
    ...over,
  } as Invoice;
}

const CLIENTE = { businessName: 'Cliente Destino SA', nif: 'A58818501', address: 'Av. Diagonal 1', city: 'Barcelona', postalCode: '08019', province: 'Barcelona', country: 'España' };

const CASOS: Record<string, DatosFacturae> = {
  sociedad: { factura: factura(), empresa: EMPRESA, cliente: CLIENTE },
  autonomo_emisor: { factura: factura(), empresa: { ...EMPRESA, businessName: 'GARCIA LOPEZ ALEXANDER', nif: '78837942Z' }, cliente: CLIENTE },
  igic: {
    factura: factura({ taxBreakdown: [{ rate: 7, base: 100, amount: 7 }], totalTax: 7, total: 107, lineItems: factura().lineItems.map(l => ({ ...l, taxRate: 7, taxAmount: l.subtotal * 0.07 })) }),
    empresa: { ...EMPRESA, igicEnabled: true, province: 'Las Palmas', postalCode: '35001', city: 'Las Palmas de Gran Canaria' }, cliente: CLIENTE,
  },
  retencion: { factura: factura({ retencionPct: 15 }), empresa: { ...EMPRESA, businessName: 'GARCIA LOPEZ ALEXANDER', nif: '78837942Z' }, cliente: CLIENTE },
  rectificativa: {
    factura: factura({ tipo: 'rectificativa', number: 'FCR-2026-0001', series: 'FCR', documentoOrigenNumber: 'FAC-2026-0012', subtotal: -10, totalTax: -2.1, total: -12.1, taxBreakdown: [{ rate: 21, base: -10, amount: -2.1 }], lineItems: [factura().lineItems[1]].map(l => ({ ...l, quantity: -1, subtotal: -10, taxAmount: -2.1, total: -12.1 })) }),
    empresa: EMPRESA, cliente: CLIENTE,
  },
  descuento_al_pie: { factura: factura({ globalDiscountPercent1: 5, subtotal: 95, totalTax: 19.95, total: 114.95, taxBreakdown: [{ rate: 21, base: 95, amount: 19.95 }] } as Partial<Invoice>), empresa: EMPRESA, cliente: CLIENTE },
  extranjero: { factura: factura({ clientNif: 'FR12345678901', taxBreakdown: [{ rate: 0, base: 100, amount: 0 }], totalTax: 0, total: 100 }), empresa: EMPRESA, cliente: { ...CLIENTE, nif: 'FR12345678901', country: 'Francia', city: 'Paris', postalCode: '75001', province: 'Paris' } },
  administracion: {
    factura: factura({ clientNif: 'P4600000J', clientName: 'Ayuntamiento de Ejemplo' }), empresa: EMPRESA,
    cliente: { ...CLIENTE, businessName: 'Ayuntamiento de Ejemplo', nif: 'P4600000J', dir3: { oficinaContable: 'L01460001', organoGestor: 'L01460001', unidadTramitadora: 'L01460001' } },
  },
};

describe('generarFacturae', () => {
  const salida = process.env.FACTURAE_SALIDA;

  for (const [nombre, datos] of Object.entries(CASOS)) {
    it(`genera un XML bien formado: ${nombre}`, () => {
      const xml = generarFacturae(datos);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><fe:Facturae')).toBe(true);
      expect(xml).toContain('<SchemaVersion>3.2.2</SchemaVersion>');
      // Para validarlo contra el esquema oficial con xmllint (ver el PR).
      if (salida) writeFileSync(join(salida, `${nombre}.xml`), xml);
    });
  }

  it('la sociedad va como LegalEntity y el NIF con ES delante', () => {
    const xml = generarFacturae(CASOS.sociedad);
    expect(xml).toContain('<PersonTypeCode>J</PersonTypeCode><ResidenceTypeCode>R</ResidenceTypeCode><TaxIdentificationNumber>ESB12345674</TaxIdentificationNumber>');
    expect(xml).toContain('<CorporateName>Distribuciones Ejemplo SL</CorporateName>');
  });

  it('el autónomo va como Individual, con nombre y apellidos separados', () => {
    const xml = generarFacturae(CASOS.autonomo_emisor);
    expect(xml).toContain('<Individual><Name>ALEXANDER</Name><FirstSurname>GARCIA</FirstSurname><SecondSurname>LOPEZ</SecondSurname>');
  });

  it('IGIC con el código 03 e IVA con el 01', () => {
    expect(generarFacturae(CASOS.igic)).toContain('<TaxTypeCode>03</TaxTypeCode><TaxRate>7.00</TaxRate>');
    expect(generarFacturae(CASOS.sociedad)).toContain('<TaxTypeCode>01</TaxTypeCode><TaxRate>21.00</TaxRate>');
  });

  it('la retención de IRPF va en TaxesWithheld y rebaja lo que se paga', () => {
    const xml = generarFacturae(CASOS.retencion);
    expect(xml).toContain('<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>15.00</TaxRate>');
    expect(xml).toContain('<InvoiceTotal>121.00</InvoiceTotal><TotalOutstandingAmount>106.00</TotalOutstandingAmount>');
  });

  it('la serie va aparte del número', () => {
    expect(generarFacturae(CASOS.sociedad)).toContain('<InvoiceNumber>2026-0012</InvoiceNumber><InvoiceSeriesCode>FAC</InvoiceSeriesCode>');
  });

  it('la rectificativa lleva el bloque Corrective con la factura que corrige', () => {
    const xml = generarFacturae(CASOS.rectificativa);
    expect(xml).toContain('<InvoiceClass>OR</InvoiceClass><Corrective><InvoiceNumber>FAC-2026-0012</InvoiceNumber><ReasonCode>10</ReasonCode>');
  });

  it('las unidades DIR3 de una Administración van en AdministrativeCentres', () => {
    const xml = generarFacturae(CASOS.administracion);
    expect(xml).toContain('<CentreCode>L01460001</CentreCode><RoleTypeCode>01</RoleTypeCode>');
    expect(xml).toContain('<RoleTypeCode>03</RoleTypeCode>');
  });

  it('el cliente extranjero no lleva ES y va con dirección fuera de España', () => {
    const xml = generarFacturae(CASOS.extranjero);
    expect(xml).toContain('<ResidenceTypeCode>U</ResidenceTypeCode><TaxIdentificationNumber>FR12345678901</TaxIdentificationNumber>');
    expect(xml).toContain('<CountryCode>FRA</CountryCode>');
  });

  it('escapa los caracteres especiales', () => {
    const xml = generarFacturae({ ...CASOS.sociedad, factura: factura({ notes: 'Pedido <urgente> & "especial"' }) });
    expect(xml).toContain('Pedido &lt;urgente&gt; &amp; "especial"');
  });
});

describe('problemasFacturae', () => {
  it('sin NIF del cliente no se genera', () => {
    expect(problemasFacturae({ factura: factura({ clientNif: '' }), empresa: EMPRESA })).toContainEqual(expect.stringMatching(/NIF del cliente/));
  });
  it('un borrador tampoco', () => {
    expect(problemasFacturae({ factura: factura({ status: 'borrador' } as Partial<Invoice>), empresa: EMPRESA, cliente: CLIENTE }).length).toBe(1);
  });
});

describe('partirNombre', () => {
  it('APELLIDO1 APELLIDO2 NOMBRE, como en el censo', () => {
    expect(partirNombre('RODRIGUEZ GARCIA ELENA MARIA')).toEqual({ apellido1: 'RODRIGUEZ', apellido2: 'GARCIA', nombre: 'ELENA MARIA' });
  });
});
