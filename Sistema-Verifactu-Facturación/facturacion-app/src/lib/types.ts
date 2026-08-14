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
  EXPEDIDO = 'expedido',
  FACTURADO = 'facturado',
}

export type TipoDocumento = 'presupuesto' | 'pedido' | 'albaran' | 'factura' | 'rectificativa';
export type SentidoDocumento = 'venta' | 'compra';

export interface SerieDocumento {
  serie: string;
  nextNumber: number;
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
  taxRate: number;
  discountPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  /**
   * Valores de las columnas personalizadas de la plantilla (`custom_col_N`).
   * Se piden por línea al crear la factura y se imprimen tal cual.
   */
  customCols?: Record<string, string>;
}

export interface TaxBreakdown {
  rate: number;
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

  /** Valores libres para los campos manuales de la plantilla activa (custom_N). */
  datosExtras?: Record<string, string>;

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

  /** Tipo de documento. Por defecto 'factura' (compatibilidad con los existentes). */
  tipo?: TipoDocumento;
  /** Venta o compra. Por defecto 'venta'. */
  sentido?: SentidoDocumento;
  /** Documento que da origen a este (presupuesto→pedido→albarán→factura). */
  documentoOrigenId?: string;
  documentoOrigenNumber?: string;
  /** Vendedor asignado (decide la serie, Fase 1 Etapa 4). */
  vendedorId?: string;
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
  taxRate: number;
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
  defaultTaxRate: number;
  unit: UnitOfMeasure;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  barcode?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  // Contador de unidades vendidas (base del inventario IA / más vendidos)
  unitsSold?: number;
  // Miniatura del producto (data URL comprimida; ligera para offline y sync)
  imageUrl?: string;
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

  // Porcentajes disponibles para elegir en facturas, TPV e informes.
  // La empresa los configura en Ajustes sin necesidad de informático.
  // Si están vacíos se usan los del régimen activo (IVA 21/10/4/0 o IGIC 7/3/13/0).
  ivaRates?: number[];
  igicRates?: number[];

  // Suscripción y límites de plan
  planId?: 'basico' | 'pro' | 'sin_limite';
  subscriptionStatus?: 'active' | 'inactive' | 'past_due' | 'canceled';

  // Albaranes (documento de entrega/preparación)
  albaranSeries?: string;
  nextAlbaranNumber?: number;

  // Devoluciones (mercancía devuelta: roturas, defectos…)
  devolucionSeries?: string;
  nextDevolucionNumber?: number;

  // Abonos (nota de crédito a favor del cliente)
  abonoSeries?: string;
  nextAbonoNumber?: number;

  /** Series y contadores por (tipo, sentido). Clave: `${tipo}_${sentido}`. */
  seriesDocumentos?: Record<string, SerieDocumento>;
}

// --- Albaranes (documento de entrega) ---

export type AlbaranStatus = 'borrador' | 'expedido' | 'facturado' | 'anulado';

export interface AlbaranLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  discountPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Valores de las columnas personalizadas de la plantilla (`custom_col_N`). */
  customCols?: Record<string, string>;
}

export interface Albaran {
  id: string;
  number: string;
  series: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  issueDate: string;
  status: AlbaranStatus;
  lineItems: AlbaranLineItem[];
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  notes: string;
  /** Valores libres para los campos manuales de la plantilla activa (custom_N). */
  datosExtras?: Record<string, string>;
  // Factura resultante de la conversión (individual o agrupada)
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Devoluciones ---

export type DevolucionReason = 'rotura' | 'defecto' | 'error' | 'vencido' | 'otro';
export type DevolucionOrigin = 'albaran' | 'factura' | 'manual';

export interface DevolucionLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  total: number;
  // true = la mercancía vuelve a la nave (se suma al stock)
  restock: boolean;
}

export interface Devolucion {
  id: string;
  number: string;
  series: string;
  origin: DevolucionOrigin;
  originId?: string;
  originNumber?: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  issueDate: string;
  reason: DevolucionReason;
  reasonNote: string;
  status: 'registrada' | 'abonada';
  lineItems: DevolucionLineItem[];
  total: number;
  notes: string;
  abonoId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Abonos (nota de crédito) ---

export type AbonoStatus = 'emitido' | 'parcial' | 'usado' | 'anulado';

export interface Abono {
  id: string;
  number: string;
  series: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  issueDate: string;
  total: number;
  usedAmount: number;
  status: AbonoStatus;
  devolucionId?: string;
  reason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbonoAplicacion {
  id: string;
  abonoId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  appliedAt: string;
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
