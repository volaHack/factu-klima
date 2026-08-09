// ============================================================
// CONSTANTES DEL SISTEMA (MULTI-SECTOR & TEMAS)
// Iconos: Lucide React component names (sin emojis)
// ============================================================

import {
  InvoiceStatus, PaymentMethod, ProductCategory, TaxRate, UnitOfMeasure,
  BusinessSector, AccentTheme, CompanySettings, TpvMode
} from './types';

// --- Modos de TPV ---
// 'tienda' es el modo por defecto: tiles grandes con categorías en chips.
// 'supermercado' prioriza densidad (grid, orden IA, venta por peso/PLU) y
// 'restaurante' añade mesas con cuentas abiertas.
export const TPV_MODES: { value: TpvMode; label: string; description: string }[] = [
  { value: 'tienda', label: 'Tienda / Estándar', description: 'Tiles grandes y categorías en chips.' },
  { value: 'supermercado', label: 'Supermercado', description: 'Grid denso, orden IA y venta por peso (PLU).' },
  { value: 'restaurante', label: 'Restaurante', description: 'Mesas y cuentas abiertas.' },
];

export function defaultTpvModeForSector(sector: string): TpvMode {
  if (sector === 'supermercado') return 'supermercado';
  if (sector === 'bebidas') return 'restaurante';
  return 'tienda';
}

// --- Sectores de Negocio ---
export const BUSINESS_SECTORS: { value: BusinessSector; label: string; icon: string; description: string }[] = [
  {
    value: 'supermercado',
    label: 'Supermercado / Comercio al por Menor',
    icon: 'ShoppingCart',
    description: 'Venta directa en mostrador, TPV de caja rápida, tickets simplificados y control de caja diario.',
  },
  {
    value: 'alimentacion',
    label: 'Distribución Alimentaria',
    icon: 'Apple',
    description: 'Frutas, verduras, carnes, lácteos, bebidas y frescos. Tipos de IVA reducido y superreducido.',
  },
  {
    value: 'mayorista',
    label: 'Comercio Mayorista / Logística',
    icon: 'Package',
    description: 'Distribución por palets, cajas y bultos. Envíos y logística B2B.',
  },
  {
    value: 'bebidas',
    label: 'Bebidas y Hostelería (HORECA)',
    icon: 'Wine',
    description: 'Distribución para bares, restaurantes y hoteles. Cervezas, vinos, licores y refrescos.',
  },
  {
    value: 'servicios_industriales',
    label: 'Suministros Industriales / Recambios',
    icon: 'Wrench',
    description: 'Ferretería, componentes, maquinaria, recambios y consumibles.',
  },
];

// --- Temas de Color ---
// Las 5 opciones anteriores (esmeralda/zafiro/violeta/ámbar/carmesí) eran
// colores de plantilla genérica sin relación entre sí ni con la marca —
// con el rediseño a blush/vino/rosa, un acento azul o violeta neón
// desentonaba con el resto de la interfaz. Las 4 de ahora son variaciones
// dentro de la misma familia cálida que ya usa el resto de la app.
export const ACCENT_THEMES: { value: AccentTheme; label: string; primaryHex: string; glow: string }[] = [
  { value: 'rose', label: 'Rosa', primaryHex: '#b02a5c', glow: 'rgba(176, 42, 92, 0.25)' },
  { value: 'wine', label: 'Vino', primaryHex: '#7a2436', glow: 'rgba(122, 36, 54, 0.25)' },
  { value: 'terracotta', label: 'Terracota', primaryHex: '#b5502e', glow: 'rgba(181, 80, 46, 0.25)' },
  { value: 'plum', label: 'Ciruela', primaryHex: '#7c3a5c', glow: 'rgba(124, 58, 92, 0.25)' },
];

// --- Tax rates ---
// IVA (régimen peninsular y balear)
export const TAX_RATES = [
  { value: TaxRate.GENERAL, label: 'IVA 21% (General)', rate: 21 },
  { value: TaxRate.REDUCIDO, label: 'IVA 10% (Reducido)', rate: 10 },
  { value: TaxRate.SUPERREDUCIDO, label: 'IVA 4% (Superreducido)', rate: 4 },
  { value: TaxRate.EXENTO, label: 'Exento (0%)', rate: 0 },
];

// IGIC (régimen canario)
export const IGIC_TAX_RATES = [
  { value: TaxRate.IGIC_GENERAL, label: 'IGIC 7% (General)', rate: 7 },
  { value: TaxRate.IGIC_REDUCIDO, label: 'IGIC 3% (Reducido)', rate: 3 },
  { value: TaxRate.IGIC_INCREMENTADO, label: 'IGIC 13% (Incrementado)', rate: 13 },
  { value: TaxRate.EXENTO, label: 'Exento (0%)', rate: 0 },
];

/**
 * Devuelve 'IVA' o 'IGIC' según la configuración de la empresa.
 * Usar en etiquetas de formularios, facturas, informes y TPV.
 */
export function getTaxLabel(settings?: { igicEnabled?: boolean } | null): string {
  return settings?.igicEnabled ? 'IGIC' : 'IVA';
}

/**
 * Devuelve las tasas impositivas correctas según el régimen fiscal
 * configurado (IVA para la península, IGIC para Canarias).
 */
export function getTaxRates(settings?: { igicEnabled?: boolean } | null) {
  return settings?.igicEnabled ? IGIC_TAX_RATES : TAX_RATES;
}

/**
 * Devuelve la tasa por defecto del régimen activo (21% IVA ó 7% IGIC).
 */
export function getDefaultTaxRate(settings?: { igicEnabled?: boolean } | null): TaxRate {
  return settings?.igicEnabled ? TaxRate.IGIC_GENERAL : TaxRate.GENERAL;
}

// --- Invoice statuses ---
export const INVOICE_STATUSES = [
  { value: InvoiceStatus.BORRADOR, label: 'Borrador', color: 'var(--color-neutral)' },
  { value: InvoiceStatus.PRE_APROBACION, label: 'En revisión', color: 'var(--color-info)' },
  { value: InvoiceStatus.APROBADO, label: 'Aprobado', color: 'var(--color-success)' },
  { value: InvoiceStatus.APROBADO_PARCIAL, label: 'Aprobado parcial', color: 'var(--color-warning)' },
  { value: InvoiceStatus.RECHAZADO, label: 'Rechazado', color: 'var(--color-danger)' },
  { value: InvoiceStatus.EMITIDA, label: 'Emitida', color: 'var(--color-info)' },
  { value: InvoiceStatus.PENDIENTE, label: 'Pendiente', color: 'var(--color-warning)' },
  { value: InvoiceStatus.PAGADA, label: 'Pagada', color: 'var(--color-success)' },
  { value: InvoiceStatus.VENCIDA, label: 'Vencida', color: 'var(--color-danger)' },
  { value: InvoiceStatus.ANULADA, label: 'Anulada', color: 'var(--color-neutral)' },
];

// --- Payment methods ---
export const PAYMENT_METHODS = [
  { value: PaymentMethod.TRANSFERENCIA, label: 'Transferencia bancaria' },
  { value: PaymentMethod.EFECTIVO, label: 'Efectivo' },
  { value: PaymentMethod.DOMICILIACION, label: 'Domiciliación bancaria' },
  { value: PaymentMethod.PAGARE, label: 'Pagaré' },
  { value: PaymentMethod.TARJETA, label: 'Tarjeta de crédito/débito' },
  { value: PaymentMethod.BIZUM, label: 'Bizum' },
];

// --- Categorías por defecto según Sector de negocio (Lucide icon names) ---
export const SECTOR_DEFAULT_CATEGORIES: Record<string, { value: string; label: string; icon: string }[]> = {
  supermercado: [
    { value: 'frescos', label: 'Alimentos Frescos', icon: 'Apple' },
    { value: 'despensa', label: 'Despensa y Granel', icon: 'Package' },
    { value: 'bebidas', label: 'Bebidas y Licores', icon: 'GlassWater' },
    { value: 'limpieza', label: 'Limpieza e Higiene', icon: 'Sparkles' },
    { value: 'panaderia', label: 'Panadería del Día', icon: 'Croissant' },
    { value: 'ofertas', label: 'Cajas de Oferta', icon: 'Tag' },
    { value: 'otros', label: 'Otros Artículos', icon: 'ShoppingCart' },
  ],
  alimentacion: [
    { value: 'frutas', label: 'Frutas Frescas', icon: 'Apple' },
    { value: 'verduras', label: 'Verduras y Hortalizas', icon: 'Carrot' },
    { value: 'lacteos', label: 'Lácteos y Quesos', icon: 'Milk' },
    { value: 'carnicos', label: 'Cárnicos y Embutidos', icon: 'Beef' },
    { value: 'pescados', label: 'Pescados y Mariscos', icon: 'Fish' },
    { value: 'congelados', label: 'Congelados', icon: 'Snowflake' },
    { value: 'panaderia', label: 'Panadería y Dulces', icon: 'Croissant' },
    { value: 'conservas', label: 'Conservas y Aceites', icon: 'ScrollText' },
    { value: 'bebidas', label: 'Bebidas y Zumos', icon: 'GlassWater' },
    { value: 'otros', label: 'Otros Productos', icon: 'Package' },
  ],
  mayorista: [
    { value: 'palets', label: 'Paletería Completa', icon: 'Package' },
    { value: 'cajas_master', label: 'Cajas Master / Bulk', icon: 'Tag' },
    { value: 'embalaje', label: 'Material de Embalaje', icon: 'Box' },
    { value: 'carga_general', label: 'Carga General', icon: 'Truck' },
    { value: 'consumibles', label: 'Consumibles Almacén', icon: 'ClipboardList' },
    { value: 'otros', label: 'Otros Envíos', icon: 'Package' },
  ],
  bebidas: [
    { value: 'cervezas', label: 'Cervezas y Barriles', icon: 'Beer' },
    { value: 'vinos', label: 'Vinos y Cavas', icon: 'Wine' },
    { value: 'licores', label: 'Licores y Espirituosos', icon: 'GlassWater' },
    { value: 'refrescos', label: 'Refrescos y Aguas', icon: 'GlassWater' },
    { value: 'cafes', label: 'Café y Té HORECA', icon: 'Coffee' },
    { value: 'snacking', label: 'Aperitivos y Snacks', icon: 'Popcorn' },
    { value: 'otros', label: 'Otros HORECA', icon: 'Utensils' },
  ],
  servicios_industriales: [
    { value: 'herramientas', label: 'Herramientas y Utillaje', icon: 'Hammer' },
    { value: 'recambios', label: 'Recambios y Componentes', icon: 'Cog' },
    { value: 'lubricantes', label: 'Lubricantes y Químicos', icon: 'Fuel' },
    { value: 'tornilleria', label: 'Tornillería y Fijación', icon: 'Wrench' },
    { value: 'epis', label: 'Protección Laboral / EPIs', icon: 'HardHat' },
    { value: 'maquinaria', label: 'Maquinaria y Equipos', icon: 'Plug' },
    { value: 'otros', label: 'Otros Suministros', icon: 'CircuitBoard' },
  ],
};

// Preset de iconos Lucide para clasificación rápida
export const ICON_PRESETS = [
  'Apple', 'Carrot', 'Milk', 'Beef', 'Fish', 'Snowflake', 'Croissant', 'ScrollText', 'GlassWater', 'Wine',
  'Beer', 'Coffee', 'Popcorn', 'Utensils', 'Package', 'Tag', 'Box', 'Truck', 'ClipboardList',
  'Hammer', 'Cog', 'Fuel', 'Wrench', 'HardHat', 'Plug', 'CircuitBoard', 'Zap', 'Pill', 'Leaf',
  'Shirt', 'Laptop', 'Car', 'Key', 'Timer', 'Shield', 'Star', 'Flame', 'Gem', 'ShoppingCart',
];

export const PRODUCT_CATEGORIES = SECTOR_DEFAULT_CATEGORIES.alimentacion;

// --- Units of measure ---
export const UNITS_OF_MEASURE = [
  { value: UnitOfMeasure.KG, label: 'Kilogramos (kg)' },
  { value: UnitOfMeasure.UNIDAD, label: 'Unidades (ud)' },
  { value: UnitOfMeasure.CAJA, label: 'Cajas' },
  { value: UnitOfMeasure.PALET, label: 'Palets' },
  { value: UnitOfMeasure.LITRO, label: 'Litros (L)' },
  { value: UnitOfMeasure.DOCENA, label: 'Docenas' },
  { value: UnitOfMeasure.PACK, label: 'Packs' },
];

// --- Spanish provinces ---
export const PROVINCES = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila',
  'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria',
  'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca',
  'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca',
  'Illes Balears', 'Jaén', 'León', 'Lleida', 'Lugo', 'Madrid',
  'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Las Palmas',
  'Pontevedra', 'La Rioja', 'Salamanca', 'Santa Cruz de Tenerife',
  'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
  'Ceuta', 'Melilla',
];

// --- Default company settings ---
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  businessName: 'Distribuciones Alimentarias del Sur S.L.',
  nif: 'B41567890',
  tradeName: 'DistAlSur',
  sector: 'alimentacion',
  accentTheme: 'rose',
  email: 'facturacion@distalsur.es',
  phone: '+34 954 123 456',
  website: 'www.distalsur.es',
  address: 'Polígono Industrial Calonge, Nave 24',
  city: 'Sevilla',
  postalCode: '41007',
  province: 'Sevilla',
  invoiceSeries: 'FAC',
  nextInvoiceNumber: 21,
  tpvSeries: 'TPV',
  nextTpvNumber: 1,
  defaultPaymentDays: 30,
  defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
  invoiceFooterText: 'Factura con registro sellado mediante huella SHA-256 encadenada.',
  iban: 'ES91 2100 0418 4502 0005 1332',
  bankName: 'CaixaBank',
  verifactuEnabled: true,
  logoUrl: '',
  stripeEnabled: false,
  stripePublishableKey: '',
  tpvEnabled: undefined,
  igicEnabled: false,
};

/**
 * Comprueba si el módulo TPV está activo para la empresa.
 * Si el usuario lo ha activado/desactivado explícitamente en Ajustes (tpvEnabled),
 * prevalece esa preferencia. De lo contrario, se activa por defecto si el sector
 * es supermercado, alimentación o bebidas (hostelería).
 */
export function isTpvEnabled(settings: CompanySettings | null): boolean {
  if (!settings) return false;
  if (settings.tpvEnabled !== undefined) {
    return settings.tpvEnabled;
  }
  return ['supermercado', 'alimentacion', 'bebidas'].includes(settings.sector);
}


export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_APPROVAL_EXPIRY_HOURS = 72;
