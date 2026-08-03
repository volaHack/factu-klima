// ============================================================
// DATOS DE EJEMPLO REALISTAS - DISTRIBUCIÓN ALIMENTARIA
// ============================================================

import {
  Client, Product, Invoice, InvoiceStatus,
  PaymentMethod, ProductCategory, TaxRate, UnitOfMeasure,
} from './types';
import { calculateInvoiceTotals, generateId } from './utils';

// --- CLIENTES ---
export const MOCK_CLIENTS: Client[] = [
  {
    id: 'cli-001', nif: 'B12345678', businessName: 'Restaurante El Buen Sabor S.L.',
    tradeName: 'El Buen Sabor', email: 'pedidos@elbuensabor.es', phone: '+34 912 345 678',
    contactPerson: 'María García López', address: 'Calle Gran Vía 45, 2º',
    city: 'Madrid', postalCode: '28013', province: 'Madrid', country: 'España',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Pedidos habituales los lunes y jueves. Prefiere entrega antes de las 10:00.',
    active: true, createdAt: '2025-01-15T10:00:00Z', updatedAt: '2026-06-20T08:00:00Z',
  },
  {
    id: 'cli-002', nif: 'A87654321', businessName: 'Supermercados Costa Fresca S.A.',
    tradeName: 'Costa Fresca', email: 'compras@costafresca.com', phone: '+34 922 111 222',
    contactPerson: 'Juan Pérez Martín', address: 'Av. de la Constitución 120',
    city: 'Santa Cruz de Tenerife', postalCode: '38001', province: 'Santa Cruz de Tenerife', country: 'España',
    paymentDays: 60, defaultPaymentMethod: PaymentMethod.DOMICILIACION,
    notes: 'Cadena con 5 establecimientos. Facturación centralizada.',
    active: true, createdAt: '2024-06-01T10:00:00Z', updatedAt: '2026-07-10T08:00:00Z',
  },
  {
    id: 'cli-003', nif: 'B55667788', businessName: 'Hotel Marina Palace S.L.',
    tradeName: 'Marina Palace', email: 'cocina@marinapalace.es', phone: '+34 928 333 444',
    contactPerson: 'Ana Rodríguez Sánchez', address: 'Paseo Marítimo 22',
    city: 'Las Palmas de Gran Canaria', postalCode: '35010', province: 'Las Palmas', country: 'España',
    paymentDays: 45, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Hotel 4 estrellas. Gran volumen en temporada alta (junio-septiembre).',
    active: true, createdAt: '2024-09-10T10:00:00Z', updatedAt: '2026-07-15T08:00:00Z',
  },
  {
    id: 'cli-004', nif: 'B99001122', businessName: 'Catering Eventos del Sur S.L.',
    tradeName: 'Catering del Sur', email: 'info@cateringdelsur.es', phone: '+34 954 555 666',
    contactPerson: 'Carlos Fernández Ruiz', address: 'Polígono Industrial Navisa, Nave 7',
    city: 'Sevilla', postalCode: '41016', province: 'Sevilla', country: 'España',
    paymentDays: 15, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Pedidos variables según eventos. Contactar con 48h de antelación.',
    active: true, createdAt: '2025-03-20T10:00:00Z', updatedAt: '2026-05-30T08:00:00Z',
  },
  {
    id: 'cli-005', nif: 'B33445566', businessName: 'Bar Tapería La Esquina S.L.',
    tradeName: 'La Esquina', email: 'laesquina@gmail.com', phone: '+34 956 777 888',
    contactPerson: 'Pedro Jiménez Torres', address: 'Calle Larga 8',
    city: 'Jerez de la Frontera', postalCode: '11403', province: 'Cádiz', country: 'España',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.EFECTIVO,
    notes: 'Pequeño establecimiento. Pedidos semanales reducidos.',
    active: true, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2026-07-01T08:00:00Z',
  },
  {
    id: 'cli-006', nif: 'A11223344', businessName: 'Grupo Hostelero Mediterráneo S.A.',
    tradeName: 'Grupo Mediterráneo', email: 'compras@grupomediterraneo.com', phone: '+34 965 999 000',
    contactPerson: 'Laura Martínez Díaz', address: 'Av. del Puerto 55',
    city: 'Alicante', postalCode: '03001', province: 'Alicante', country: 'España',
    paymentDays: 60, defaultPaymentMethod: PaymentMethod.PAGARE,
    notes: 'Grupo con 12 restaurantes. Facturación mensual consolidada.',
    active: true, createdAt: '2024-01-10T10:00:00Z', updatedAt: '2026-07-20T08:00:00Z',
  },
  {
    id: 'cli-007', nif: 'B77889900', businessName: 'Residencia Tercera Edad Sol y Mar S.L.',
    tradeName: 'Residencia Sol y Mar', email: 'administracion@solymar.es', phone: '+34 952 111 333',
    contactPerson: 'Francisco López García', address: 'Camino de los Olivos 15',
    city: 'Málaga', postalCode: '29010', province: 'Málaga', country: 'España',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.DOMICILIACION,
    notes: 'Suministro diario. Menús adaptados a necesidades especiales.',
    active: true, createdAt: '2025-02-01T10:00:00Z', updatedAt: '2026-06-15T08:00:00Z',
  },
  {
    id: 'cli-008', nif: 'B44556677', businessName: 'Comedor Escolar San José S.L.',
    tradeName: 'Comedor San José', email: 'comedor@colegiosanjose.es', phone: '+34 91 222 444',
    contactPerson: 'Isabel Navarro Ruiz', address: 'Calle de la Escuela 3',
    city: 'Getafe', postalCode: '28901', province: 'Madrid', country: 'España',
    paymentDays: 60, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Solo periodo escolar (septiembre-junio). Certificados alérgenos obligatorios.',
    active: true, createdAt: '2025-09-01T10:00:00Z', updatedAt: '2026-06-30T08:00:00Z',
  },
  {
    id: 'cli-009', nif: 'B66778899', businessName: 'Chiringuito Playa Dorada S.L.',
    tradeName: 'Playa Dorada', email: 'info@playadorda.es', phone: '+34 950 333 555',
    contactPerson: 'Miguel Ángel Ruiz', address: 'Paseo Marítimo s/n',
    city: 'Roquetas de Mar', postalCode: '04740', province: 'Almería', country: 'España',
    paymentDays: 15, defaultPaymentMethod: PaymentMethod.BIZUM,
    notes: 'Solo temporada de verano (mayo-octubre). Alto volumen de bebidas.',
    active: false, createdAt: '2025-05-01T10:00:00Z', updatedAt: '2026-04-15T08:00:00Z',
  },
  {
    id: 'cli-010', nif: 'A22334455', businessName: 'Hipermercado Gran Plaza S.A.',
    tradeName: 'Gran Plaza', email: 'frescos@granplaza.es', phone: '+34 91 555 777',
    contactPerson: 'Roberto Álvarez Muñoz', address: 'Centro Comercial Gran Plaza, Local 1',
    city: 'Majadahonda', postalCode: '28222', province: 'Madrid', country: 'España',
    paymentDays: 90, defaultPaymentMethod: PaymentMethod.PAGARE,
    notes: 'Hipermercado grande. Pedidos semanales de gran volumen.',
    active: true, createdAt: '2024-03-15T10:00:00Z', updatedAt: '2026-07-25T08:00:00Z',
  },
  {
    id: 'cli-011', nif: 'B88990011', businessName: 'Pastelería Artesanal Dulce Hogar S.L.',
    tradeName: 'Dulce Hogar', email: 'compras@dulcehogar.es', phone: '+34 91 888 999',
    contactPerson: 'Carmen Sánchez Vega', address: 'Calle del Horno 12',
    city: 'Alcalá de Henares', postalCode: '28801', province: 'Madrid', country: 'España',
    paymentDays: 15, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Especialidad en lácteos y harinas premium.',
    active: true, createdAt: '2025-11-01T10:00:00Z', updatedAt: '2026-07-10T08:00:00Z',
  },
  {
    id: 'cli-012', nif: 'B55443322', businessName: 'Asador Casa Paco S.L.',
    tradeName: 'Casa Paco', email: 'casapaco@hotmail.com', phone: '+34 923 444 666',
    contactPerson: 'Paco Delgado Herrero', address: 'Plaza Mayor 5',
    city: 'Salamanca', postalCode: '37001', province: 'Salamanca', country: 'España',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.EFECTIVO,
    notes: 'Especialidad en carnes. Pedidos de cárnicos de alta calidad.',
    active: true, createdAt: '2025-04-15T10:00:00Z', updatedAt: '2026-06-20T08:00:00Z',
  },
];

// --- PRODUCTOS ---
export const MOCK_PRODUCTS: Product[] = [
  // Frutas
  { id: 'prod-001', ref: 'FRU-001', name: 'Manzana Golden', description: 'Manzana Golden Delicious, calibre 70-80mm', category: ProductCategory.FRUTAS, unitPrice: 1.85, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-002', ref: 'FRU-002', name: 'Plátano de Canarias', description: 'Plátano IGP Canarias, categoría Extra', category: ProductCategory.FRUTAS, unitPrice: 2.15, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-003', ref: 'FRU-003', name: 'Naranja de Valencia', description: 'Naranja Navelina, zumo y mesa', category: ProductCategory.FRUTAS, unitPrice: 1.45, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-004', ref: 'FRU-004', name: 'Fresa de Huelva', description: 'Fresa categoría I, bandeja 500g', category: ProductCategory.FRUTAS, unitPrice: 3.90, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Verduras
  { id: 'prod-005', ref: 'VER-001', name: 'Tomate Pera', description: 'Tomate pera para ensalada, origen Almería', category: ProductCategory.VERDURAS, unitPrice: 2.30, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-006', ref: 'VER-002', name: 'Lechuga Iceberg', description: 'Lechuga Iceberg, pieza grande', category: ProductCategory.VERDURAS, unitPrice: 0.95, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-007', ref: 'VER-003', name: 'Patata Gallega', description: 'Patata nueva, malla 10kg', category: ProductCategory.VERDURAS, unitPrice: 1.20, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-008', ref: 'VER-004', name: 'Cebolla Dulce', description: 'Cebolla dulce de Fuentes de Ebro', category: ProductCategory.VERDURAS, unitPrice: 1.10, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Lácteos
  { id: 'prod-009', ref: 'LAC-001', name: 'Leche Entera', description: 'Leche entera UHT, brick 1L', category: ProductCategory.LACTEOS, unitPrice: 0.89, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.LITRO, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-010', ref: 'LAC-002', name: 'Queso Manchego Curado', description: 'Queso Manchego D.O., curación 6 meses, pieza 3kg', category: ProductCategory.LACTEOS, unitPrice: 14.50, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-011', ref: 'LAC-003', name: 'Yogur Natural', description: 'Yogur natural, pack 12 unidades', category: ProductCategory.LACTEOS, unitPrice: 3.20, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.PACK, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-012', ref: 'LAC-004', name: 'Mantequilla', description: 'Mantequilla sin sal, pastilla 250g', category: ProductCategory.LACTEOS, unitPrice: 2.85, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Cárnicos
  { id: 'prod-013', ref: 'CAR-001', name: 'Pechuga de Pollo', description: 'Pechuga de pollo fresco, bandeja 1kg', category: ProductCategory.CARNICOS, unitPrice: 6.90, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-014', ref: 'CAR-002', name: 'Lomo de Cerdo', description: 'Lomo de cerdo fresco, pieza entera', category: ProductCategory.CARNICOS, unitPrice: 5.75, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-015', ref: 'CAR-003', name: 'Ternera Solomillo', description: 'Solomillo de ternera gallega, pieza', category: ProductCategory.CARNICOS, unitPrice: 24.90, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-016', ref: 'CAR-004', name: 'Jamón Serrano', description: 'Jamón serrano reserva, pieza 7-8kg', category: ProductCategory.CARNICOS, unitPrice: 8.50, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Pescados
  { id: 'prod-017', ref: 'PES-001', name: 'Merluza Fresca', description: 'Merluza del Cantábrico, pieza 2-3kg', category: ProductCategory.PESCADOS, unitPrice: 12.50, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-018', ref: 'PES-002', name: 'Salmón Noruego', description: 'Salmón noruego fresco, lomo', category: ProductCategory.PESCADOS, unitPrice: 11.90, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-019', ref: 'PES-003', name: 'Gambas Rojas', description: 'Gamba roja de Huelva, tamaño mediano', category: ProductCategory.PESCADOS, unitPrice: 28.00, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Congelados
  { id: 'prod-020', ref: 'CON-001', name: 'Croquetas Caseras', description: 'Croquetas de jamón, bolsa 1kg', category: ProductCategory.CONGELADOS, unitPrice: 7.50, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-021', ref: 'CON-002', name: 'Verduras Salteadas', description: 'Mix verduras salteadas, bolsa 1kg', category: ProductCategory.CONGELADOS, unitPrice: 3.80, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Bebidas
  { id: 'prod-022', ref: 'BEB-001', name: 'Agua Mineral 1.5L', description: 'Agua mineral natural, botella 1.5L, pack 6', category: ProductCategory.BEBIDAS, unitPrice: 2.40, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.PACK, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-023', ref: 'BEB-002', name: 'Coca-Cola 330ml', description: 'Coca-Cola lata 330ml, pack 24', category: ProductCategory.BEBIDAS, unitPrice: 8.50, defaultTaxRate: TaxRate.GENERAL, unit: UnitOfMeasure.PACK, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-024', ref: 'BEB-003', name: 'Cerveza San Miguel', description: 'Cerveza San Miguel Especial, barril 30L', category: ProductCategory.BEBIDAS, unitPrice: 52.00, defaultTaxRate: TaxRate.GENERAL, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-025', ref: 'BEB-004', name: 'Vino Rioja Crianza', description: 'Vino tinto Rioja D.O.Ca., crianza, caja 6 botellas', category: ProductCategory.BEBIDAS, unitPrice: 36.00, defaultTaxRate: TaxRate.GENERAL, unit: UnitOfMeasure.CAJA, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Conservas
  { id: 'prod-026', ref: 'CON-003', name: 'Tomate Triturado', description: 'Tomate natural triturado, lata 2.5kg', category: ProductCategory.CONSERVAS, unitPrice: 2.90, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-027', ref: 'CON-004', name: 'Atún en Aceite', description: 'Atún claro en aceite de oliva, lata RO-1000', category: ProductCategory.CONSERVAS, unitPrice: 6.80, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-028', ref: 'CON-005', name: 'Aceite Oliva Virgen Extra', description: 'AOVE, garrafa 5L, acidez 0.4º', category: ProductCategory.CONSERVAS, unitPrice: 32.00, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Panadería
  { id: 'prod-029', ref: 'PAN-001', name: 'Pan Barra Rústica', description: 'Pan barra rústica, 250g', category: ProductCategory.PANADERIA, unitPrice: 0.75, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-030', ref: 'PAN-002', name: 'Pan de Molde Integral', description: 'Pan de molde integral, bolsa 500g', category: ProductCategory.PANADERIA, unitPrice: 1.80, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  // Otros
  { id: 'prod-031', ref: 'OTR-001', name: 'Harina de Trigo', description: 'Harina de trigo panificable, saco 25kg', category: ProductCategory.OTROS, unitPrice: 15.00, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-032', ref: 'OTR-002', name: 'Azúcar Blanco', description: 'Azúcar blanco, saco 25kg', category: ProductCategory.OTROS, unitPrice: 18.50, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-033', ref: 'OTR-003', name: 'Huevos Camperos', description: 'Huevos camperos L, cartón 30 unidades', category: ProductCategory.OTROS, unitPrice: 6.50, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-034', ref: 'OTR-004', name: 'Sal Gruesa', description: 'Sal gruesa marina, saco 25kg', category: ProductCategory.OTROS, unitPrice: 4.50, defaultTaxRate: TaxRate.SUPERREDUCIDO, unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// --- Helper to create invoice line items ---
function createLine(
  productIndex: number,
  quantity: number,
  discountPercent: number = 0,
  priceOverride?: number
): {
  id: string; productId: string; productName: string; productRef: string;
  quantity: number; unitPrice: number; unit: UnitOfMeasure; taxRate: TaxRate;
  discountPercent: number; subtotal: number; taxAmount: number; total: number;
} {
  const p = MOCK_PRODUCTS[productIndex];
  const unitPrice = priceOverride ?? p.unitPrice;
  const gross = quantity * unitPrice;
  const discount = gross * (discountPercent / 100);
  const subtotal = Number((gross - discount).toFixed(2));
  const taxAmount = Number((subtotal * (p.defaultTaxRate / 100)).toFixed(2));
  return {
    id: generateId(),
    productId: p.id,
    productName: p.name,
    productRef: p.ref,
    quantity,
    unitPrice,
    unit: p.unit,
    taxRate: p.defaultTaxRate,
    discountPercent,
    subtotal,
    taxAmount,
    total: Number((subtotal + taxAmount).toFixed(2)),
  };
}

function buildInvoice(
  id: string, number: string, clientIndex: number, status: InvoiceStatus,
  issueDate: string, dueDate: string, lines: ReturnType<typeof createLine>[],
  paymentMethod: PaymentMethod, notes: string = '', paidDate?: string
): Invoice {
  const client = MOCK_CLIENTS[clientIndex];
  const totals = calculateInvoiceTotals(lines);
  return {
    id, number, series: 'FAC',
    clientId: client.id, clientName: client.tradeName, clientNif: client.nif,
    clientAddress: `${client.address}, ${client.postalCode} ${client.city}`,
    issueDate, dueDate, paidDate,
    status, lineItems: lines,
    ...totals,
    paymentMethod,
    notes,
    createdAt: issueDate,
    updatedAt: issueDate,
  };
}

// --- FACTURAS ---
export const MOCK_INVOICES: Invoice[] = [
  buildInvoice('inv-001', 'FAC-2026-0001', 0, InvoiceStatus.PAGADA,
    '2026-01-15', '2026-02-14',
    [createLine(0, 50), createLine(4, 30), createLine(12, 20), createLine(8, 24)],
    PaymentMethod.TRANSFERENCIA, 'Entrega en horario de mañana', '2026-02-10'
  ),
  buildInvoice('inv-002', 'FAC-2026-0002', 1, InvoiceStatus.PAGADA,
    '2026-02-01', '2026-04-01',
    [createLine(0, 200), createLine(1, 150), createLine(2, 180), createLine(4, 100), createLine(5, 300), createLine(6, 500), createLine(8, 200), createLine(22, 50), createLine(23, 30)],
    PaymentMethod.DOMICILIACION, 'Entrega en almacén central', '2026-03-25'
  ),
  buildInvoice('inv-003', 'FAC-2026-0003', 2, InvoiceStatus.PAGADA,
    '2026-02-15', '2026-04-01',
    [createLine(16, 15), createLine(17, 20), createLine(18, 8), createLine(12, 25), createLine(14, 10), createLine(24, 5), createLine(21, 40)],
    PaymentMethod.TRANSFERENCIA, 'Temporada alta - entrega diaria', '2026-03-28'
  ),
  buildInvoice('inv-004', 'FAC-2026-0004', 3, InvoiceStatus.PAGADA,
    '2026-03-01', '2026-03-16',
    [createLine(12, 40), createLine(4, 25), createLine(5, 50), createLine(19, 10), createLine(27, 5)],
    PaymentMethod.TRANSFERENCIA, 'Evento boda 150 personas', '2026-03-14'
  ),
  buildInvoice('inv-005', 'FAC-2026-0005', 4, InvoiceStatus.PAGADA,
    '2026-03-10', '2026-04-09',
    [createLine(15, 3), createLine(4, 10), createLine(5, 15), createLine(21, 10), createLine(28, 20)],
    PaymentMethod.EFECTIVO, '', '2026-04-08'
  ),
  buildInvoice('inv-006', 'FAC-2026-0006', 5, InvoiceStatus.PAGADA,
    '2026-03-20', '2026-05-19',
    [createLine(0, 300), createLine(1, 200), createLine(4, 250), createLine(6, 400), createLine(8, 500), createLine(12, 200), createLine(13, 150), createLine(16, 80), createLine(21, 100), createLine(22, 80), createLine(24, 20)],
    PaymentMethod.PAGARE, 'Facturación mensual consolidada - Marzo', '2026-05-15'
  ),
  buildInvoice('inv-007', 'FAC-2026-0007', 6, InvoiceStatus.PAGADA,
    '2026-04-01', '2026-05-01',
    [createLine(0, 80), createLine(1, 60), createLine(4, 50), createLine(6, 100), createLine(8, 100), createLine(10, 50), createLine(12, 40), createLine(28, 40), createLine(29, 20)],
    PaymentMethod.DOMICILIACION, 'Menú especial mes de abril', '2026-04-28'
  ),
  buildInvoice('inv-008', 'FAC-2026-0008', 7, InvoiceStatus.PAGADA,
    '2026-04-15', '2026-06-14',
    [createLine(0, 100), createLine(1, 80), createLine(4, 60), createLine(5, 120), createLine(6, 200), createLine(8, 150), createLine(10, 80), createLine(28, 60)],
    PaymentMethod.TRANSFERENCIA, 'Suministro comedor escolar - Abril', '2026-06-10'
  ),
  buildInvoice('inv-009', 'FAC-2026-0009', 0, InvoiceStatus.PAGADA,
    '2026-05-01', '2026-05-31',
    [createLine(2, 40), createLine(3, 20), createLine(4, 35), createLine(13, 15), createLine(17, 10), createLine(21, 15)],
    PaymentMethod.TRANSFERENCIA, '', '2026-05-28'
  ),
  buildInvoice('inv-010', 'FAC-2026-0010', 9, InvoiceStatus.PAGADA,
    '2026-05-10', '2026-08-08',
    [createLine(0, 500), createLine(1, 300), createLine(2, 400), createLine(3, 200), createLine(4, 300), createLine(5, 400), createLine(6, 600), createLine(8, 800), createLine(12, 300), createLine(13, 200), createLine(16, 100), createLine(21, 200), createLine(22, 150)],
    PaymentMethod.PAGARE, 'Suministro mensual mayo - Gran Plaza', '2026-07-20'
  ),
  // Pending invoices
  buildInvoice('inv-011', 'FAC-2026-0011', 1, InvoiceStatus.PENDIENTE,
    '2026-06-01', '2026-08-01',
    [createLine(0, 180), createLine(1, 120), createLine(4, 90), createLine(6, 350), createLine(8, 180), createLine(22, 45), createLine(23, 20)],
    PaymentMethod.DOMICILIACION, 'Suministro mensual junio'
  ),
  buildInvoice('inv-012', 'FAC-2026-0012', 5, InvoiceStatus.PENDIENTE,
    '2026-06-15', '2026-08-14',
    [createLine(0, 280), createLine(4, 200), createLine(8, 400), createLine(12, 180), createLine(13, 120), createLine(16, 60), createLine(22, 60), createLine(24, 15)],
    PaymentMethod.PAGARE, 'Facturación mensual consolidada - Junio'
  ),
  buildInvoice('inv-013', 'FAC-2026-0013', 2, InvoiceStatus.PENDIENTE,
    '2026-07-01', '2026-08-15',
    [createLine(16, 20), createLine(17, 25), createLine(18, 12), createLine(12, 30), createLine(14, 15), createLine(3, 40), createLine(21, 60), createLine(24, 8)],
    PaymentMethod.TRANSFERENCIA, 'Temporada alta julio - Hotel Marina Palace'
  ),
  buildInvoice('inv-014', 'FAC-2026-0014', 10, InvoiceStatus.PENDIENTE,
    '2026-07-10', '2026-07-25',
    [createLine(8, 50), createLine(9, 15), createLine(10, 30), createLine(11, 20), createLine(30, 3)],
    PaymentMethod.TRANSFERENCIA, 'Pedido especial lácteos premium'
  ),
  // Overdue invoices
  buildInvoice('inv-015', 'FAC-2026-0015', 3, InvoiceStatus.VENCIDA,
    '2026-06-01', '2026-06-16',
    [createLine(12, 50), createLine(13, 30), createLine(4, 40), createLine(5, 60), createLine(21, 20)],
    PaymentMethod.TRANSFERENCIA, 'Evento corporativo 200 personas'
  ),
  buildInvoice('inv-016', 'FAC-2026-0016', 4, InvoiceStatus.VENCIDA,
    '2026-06-20', '2026-07-20',
    [createLine(15, 4), createLine(4, 12), createLine(21, 15), createLine(28, 25)],
    PaymentMethod.EFECTIVO, ''
  ),
  // Drafts
  buildInvoice('inv-017', 'FAC-2026-0017', 11, InvoiceStatus.BORRADOR,
    '2026-07-25', '2026-08-24',
    [createLine(12, 30), createLine(14, 20), createLine(15, 10)],
    PaymentMethod.EFECTIVO, 'Pedido especial carnes para asador'
  ),
  buildInvoice('inv-018', 'FAC-2026-0018', 6, InvoiceStatus.BORRADOR,
    '2026-07-28', '2026-08-27',
    [createLine(0, 70), createLine(4, 40), createLine(8, 90), createLine(10, 40), createLine(28, 30)],
    PaymentMethod.DOMICILIACION, 'Suministro agosto - Residencia Sol y Mar'
  ),
  // Issued
  buildInvoice('inv-019', 'FAC-2026-0019', 0, InvoiceStatus.EMITIDA,
    '2026-07-28', '2026-08-27',
    [createLine(2, 45), createLine(3, 25), createLine(12, 18), createLine(16, 8), createLine(21, 20)],
    PaymentMethod.TRANSFERENCIA, 'Pedido semanal - semana 30'
  ),
  // Cancelled
  buildInvoice('inv-020', 'FAC-2026-0020', 8, InvoiceStatus.ANULADA,
    '2026-05-15', '2026-05-30',
    [createLine(21, 100), createLine(22, 60), createLine(23, 40)],
    PaymentMethod.BIZUM, 'ANULADA: Chiringuito cerrado por obras'
  ),
];

// Export initialization function
export function initializeMockData() {
  const { saveClients, saveProducts, saveInvoices, saveCompanySettings, isInitialized, markInitialized } = require('./storage');
  
  if (isInitialized()) return;
  
  saveClients(MOCK_CLIENTS);
  saveProducts(MOCK_PRODUCTS);
  saveInvoices(MOCK_INVOICES);
  saveCompanySettings({
    businessName: 'Distribuciones Alimentarias del Sur S.L.',
    nif: 'B41567890',
    tradeName: 'DistAlSur',
    email: 'facturacion@distalsur.es',
    phone: '+34 954 123 456',
    website: 'www.distalsur.es',
    address: 'Polígono Industrial Calonge, Nave 24',
    city: 'Sevilla',
    postalCode: '41007',
    province: 'Sevilla',
    invoiceSeries: 'FAC',
    nextInvoiceNumber: 21,
    defaultPaymentDays: 30,
    defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
    invoiceFooterText: 'Gracias por confiar en Distribuciones Alimentarias del Sur. Factura sujeta a Verifactu.',
    iban: 'ES91 2100 0418 4502 0005 1332',
    bankName: 'CaixaBank',
    logoUrl: '',
  });
  markInitialized();
}
