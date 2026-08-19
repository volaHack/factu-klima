// ============================================================
// CONSTANTES DEL SISTEMA (MULTI-SECTOR & TEMAS)
// Iconos: Lucide React component names (sin emojis)
// ============================================================

import {
  InvoiceStatus, PaymentMethod, TaxRate, UnitOfMeasure,
  BusinessSector, GrupoSector, AccentTheme, CompanySettings, TpvMode
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
export const BUSINESS_SECTORS: { value: BusinessSector; label: string; icon: string; grupo: GrupoSector; description: string }[] = [
  {
    value: 'supermercado',
    label: 'Supermercado / Comercio al por Menor',
    icon: 'ShoppingCart',
    grupo: 'comercio',
    description: 'Venta directa en mostrador, TPV de caja rápida, tickets simplificados y control de caja diario.',
  },
  {
    value: 'alimentacion',
    label: 'Distribución Alimentaria',
    icon: 'Apple',
    grupo: 'comercio',
    description: 'Frutas, verduras, carnes, lácteos, bebidas y frescos. Tipos de IVA reducido y superreducido.',
  },
  {
    value: 'mayorista',
    label: 'Comercio Mayorista / Logística',
    icon: 'Package',
    grupo: 'comercio',
    description: 'Distribución por palets, cajas y bultos. Envíos y logística B2B.',
  },
  {
    value: 'bebidas',
    label: 'Bebidas y Hostelería (HORECA)',
    icon: 'Wine',
    grupo: 'comercio',
    description: 'Distribución para bares, restaurantes y hoteles. Cervezas, vinos, licores y refrescos.',
  },
  {
    value: 'servicios_industriales',
    label: 'Suministros Industriales / Recambios',
    icon: 'Wrench',
    grupo: 'comercio',
    description: 'Ferretería, componentes, maquinaria, recambios y consumibles.',
  },

  // --- Los que venden trabajo, no género ---
  //
  // Sus «categorías» son conceptos de factura —una sesión, una minuta, una
  // partida de obra— en vez de familias de artículos. Es la misma mecánica:
  // lo que cambia es que la línea describe lo que se hizo y no lo que se
  // entregó.
  {
    value: 'psicologia',
    label: 'Psicología y Psicoterapia',
    icon: 'Brain',
    grupo: 'salud',
    description: 'Sesiones, bonos y seguimiento. Servicios exentos de IVA por prestación sanitaria.',
  },
  {
    value: 'medicina',
    label: 'Medicina y Clínicas',
    icon: 'Stethoscope',
    grupo: 'salud',
    description: 'Consultas, pruebas y procedimientos. Nº de colegiado y centro médico en la factura.',
  },
  {
    value: 'dental',
    label: 'Clínicas Dentales',
    icon: 'Smile',
    grupo: 'salud',
    description: 'Tratamientos por pieza y presupuestos por fases.',
  },
  {
    value: 'fisioterapia',
    label: 'Fisioterapia y Rehabilitación',
    icon: 'HeartPulse',
    grupo: 'salud',
    description: 'Sesiones sueltas y bonos, con duración y tipo de terapia.',
  },
  {
    value: 'nutricion',
    label: 'Nutrición y Dietética',
    icon: 'Salad',
    grupo: 'salud',
    description: 'Consultas, planes nutricionales y bonos de seguimiento.',
  },
  {
    value: 'veterinaria',
    label: 'Veterinaria',
    icon: 'PawPrint',
    grupo: 'salud',
    description: 'Consultas, vacunas, cirugía y medicación, con nº de historia clínica.',
  },
  {
    value: 'abogacia',
    label: 'Abogacía y Despachos',
    icon: 'Scale',
    grupo: 'profesional',
    description: 'Minutas, expedientes, suplidos y retención de IRPF.',
  },
  {
    value: 'procuraduria',
    label: 'Procuradores',
    icon: 'Gavel',
    grupo: 'profesional',
    description: 'Derechos arancelarios, autos y juzgado, con gastos y suplidos.',
  },
  {
    value: 'asesoria',
    label: 'Asesorías y Gestorías',
    icon: 'Calculator',
    grupo: 'profesional',
    description: 'Cuotas mensuales, nóminas e impuestos, con periodo facturado.',
  },
  {
    value: 'peritaje',
    label: 'Peritos y Tasadores',
    icon: 'ClipboardCheck',
    grupo: 'profesional',
    description: 'Peritajes, informes y visitas, con expediente y desplazamiento.',
  },
  {
    value: 'traduccion',
    label: 'Traducción e Interpretación',
    icon: 'Languages',
    grupo: 'profesional',
    description: 'Por palabras o por horas, con par de idiomas y urgencia.',
  },
  {
    value: 'arquitectura',
    label: 'Arquitectura',
    icon: 'Compass',
    grupo: 'tecnico',
    description: 'Proyectos, dirección de obra y certificaciones, con m² y referencia catastral.',
  },
  {
    value: 'interiorismo',
    label: 'Interiorismo y Decoración',
    icon: 'Sofa',
    grupo: 'tecnico',
    description: 'Proyecto, diseño y dirección por fases, con m² y visitas.',
  },
  {
    value: 'ingenieria',
    label: 'Ingeniería y Consultoría Técnica',
    icon: 'Ruler',
    grupo: 'tecnico',
    description: 'Memorias, dirección técnica e informes, por horas o por proyecto.',
  },
  {
    value: 'informatica',
    label: 'Informática y Desarrollo',
    icon: 'Code',
    grupo: 'tecnico',
    description: 'Desarrollo, mantenimiento y suscripciones, con hosting, dominios y SLA.',
  },
  {
    value: 'diseno',
    label: 'Diseño Gráfico y Creatividad',
    icon: 'Palette',
    grupo: 'tecnico',
    description: 'Branding, piezas y revisiones, con derechos de uso.',
  },
  {
    value: 'fotografia',
    label: 'Fotografía y Vídeo',
    icon: 'Camera',
    grupo: 'tecnico',
    description: 'Sesiones, reportajes y edición, con horas de cobertura y entrega.',
  },
  {
    value: 'marketing',
    label: 'Agencias de Marketing',
    icon: 'Megaphone',
    grupo: 'tecnico',
    description: 'Cuota mensual, campañas y presupuesto publicitario por periodo.',
  },
  {
    value: 'formacion',
    label: 'Formación y Coaching',
    icon: 'GraduationCap',
    grupo: 'tecnico',
    description: 'Programas, cursos y sesiones, presenciales u online.',
  },
  {
    value: 'clases',
    label: 'Clases Particulares',
    icon: 'BookOpen',
    grupo: 'tecnico',
    description: 'Clases por asignatura y periodo, sueltas o por bonos.',
  },
  {
    value: 'freelance',
    label: 'Freelance y Autónomos',
    icon: 'Briefcase',
    grupo: 'tecnico',
    description: 'Servicios por horas o por proyecto, con gastos y desplazamientos.',
  },
  {
    value: 'electricidad',
    label: 'Electricidad e Instalaciones',
    icon: 'Zap',
    grupo: 'oficio',
    description: 'Mano de obra y materiales, con desplazamiento y nº de instalación.',
  },
  {
    value: 'fontaneria',
    label: 'Fontanería',
    icon: 'Droplets',
    grupo: 'oficio',
    description: 'Reparaciones e instalaciones, con recargo de urgencia.',
  },
  {
    value: 'reformas',
    label: 'Albañilería y Reformas',
    icon: 'HardHat',
    grupo: 'oficio',
    description: 'Partidas de obra por m², con anticipos y retención.',
  },
  {
    value: 'taller',
    label: 'Talleres Mecánicos',
    icon: 'Car',
    grupo: 'oficio',
    description: 'Mano de obra y recambios, con matrícula y kilometraje.',
  },
  {
    value: 'limpieza',
    label: 'Servicios de Limpieza',
    icon: 'Sparkles',
    grupo: 'oficio',
    description: 'Por horas, por m² o por periodo, con productos aparte.',
  },
  {
    value: 'transporte',
    label: 'Transporte y Mensajería',
    icon: 'Truck',
    grupo: 'oficio',
    description: 'Portes por kilómetros o peso, con origen, destino y peajes.',
  },
  {
    value: 'peluqueria',
    label: 'Peluquerías y Barberías',
    icon: 'Scissors',
    grupo: 'publico',
    description: 'Servicios por profesional, con bonos y productos.',
  },
  {
    value: 'estetica',
    label: 'Centros de Estética',
    icon: 'Flower2',
    grupo: 'publico',
    description: 'Tratamientos y bonos de sesiones, por profesional.',
  },
  {
    value: 'eventos',
    label: 'Fotografía de Eventos',
    icon: 'PartyPopper',
    grupo: 'publico',
    description: 'Bodas y eventos por horas de cobertura, con álbum y edición.',
  },
  {
    value: 'inmobiliaria',
    label: 'Inmobiliarias',
    icon: 'Building2',
    grupo: 'publico',
    description: 'Comisiones por intermediación, con inmueble y porcentaje.',
  },
];
/**
 * Familias de sectores, para que el selector no sea una pared de tarjetas.
 *
 * Con cinco sectores una rejilla plana se leía de un vistazo. Con treinta y
 * seis, no: hay que poder saltar directamente a «Salud» o a «Oficios» sin
 * repasar las treinta y cinco que no son.
 */
export const GRUPOS_SECTOR: { value: GrupoSector; label: string }[] = [
  { value: 'comercio', label: 'Comercio y distribución' },
  { value: 'salud', label: 'Salud y bienestar' },
  { value: 'profesional', label: 'Servicios profesionales' },
  { value: 'tecnico', label: 'Técnicos y creativos' },
  { value: 'oficio', label: 'Oficios y obra' },
  { value: 'publico', label: 'Servicios al público' },
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
export const DEFAULT_IVA_RATES = [21, 10, 4, 0];
export const TAX_RATES: { value: number; label: string; rate: number }[] = [
  { value: TaxRate.GENERAL, label: 'IVA 21% (General)', rate: 21 },
  { value: TaxRate.REDUCIDO, label: 'IVA 10% (Reducido)', rate: 10 },
  { value: TaxRate.SUPERREDUCIDO, label: 'IVA 4% (Superreducido)', rate: 4 },
  { value: TaxRate.EXENTO, label: 'Exento (0%)', rate: 0 },
];

// IGIC (régimen canario)
export const DEFAULT_IGIC_RATES = [7, 3, 13, 0];
export const IGIC_TAX_RATES: { value: number; label: string; rate: number }[] = [
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
 * Porcentajes disponibles según el régimen activo. Si la empresa ha
 * configurado sus propios tipos en Ajustes, se usan esos; si no, los del
 * régimen por defecto (IVA 21/10/4/0 ó IGIC 7/3/13/0).
 */
export function getConfiguredTaxRates(settings?: { igicEnabled?: boolean; ivaRates?: number[]; igicRates?: number[] } | null): number[] {
  if (settings?.igicEnabled) {
    return settings?.igicRates?.length ? settings.igicRates : DEFAULT_IGIC_RATES;
  }
  return settings?.ivaRates?.length ? settings.ivaRates : DEFAULT_IVA_RATES;
}

/**
 * Devuelve las tasas impositivas correctas según el régimen fiscal
 * configurado (IVA para la península, IGIC para Canarias), respetando
 * los porcentajes que la empresa eligió en Ajustes.
 */
export function getTaxRates(settings?: { igicEnabled?: boolean; ivaRates?: number[]; igicRates?: number[] } | null) {
  const label = getTaxLabel(settings);
  return getConfiguredTaxRates(settings).map((rate) => ({
    value: rate,
    label: rate === 0 ? 'Exento (0%)' : `${label} ${rate}%`,
    rate,
  }));
}

/**
 * Devuelve la tasa por defecto del régimen activo (el porcentaje más alto
 * configurado: 21% IVA ó 7% IGIC por defecto).
 */
export function getDefaultTaxRate(settings?: { igicEnabled?: boolean; ivaRates?: number[]; igicRates?: number[] } | null): number {
  const rates = getConfiguredTaxRates(settings).filter((r) => r > 0);
  return rates.length ? Math.max(...rates) : (settings?.igicEnabled ? TaxRate.IGIC_GENERAL : TaxRate.GENERAL);
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
  { value: InvoiceStatus.PARCIAL, label: 'Cobro parcial', color: 'var(--color-warning)' },
  { value: InvoiceStatus.PAGADA, label: 'Pagada', color: 'var(--color-success)' },
  { value: InvoiceStatus.VENCIDA, label: 'Vencida', color: 'var(--color-danger)' },
  { value: InvoiceStatus.ANULADA, label: 'Anulada', color: 'var(--color-neutral)' },
];

// --- Albaranes (documento de entrega) ---
export const ALBARAN_STATUSES = [
  { value: 'borrador', label: 'Borrador', color: 'var(--color-neutral)' },
  { value: 'expedido', label: 'Expedido', color: 'var(--color-info)' },
  { value: 'facturado', label: 'Facturado', color: 'var(--color-success)' },
  { value: 'anulado', label: 'Anulado', color: 'var(--color-neutral)' },
] as const;

// --- Devoluciones ---
export const DEVOLUCION_STATUSES = [
  { value: 'registrada', label: 'Registrada', color: 'var(--color-info)' },
  { value: 'abonada', label: 'Abonada', color: 'var(--color-success)' },
] as const;

export const DEVOLUCION_REASONS = [
  { value: 'rotura', label: 'Rotura / avería', color: 'var(--color-danger)' },
  { value: 'defecto', label: 'Defecto de fábrica', color: 'var(--color-warning)' },
  { value: 'error', label: 'Error del pedido', color: 'var(--color-info)' },
  { value: 'vencido', label: 'Producto caducado', color: 'var(--color-warning)' },
  { value: 'otro', label: 'Otro', color: 'var(--color-neutral)' },
] as const;

// --- Abonos (nota de crédito) ---
export const ABONO_STATUSES = [
  { value: 'emitido', label: 'Emitido', color: 'var(--color-info)' },
  { value: 'parcial', label: 'Aplicado parcial', color: 'var(--color-warning)' },
  { value: 'usado', label: 'Aplicado por completo', color: 'var(--color-success)' },
  { value: 'anulado', label: 'Anulado', color: 'var(--color-neutral)' },
] as const;

// --- Payment methods ---
export const PAYMENT_METHODS = [
  { value: PaymentMethod.TRANSFERENCIA, label: 'Transferencia bancaria' },  { value: PaymentMethod.EFECTIVO, label: 'Efectivo' },
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


  // --- Conceptos de los oficios que venden trabajo ---
  psicologia: [
    { value: 'sesion', label: 'Sesión de terapia', icon: 'Brain' },
    { value: 'consulta_inicial', label: 'Consulta inicial', icon: 'ClipboardList' },
    { value: 'seguimiento', label: 'Seguimiento', icon: 'Timer' },
    { value: 'individual', label: 'Terapia individual', icon: 'User' },
    { value: 'pareja_familiar', label: 'Terapia de pareja o familiar', icon: 'Users' },
    { value: 'bono', label: 'Bono de sesiones', icon: 'Tag' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  medicina: [
    { value: 'consulta', label: 'Consulta', icon: 'Stethoscope' },
    { value: 'primera_visita', label: 'Primera visita', icon: 'ClipboardList' },
    { value: 'revision', label: 'Revisión', icon: 'Timer' },
    { value: 'prueba', label: 'Prueba diagnóstica', icon: 'Activity' },
    { value: 'procedimiento', label: 'Procedimiento médico', icon: 'HeartPulse' },
    { value: 'otros', label: 'Otros servicios', icon: 'Pill' },
  ],
  dental: [
    { value: 'limpieza', label: 'Limpieza bucal', icon: 'Sparkles' },
    { value: 'empaste', label: 'Empaste', icon: 'Pill' },
    { value: 'endodoncia', label: 'Endodoncia', icon: 'Activity' },
    { value: 'extraccion', label: 'Extracción', icon: 'Scissors' },
    { value: 'implante', label: 'Implante', icon: 'Cog' },
    { value: 'ortodoncia', label: 'Ortodoncia', icon: 'Smile' },
    { value: 'protesis', label: 'Prótesis', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  fisioterapia: [
    { value: 'sesion', label: 'Sesión', icon: 'HeartPulse' },
    { value: 'bono', label: 'Bono de sesiones', icon: 'Tag' },
    { value: 'tratamiento', label: 'Tratamiento', icon: 'Activity' },
    { value: 'valoracion', label: 'Valoración inicial', icon: 'ClipboardList' },
    { value: 'domicilio', label: 'Sesión a domicilio', icon: 'Home' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  nutricion: [
    { value: 'consulta_inicial', label: 'Consulta inicial', icon: 'ClipboardList' },
    { value: 'seguimiento', label: 'Seguimiento', icon: 'Timer' },
    { value: 'plan', label: 'Plan nutricional', icon: 'Leaf' },
    { value: 'bono', label: 'Bono de consultas', icon: 'Tag' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  veterinaria: [
    { value: 'consulta', label: 'Consulta', icon: 'Stethoscope' },
    { value: 'vacunacion', label: 'Vacunación', icon: 'Pill' },
    { value: 'cirugia', label: 'Cirugía', icon: 'Activity' },
    { value: 'prueba', label: 'Prueba diagnóstica', icon: 'ClipboardList' },
    { value: 'medicacion', label: 'Medicación', icon: 'Pill' },
    { value: 'peluqueria', label: 'Peluquería canina', icon: 'Scissors' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  abogacia: [
    { value: 'consulta', label: 'Consulta jurídica', icon: 'Scale' },
    { value: 'honorarios', label: 'Honorarios', icon: 'Gavel' },
    { value: 'minuta', label: 'Minuta', icon: 'ScrollText' },
    { value: 'procedimiento', label: 'Procedimiento', icon: 'Gavel' },
    { value: 'suplidos', label: 'Gastos suplidos', icon: 'Tag' },
    { value: 'procurador', label: 'Procurador', icon: 'Users' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  procuraduria: [
    { value: 'derechos', label: 'Derechos arancelarios', icon: 'Gavel' },
    { value: 'honorarios', label: 'Honorarios', icon: 'Scale' },
    { value: 'procedimiento', label: 'Procedimiento', icon: 'ScrollText' },
    { value: 'suplidos', label: 'Gastos y suplidos', icon: 'Tag' },
    { value: 'otros', label: 'Otras actuaciones', icon: 'ClipboardList' },
  ],
  asesoria: [
    { value: 'asesoramiento', label: 'Asesoramiento', icon: 'ClipboardList' },
    { value: 'contabilidad', label: 'Contabilidad', icon: 'Calculator' },
    { value: 'fiscalidad', label: 'Fiscalidad', icon: 'ScrollText' },
    { value: 'nominas', label: 'Nóminas', icon: 'Users' },
    { value: 'impuestos', label: 'Presentación de impuestos', icon: 'FileCheck' },
    { value: 'cuota', label: 'Cuota mensual', icon: 'Timer' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  peritaje: [
    { value: 'peritaje', label: 'Peritaje', icon: 'ClipboardCheck' },
    { value: 'informe', label: 'Informe pericial', icon: 'ScrollText' },
    { value: 'visita', label: 'Visita', icon: 'Home' },
    { value: 'desplazamiento', label: 'Desplazamiento', icon: 'Car' },
    { value: 'horas', label: 'Horas', icon: 'Timer' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  traduccion: [
    { value: 'traduccion', label: 'Traducción', icon: 'Languages' },
    { value: 'revision', label: 'Revisión', icon: 'FileCheck' },
    { value: 'interpretacion', label: 'Interpretación', icon: 'Users' },
    { value: 'jurada', label: 'Traducción jurada', icon: 'Gavel' },
    { value: 'urgencia', label: 'Recargo por urgencia', icon: 'Timer' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  arquitectura: [
    { value: 'proyecto_basico', label: 'Proyecto básico', icon: 'Compass' },
    { value: 'proyecto_ejecucion', label: 'Proyecto de ejecución', icon: 'Ruler' },
    { value: 'direccion_obra', label: 'Dirección de obra', icon: 'HardHat' },
    { value: 'certificacion', label: 'Certificación', icon: 'FileCheck' },
    { value: 'visado', label: 'Visado', icon: 'ScrollText' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  interiorismo: [
    { value: 'proyecto', label: 'Proyecto', icon: 'Compass' },
    { value: 'diseno', label: 'Diseño', icon: 'Palette' },
    { value: 'direccion', label: 'Dirección', icon: 'HardHat' },
    { value: 'materiales', label: 'Materiales', icon: 'Box' },
    { value: 'visitas', label: 'Visitas', icon: 'Home' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  ingenieria: [
    { value: 'proyecto', label: 'Proyecto', icon: 'Ruler' },
    { value: 'memoria', label: 'Memoria técnica', icon: 'ScrollText' },
    { value: 'direccion', label: 'Dirección técnica', icon: 'HardHat' },
    { value: 'certificacion', label: 'Certificación', icon: 'FileCheck' },
    { value: 'informe', label: 'Informe', icon: 'ClipboardList' },
    { value: 'horas', label: 'Horas técnicas', icon: 'Timer' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  informatica: [
    { value: 'desarrollo_web', label: 'Desarrollo web', icon: 'Code' },
    { value: 'desarrollo_software', label: 'Desarrollo de software', icon: 'Laptop' },
    { value: 'mantenimiento', label: 'Mantenimiento', icon: 'Wrench' },
    { value: 'soporte', label: 'Soporte técnico', icon: 'Timer' },
    { value: 'consultoria', label: 'Consultoría', icon: 'ClipboardList' },
    { value: 'licencias', label: 'Licencias', icon: 'Key' },
    { value: 'hosting', label: 'Hosting y dominios', icon: 'Server' },
    { value: 'suscripciones', label: 'Suscripciones', icon: 'Tag' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  diseno: [
    { value: 'diseno_grafico', label: 'Diseño gráfico', icon: 'Palette' },
    { value: 'branding', label: 'Branding', icon: 'Gem' },
    { value: 'logo', label: 'Logotipo', icon: 'Star' },
    { value: 'diseno_web', label: 'Diseño web', icon: 'Laptop' },
    { value: 'creatividades', label: 'Creatividades', icon: 'Sparkles' },
    { value: 'derechos', label: 'Derechos de uso', icon: 'Key' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  fotografia: [
    { value: 'sesion', label: 'Sesión', icon: 'Camera' },
    { value: 'reportaje', label: 'Reportaje', icon: 'Camera' },
    { value: 'video', label: 'Vídeo', icon: 'Film' },
    { value: 'edicion', label: 'Edición', icon: 'Sparkles' },
    { value: 'album', label: 'Álbum y copias', icon: 'Box' },
    { value: 'desplazamiento', label: 'Desplazamiento', icon: 'Car' },
    { value: 'derechos', label: 'Derechos de uso', icon: 'Key' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  marketing: [
    { value: 'redes', label: 'Gestión de redes', icon: 'Megaphone' },
    { value: 'seo', label: 'SEO', icon: 'Star' },
    { value: 'publicidad', label: 'Publicidad', icon: 'Tag' },
    { value: 'contenido', label: 'Creación de contenido', icon: 'Palette' },
    { value: 'campana', label: 'Campaña', icon: 'Flame' },
    { value: 'fee', label: 'Cuota mensual', icon: 'Timer' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  formacion: [
    { value: 'sesion', label: 'Sesión', icon: 'Timer' },
    { value: 'programa', label: 'Programa', icon: 'GraduationCap' },
    { value: 'curso', label: 'Curso', icon: 'BookOpen' },
    { value: 'formacion_empresa', label: 'Formación en empresa', icon: 'Users' },
    { value: 'online', label: 'Formación online', icon: 'Laptop' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  clases: [
    { value: 'clase', label: 'Clase', icon: 'BookOpen' },
    { value: 'bono', label: 'Bono de clases', icon: 'Tag' },
    { value: 'online', label: 'Clase online', icon: 'Laptop' },
    { value: 'grupo', label: 'Clase en grupo', icon: 'Users' },
    { value: 'material', label: 'Material didáctico', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  freelance: [
    { value: 'servicio', label: 'Servicio', icon: 'Briefcase' },
    { value: 'horas', label: 'Horas', icon: 'Timer' },
    { value: 'proyecto', label: 'Proyecto', icon: 'ClipboardList' },
    { value: 'gastos', label: 'Gastos', icon: 'Tag' },
    { value: 'desplazamiento', label: 'Desplazamientos', icon: 'Car' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  electricidad: [
    { value: 'mano_obra', label: 'Mano de obra', icon: 'Timer' },
    { value: 'materiales', label: 'Materiales', icon: 'Box' },
    { value: 'instalacion', label: 'Instalación', icon: 'Zap' },
    { value: 'reparacion', label: 'Reparación', icon: 'Wrench' },
    { value: 'desplazamiento', label: 'Desplazamiento', icon: 'Car' },
    { value: 'boletin', label: 'Boletín y certificados', icon: 'FileCheck' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  fontaneria: [
    { value: 'reparacion', label: 'Reparación', icon: 'Wrench' },
    { value: 'instalacion', label: 'Instalación', icon: 'Droplets' },
    { value: 'materiales', label: 'Materiales', icon: 'Box' },
    { value: 'mano_obra', label: 'Mano de obra', icon: 'Timer' },
    { value: 'desplazamiento', label: 'Desplazamiento', icon: 'Car' },
    { value: 'urgencia', label: 'Servicio urgente', icon: 'Flame' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  reformas: [
    { value: 'mano_obra', label: 'Mano de obra', icon: 'Timer' },
    { value: 'materiales', label: 'Materiales', icon: 'Box' },
    { value: 'partida', label: 'Partida de obra', icon: 'ClipboardList' },
    { value: 'demolicion', label: 'Demolición y retirada', icon: 'Hammer' },
    { value: 'acabados', label: 'Acabados', icon: 'Palette' },
    { value: 'anticipo', label: 'Anticipo', icon: 'Tag' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  taller: [
    { value: 'mano_obra', label: 'Mano de obra', icon: 'Timer' },
    { value: 'recambios', label: 'Recambios', icon: 'Cog' },
    { value: 'revision', label: 'Revisión', icon: 'ClipboardList' },
    { value: 'neumaticos', label: 'Neumáticos', icon: 'Cog' },
    { value: 'diagnosis', label: 'Diagnosis', icon: 'CircuitBoard' },
    { value: 'itv', label: 'Gestión de ITV', icon: 'FileCheck' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  limpieza: [
    { value: 'limpieza', label: 'Servicio de limpieza', icon: 'Sparkles' },
    { value: 'horas', label: 'Horas', icon: 'Timer' },
    { value: 'mantenimiento', label: 'Mantenimiento periódico', icon: 'ClipboardList' },
    { value: 'fin_obra', label: 'Limpieza fin de obra', icon: 'HardHat' },
    { value: 'productos', label: 'Productos y consumibles', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  transporte: [
    { value: 'transporte', label: 'Servicio de transporte', icon: 'Truck' },
    { value: 'kilometraje', label: 'Kilometraje', icon: 'Car' },
    { value: 'peajes', label: 'Peajes', icon: 'Tag' },
    { value: 'espera', label: 'Tiempo de espera', icon: 'Timer' },
    { value: 'mudanza', label: 'Mudanza', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  peluqueria: [
    { value: 'corte', label: 'Corte', icon: 'Scissors' },
    { value: 'color', label: 'Color', icon: 'Palette' },
    { value: 'tratamiento', label: 'Tratamiento', icon: 'Sparkles' },
    { value: 'peinado', label: 'Peinado y recogido', icon: 'Star' },
    { value: 'bono', label: 'Bono', icon: 'Tag' },
    { value: 'productos', label: 'Productos', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  estetica: [
    { value: 'tratamiento', label: 'Tratamiento', icon: 'Flower2' },
    { value: 'sesion', label: 'Sesión', icon: 'Timer' },
    { value: 'bono', label: 'Bono de sesiones', icon: 'Tag' },
    { value: 'depilacion', label: 'Depilación', icon: 'Sparkles' },
    { value: 'manicura', label: 'Manicura y pedicura', icon: 'Gem' },
    { value: 'productos', label: 'Productos', icon: 'Box' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  eventos: [
    { value: 'boda', label: 'Boda', icon: 'PartyPopper' },
    { value: 'evento', label: 'Evento', icon: 'Camera' },
    { value: 'cobertura', label: 'Horas de cobertura', icon: 'Timer' },
    { value: 'album', label: 'Álbum', icon: 'Box' },
    { value: 'edicion', label: 'Edición', icon: 'Sparkles' },
    { value: 'desplazamiento', label: 'Desplazamiento', icon: 'Car' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
  ],
  inmobiliaria: [
    { value: 'comision', label: 'Comisión', icon: 'Building2' },
    { value: 'intermediacion', label: 'Intermediación', icon: 'Key' },
    { value: 'alquiler', label: 'Gestión de alquiler', icon: 'Home' },
    { value: 'venta', label: 'Gestión de venta', icon: 'Tag' },
    { value: 'tasacion', label: 'Tasación', icon: 'ClipboardCheck' },
    { value: 'gestion', label: 'Gestión documental', icon: 'ScrollText' },
    { value: 'otros', label: 'Otros conceptos', icon: 'Package' },
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

// --- Series por tipo de documento (tipo_sentido) ---
export const DEFAULT_SERIES_DOCUMENTOS: Record<string, { serie: string; nextNumber: number }> = {
  presupuesto_venta: { serie: 'PRE', nextNumber: 1 },
  pedido_venta: { serie: 'PED', nextNumber: 1 },
  albaran_venta: { serie: 'ALB', nextNumber: 1 },
  factura_venta: { serie: 'FAC', nextNumber: 1 },
  rectificativa_venta: { serie: 'FCR', nextNumber: 1 },
  pedido_compra: { serie: 'PEDC', nextNumber: 1 },
  albaran_compra: { serie: 'ALBC', nextNumber: 1 },
  factura_compra: { serie: 'FACC', nextNumber: 1 },
  rectificativa_compra: { serie: 'FCRC', nextNumber: 1 },
};

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
  ivaRates: [...DEFAULT_IVA_RATES],
  igicRates: [...DEFAULT_IGIC_RATES],
  planId: 'basico',
  subscriptionStatus: 'inactive',
  albaranSeries: 'ALB',
  nextAlbaranNumber: 1,
  devolucionSeries: 'DEV',
  nextDevolucionNumber: 1,
  abonoSeries: 'ABO',
  nextAbonoNumber: 1,
  seriesDocumentos: { ...DEFAULT_SERIES_DOCUMENTOS },
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
