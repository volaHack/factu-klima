/**
 * Facturas de ejemplo para las pruebas de la factura electrónica: un caso por
 * cada camino del generador (tipos, descuentos, IGIC, exentas, intracomunitaria,
 * inversión del sujeto pasivo, retención, rectificativas en positivo y negativo).
 * Los mismos casos se validan en desarrollo con las reglas oficiales del CEN.
 */
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type Invoice, type InvoiceLineItem } from '@/lib/types';
import { calculateInvoiceTotals, calculateLineSubtotal, calculateLineTax } from '@/lib/utils';
import type { DatosUbl } from './ubl';

function linea(nombre: string, cantidad: number, precio: number, tipo: number, d1 = 0, d2 = 0, unidad = UnitOfMeasure.UNIDAD): InvoiceLineItem {
  const subtotal = calculateLineSubtotal(cantidad, precio, d1, d2);
  const taxAmount = calculateLineTax(subtotal, tipo);
  return {
    id: nombre, productId: '', productName: nombre, productRef: nombre.slice(0, 3).toUpperCase(), quantity: cantidad, unitPrice: precio,
    unit: unidad, taxRate: tipo, discountPercent: d1, discountPercent2: d2, subtotal, taxAmount, total: subtotal + taxAmount,
  };
}

function factura(numero: string, lineas: InvoiceLineItem[], extra: Partial<Invoice> = {}, pie: [number, number, number] = [0, 0, 0]): Invoice {
  const t = calculateInvoiceTotals(lineas, pie);
  return {
    id: numero, number: numero, series: 'F', clientId: 'c1', clientName: 'Reformas Díaz SL', clientNif: 'B87654321',
    clientAddress: 'C/ Mayor 1, 35001 Las Palmas', issueDate: '2026-10-05', dueDate: '2026-11-04', status: InvoiceStatus.EMITIDA,
    lineItems: lineas, subtotal: t.subtotal, totalDiscount: t.totalDiscount, taxBreakdown: t.taxBreakdown, totalTax: t.totalTax,
    total: t.total, paymentMethod: PaymentMethod.TRANSFERENCIA, notes: '', createdAt: '', updatedAt: '', tipo: 'factura',
    globalDiscountPercent1: pie[0], globalDiscountPercent2: pie[1], globalDiscountPercent3: pie[2],
    ...extra,
  };
}

const empresa: DatosUbl['empresa'] = {
  businessName: 'Ferretería Martín SL', tradeName: 'Ferretería Martín', nif: 'B12345674', address: 'C/ Triana 20', city: 'Las Palmas de Gran Canaria',
  postalCode: '35002', province: 'Las Palmas', iban: 'ES9121000418450200051332', igicEnabled: false, email: 'hola@ferreteria.es', phone: '928000000',
};
const cliente: DatosUbl['cliente'] = {
  businessName: 'Reformas Díaz SL', nif: 'B87654321', address: 'C/ Mayor 1', city: 'Madrid', postalCode: '28001', province: 'Madrid', country: 'España',
};

export const CASOS: Record<string, DatosUbl> = {
  sencilla: { factura: factura('F-2026-0001', [linea('Taladro percutor', 1, 59, 21), linea('Juego de brocas', 2, 7.5, 21), linea('Tacos y tornillos', 1, 6, 21)]), empresa, cliente },
  variosTipos: {
    factura: factura('F-2026-0002', [linea('Libro técnico', 3, 12.99, 4), linea('Comida', 7, 3.333, 10, 5), linea('Herramienta', 2, 19.95, 21, 10, 5)]),
    empresa, cliente,
  },
  descuentoPie: {
    factura: factura('F-2026-0003', [linea('Pintura 15 l', 4, 38.37, 21, 3), linea('Rodillo', 6, 4.15, 21), linea('Revista', 1, 3.5, 4)], {}, [5, 2, 0]),
    empresa, cliente,
  },
  kilosYCajas: {
    factura: factura('F-2026-0004', [linea('Naranjas', 12.5, 1.19, 4, 0, 0, UnitOfMeasure.KG), linea('Agua', 3, 4.8, 10, 0, 0, UnitOfMeasure.CAJA)], { paymentMethod: PaymentMethod.TARJETA }),
    empresa, cliente,
  },
  igic: {
    factura: factura('F-2026-0005', [linea('Instalación', 1, 300, 7), linea('Material', 5, 12.4, 7), linea('Pan', 4, 1.2, 0)]),
    empresa: { ...empresa, igicEnabled: true }, cliente,
  },
  exenta: { factura: factura('F-2026-0006', [linea('Curso de formación', 1, 450, 0), linea('Material del curso', 1, 40, 21)]), empresa, cliente },
  intracomunitaria: {
    factura: factura('F-2026-0007', [linea('Bombas de calor', 2, 1250, 0)], { esIntracomunitaria: true, claveRegimenIva: '11', clientVatNumber: 'FR40303265045', clientNif: 'FR40303265045', clientName: 'Chauffage SARL' }),
    empresa, cliente: { businessName: 'Chauffage SARL', nif: 'FR40303265045', vatNumber: 'FR40303265045', address: '3 rue de Paris', city: 'Lyon', postalCode: '69001', province: '', country: 'Francia' },
  },
  inversionSujetoPasivo: {
    factura: factura('F-2026-0008', [linea('Ejecución de obra', 1, 8200, 0)], { claveRegimenIva: '12' }),
    empresa, cliente,
  },
  retencion: {
    factura: factura('F-2026-0009', [linea('Honorarios proyecto', 1, 1500, 21)], { retencionPct: 15, paymentMethod: PaymentMethod.DOMICILIACION }),
    empresa, cliente,
  },
  rectificativaNegativa: {
    factura: factura('R-2026-0001', [linea('Devolución taladro', -1, 59, 21), linea('Brocas', -2, 7.5, 21)], { tipo: 'rectificativa', documentoOrigenNumber: 'F-2026-0001', tipoFacturaFiscal: 'R1' }),
    empresa, cliente, fechaRectificada: '2026-10-05',
  },
  rectificativaPositiva: {
    factura: factura('R-2026-0002', [linea('Diferencia de precio', 1, 25, 21)], { tipo: 'rectificativa', documentoOrigenNumber: 'F-2026-0002', tipoFacturaFiscal: 'R1' }),
    empresa, cliente,
  },
  sinIbanEfectivo: {
    factura: factura('F-2026-0010', [linea('Llaves', 3, 2.5, 21), linea('Descuento promoción', 1, -2, 21)], { paymentMethod: PaymentMethod.EFECTIVO }),
    empresa: { ...empresa, iban: '' }, cliente,
  },
  caracteresRaros: {
    factura: factura('F-2026-0011', [linea('Tornillo <M8> & tuerca "inox"', 100, 0.0375, 21)], { notes: 'Entrega en obra: «planta 2ª» & portería' }),
    empresa, cliente: { ...cliente, businessName: 'Hermanos O\'Neill & Cía SL' },
  },
};
