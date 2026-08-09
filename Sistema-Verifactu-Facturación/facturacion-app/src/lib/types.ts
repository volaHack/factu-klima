// ============================================================
// TIPOS DEL SISTEMA DE FACTURACIÓN (MULTI-SECTOR)
// ============================================================

// --- Enums ---

export enum InvoiceStatus {
  BORRADOR = 'borrador',
  PRE_APROBACION = 'pre_aprobacion',
  APROBADO = 'aprobado',
  APROBADO_PARCIAL = 'aprobado_parcial',
  RECHAZADO = 'rechazado',
  EMITIDA = 'emitida',
  PENDIENTE = 'pendiente',
  PAGADA = 'pagada',
  VENCIDA = 'vencida',
  ANULADA = 'anulada',
}

export enum PaymentMethod {
  TRANSFERENCIA = 'transferencia',
  EFECTIVO = 'efectivo',
  DOMICILIACION = 'domiciliacion',
  PAGARE = 'pagare',
  TARJETA = 'tarjeta',
  BIZUM = 'bizum',
}

export enum ProductCategory {
  FRUTAS = 'frutas',
  VERDURAS = 'verduras',
  LACTEOS = 'lacteos',
  CARNICOS = 'carnicos',
  PESCADOS = 'pescados',
  CONGELADOS = 'congelados',
  BEBIDAS = 'bebidas',
  CONSERVAS = 'conservas',
  PANADERIA = 'panaderia',
  OTROS = 'otros',
}

export enum TaxRate {
  // --- IVA (Régimen General — Península e Islas Baleares) ---
  GENERAL = 21,
  REDUCIDO = 10,
  SUPERREDUCIDO = 4,
  EXENTO = 0,

  // --- IGIC (Impuesto General Indirecto Canario — Canarias) ---
  IGIC_GENERAL = 7,
  IGIC_REDUCIDO = 3,
  IGIC_INCREMENTADO = 13,
  // IGIC exento también usa 0, compartido con EXENTO
}

export enum UnitOfMeasure {
  KG = 'kg',
  UNIDAD = 'ud',
  CAJA = 'caja',
  PALET = 'palet',
  LITRO = 'litro',
  DOCENA = 'docena',
  PACK = 'pack',
}

export type BusinessSector = 'alimentacion' | 'supermercado' | 'mayorista' | 'bebidas' | 'servicios_industriales';

// Modo de uso del TPV: afecta al grid de productos (denso IA), la venta por
// peso (PLU) y las mesas con cuentas abiertas.
export type TpvMode = 'tienda' | 'supermercado' | 'restaurante';
export type AccentTheme = 'rose' | 'wine' | 'terracotta' | 'plum';

// --- Interfaces ---

export interface InvoiceLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: TaxRate;
  discountPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface TaxBreakdown {
  rate: TaxRate;
  base: number;
  amount: number;
}

export interface VerifactuMetadata {
  chainedHash: string;
  qrCodeUrl: string;
  timestamp: string;
  signatureStatus: 'VALID' | 'PENDING' | 'LOCAL_MODE';
}

export interface Invoice {
  id: string;
  number: string;
  series: string;
  
  // Client
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  
  // Dates
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  
  // Status
  status: InvoiceStatus;
  
  // Line items
  lineItems: InvoiceLineItem[];
  
  // Totals
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  
  // Payment
  paymentMethod: PaymentMethod;
  
  // Notes
  notes: string;
  
  // Verifactu Ready Metadata
  verifactu?: VerifactuMetadata;
  
  // Stripe Online Payments
  stripePaymentUrl?: string;
  stripeSessionId?: string;
  paidAt?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;

  // TPV
  posSessionId?: string;
  // true = ticket emitido offline con número temporal (SERIE-AÑO-0000-SUFIJO).
  // El servidor lo renumerá a la siguiente secuencia libre si hay colisión al
  // sincronizar; la fecha real de venta se conserva.
  numberTemporary?: boolean;
}

// --- TPV (punto de venta) ---

export interface PosSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  startingCash: number;
  countedCash?: number;
  expectedCash?: number;
  cashDifference?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface PosCartLine {
  productId: string;
  productName: string;
  productRef: string;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: TaxRate;
  quantity: number;
  discountPercent: number;
  stockQuantity: number;
}

export interface PosHeldSale {
  id: string;
  label: string;
  heldAt: string;
  lines: PosCartLine[];
}

export interface Client {
  id: string;
  nif: string;
  businessName: string;
  tradeName: string;
  email: string;
  phone: string;
  contactPerson: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  paymentDays: number;
  defaultPaymentMethod: PaymentMethod;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isWalkIn?: boolean;
}

export interface Product {
  id: string;
  ref: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  defaultTaxRate: TaxRate;
  unit: UnitOfMeasure;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  barcode?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  // Contador de unidades vendidas (base del inventario IA / más vendidos)
  unitsSold?: number;
}

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  sector?: BusinessSector;
  // true = la categoría por defecto con este id ha sido eliminada por el usuario
  hidden?: boolean;
}

export interface CompanySettings {
  // Identity
  businessName: string;
  nif: string;
  tradeName: string;
  sector: BusinessSector;
  accentTheme: AccentTheme;
  
  // Contact
  email: string;
  phone: string;
  website: string;
  
  // Address
  address: string;
  city: string;
  postalCode: string;
  province: string;
  
  // Invoice settings
  invoiceSeries: string;
  nextInvoiceNumber: number;
  defaultPaymentDays: number;
  defaultPaymentMethod: PaymentMethod;
  invoiceFooterText: string;

  // TPV — serie separada para tickets de mostrador (factura simplificada)
  tpvEnabled?: boolean;
  tpvSeries: string;
  nextTpvNumber: number;
  // Cómo se usa el TPV: tienda (estándar), supermercado (grid denso + PLU) o restaurante (mesas).
  tpvMode?: TpvMode;
  
  // Banking
  iban: string;
  bankName: string;
  
  // Verifactu Switch
  verifactuEnabled: boolean;
  
  // Logo
  logoUrl: string;
  
  // Custom categories per sector/company
  customCategories?: CustomCategory[];

  // Stripe Online Payments Integration
  // Sólo la clave PÚBLICA vive aquí. La secret key y el webhook secret
  // van en variables de entorno del servidor (STRIPE_SECRET_KEY,
  // STRIPE_WEBHOOK_SECRET): esta tabla la puede leer el navegador.
  stripeEnabled?: boolean;
  stripePublishableKey?: string;

  // Régimen fiscal: IVA (Península + Baleares) o IGIC (Canarias)
  // Cuando igicEnabled = true, el sistema muestra tasas IGIC en
  // todos los formularios, facturas, TPV e informes.
  igicEnabled?: boolean;
}

// --- Utility Types ---

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterState {
  search: string;
  status?: InvoiceStatus[];
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  category?: ProductCategory;
  minAmount?: number;
  maxAmount?: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

// --- Order Pre-Approval System ---

export type ApprovalStatus = 'pending' | 'approved' | 'partial' | 'rejected';

export interface OrderApproval {
  id: string;
  invoiceId: string;
  token: string;
  status: ApprovalStatus;
  clientMessage: string;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface OrderApprovalItem {
  id: string;
  approvalId: string;
  lineItemId: string;
  accepted: boolean;
  adjustedQuantity: number | null;
  rejectionReason: string;
}

// --- User Profile / Onboarding ---

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string;
  onboardingCompleted: boolean;
  createdAt: string;
}
