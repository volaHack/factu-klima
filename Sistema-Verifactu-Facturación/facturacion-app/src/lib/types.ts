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
  PARCIAL = 'parcial',
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

export interface Tarifa {
  id: string;
  nombre: string;
  activa: boolean;
  porcentajeDefecto?: number;
}

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string;
  principal: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TraspasoLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unit?: UnitOfMeasure;
}

export interface TraspasoAlmacen {
  id: string;
  number: string;
  origenAlmacenId: string;
  origenAlmacenNombre: string;
  destinoAlmacenId: string;
  destinoAlmacenNombre: string;
  fecha: string;
  lineItems: TraspasoLineItem[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegularizacionStock {
  id: string;
  fecha: string;
  almacenId: string;
  almacenNombre: string;
  productId: string;
  productName: string;
  productRef: string;
  stockTeorico: number;
  stockReal: number;
  diferencia: number;
  motivo: string;
  notas?: string;
  createdAt: string;
}

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
  discountPercent2?: number;
  discountPercent3?: number;
  /**
   * Cuántas unidades sueltas trae cada bulto de los que se facturan.
   *
   * En distribución se vende por cajas y se controla por unidades: doce cajas
   * de veinticuatro son doce en la factura y 288 en el almacén. La cantidad
   * sigue siendo la de bultos —es lo que se cobra— y esto dice a cuántas
   * unidades equivale.
   *
   * Vacío o 1 en quien no trabaja así, que es la mayoría.
   */
  unitsPerPackage?: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Coste unitario del producto al emitir (PMP o última compra) para análisis de margen */
  costPrice?: number;
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
  /** Tarifa aplicada en el documento */
  tarifaId?: string;
  /** Almacén origen (en ventas) o almacén destino (en compras) */
  almacenId?: string;
  /** Importe total acumulado ya cobrado/pagado */
  paidAmount?: number;
  /** IDs de los registros de cobro/pago vinculados */
  paymentRecordIds?: string[];
  /** Hasta 3 descuentos globales al pie de documento (descuento comercial, pronto pago, especial) */
  globalDiscountPercent1?: number;
  globalDiscountPercent2?: number;
  globalDiscountPercent3?: number;
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
  /** true = la ficha es un proveedor (compras). */
  esProveedor?: boolean;
  /** Vendedor asignado al cliente */
  vendedorId?: string;
  /** Tarifa asignada al cliente */
  tarifaId?: string;
  /** Hasta 3 descuentos en cascada por defecto en línea para este cliente [D1%, D2%, D3%] */
  defaultDiscounts?: [number, number, number];
}

export interface Vendedor {
  id: string;
  nombre: string;
  activo: boolean;
  /** Serie propia por tipo de documento; si falta, usa la de la empresa. */
  series: Partial<Record<string, string>>; // clave `${tipo}_${sentido}` -> serie
  createdAt: string;
  updatedAt: string;
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
  /**
   * Unidades sueltas por bulto, para venderlo por cajas.
   *
   * Se pone una vez en la ficha del producto y cada línea que lo use la
   * hereda, en vez de teclearla en cada factura y equivocarse una de cada
   * diez. Vacío o 1 en lo que no se vende por cajas.
   */
  unitsPerPackage?: number;
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
  /** Referencia del proveedor */
  supplierRef?: string;
  /** Precios por tarifa: { [tarifaId]: precio } */
  tarifaPrices?: Record<string, number>;
  /** Precio Medio Ponderado (coste acumulado de compras) */
  costePmp?: number;
  /** Coste de la última compra registrada */
  costeUltimaCompra?: number;
  /** Desglose de existencias por almacén: { [almacenId]: stock } */
  stocksByAlmacen?: Record<string, number>;
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

  /** Tarifas de precios definidas en la empresa */
  tarifas?: Tarifa[];

  /** Almacenes y ubicaciones de la empresa */
  almacenes?: Almacen[];

  // Cobros y Pagos (Tesorería)
  cobroSeries?: string;
  nextCobroNumber?: number;
  pagoSeries?: string;
  nextPagoNumber?: number;
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
  /**
   * Hasta tres descuentos en cascada, igual que en una factura.
   *
   * Un albarán se convierte en factura, y si la línea del albarán sólo
   * guardara el primero, la factura que sale de él cobraría de más.
   */
  discountPercent: number;
  discountPercent2?: number;
  discountPercent3?: number;
  /** Unidades sueltas por bulto. En un albarán es lo que se cuenta al descargar. */
  unitsPerPackage?: number;
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

// --- Cobros, Pagos y Tesorería (Fase 4) ---

export type TipoCobroPago = 'cobro' | 'pago';

export interface CobroPagoDesglose {
  invoiceId: string;
  invoiceNumber: string;
  importeAplicado: number;
}

export interface CobroPago {
  id: string;
  tipo: TipoCobroPago; // 'cobro' (a cliente) | 'pago' (a proveedor)
  series: string;
  number: string;
  fecha: string;
  contraparteId: string;
  contraparteNombre: string;
  contraparteNif?: string;
  paymentMethod: PaymentMethod;
  cuentaBancaria?: string;
  importeTotal: number;
  desglose: CobroPagoDesglose[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MovimientoExtracto {
  id: string;
  fecha: string;
  tipo: 'factura' | 'cobro_pago';
  numero: string;
  concepto: string;
  debe: number; // Incrementa saldo (Factura de venta a cliente / Pago a proveedor)
  haber: number; // Reduce saldo (Cobro de cliente / Factura de compra proveedor)
  saldo: number; // Saldo vivo tras el movimiento
}

