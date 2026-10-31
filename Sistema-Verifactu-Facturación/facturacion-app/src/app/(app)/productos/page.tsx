'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { usePestanaDeLaDireccion, useNuevoDeLaDireccion } from '@/hooks/useDireccion';
import { useRevisarAlVolver } from '@/hooks/useRevisarAlVolver';
import Link from 'next/link';
import {
  Plus, Search, SearchX, Edit, Trash2, X, Check, Tag, Package,
  BarChart3, Layers, AlertCircle, ArrowUpDown, Filter, Store, ChevronRight, ImagePlus, ImageOff, RefreshCw, ChevronUp, ChevronDown, Upload, AlertTriangle, Loader2,
  TrendingUp, Star,
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars } from '@/components/charts/Charts';
import { useColoresGrafica, SERIES } from '@/components/charts/theme';
import {
  getProducts, saveProduct as persistProduct, deleteProduct as removeProduct, adjustStock,
  getCompanyCategories, addCustomCategory, deleteCustomCategory, deleteCategories, updateCustomCategory, getCompanySettings,
  getInvoices,
} from '@/lib/storage';
import { Product, TaxRate, UnitOfMeasure, CompanySettings, Invoice } from '@/lib/types';
import { formatCurrency, generateId, processImageFile } from '@/lib/utils';
import { UNITS_OF_MEASURE, ICON_PRESETS, getTaxLabel, getDefaultTaxRate } from '@/lib/constants';
import { pendientesPorProducto } from '@/lib/documentos';
import TaxRateSlider from '@/components/ui/TaxRateSlider';
import { useToast } from '@/hooks/useToast';
import { tipoGeneral, tipoImpositivoRaro } from '@/lib/validation/lineas';
import { casaTexto } from '@/lib/casaTexto';
import { usePaginacion } from '@/hooks/usePaginacion';
import Paginacion from '@/components/ui/Paginacion';

import CifraQueCuenta from '@/components/ui/CifraQueCuenta';
import SubidaPrecios from '@/components/productos/SubidaPrecios';
import AvisoReposicion from '@/components/productos/AvisoReposicion';
import ConsejoProducto from '@/components/productos/ConsejoProducto';
import SugerenciasFicha from '@/components/productos/SugerenciasFicha';
import { sugerenciasFicha, type CampoSugerido, type SugerenciaFicha } from '@/lib/fichaProducto';
import { conPrecioSubido, conPreciosDeAntes, type Subida } from '@/lib/subidaPrecios';
import { programarBorrado, ESPERA_DESHACER_MS } from '@/lib/borradoDiferido';
import { recordarFicha, olvidarFicha, alternarFijada, estaFijada } from '@/lib/memoriaFichas';
import { usePerfiles } from '@/lib/perfilesCliente';

interface CategoryOption {
  value: string;
  label: string;
  icon: string;
  isCustom?: boolean;
}

/** Barras que caben legibles en una tarjeta; lo demás va resumido debajo. */
const RANKING_MAX = 10;

/**
 * Lo que vale lo que hay en el almacén: a coste medio si se conoce y, si no,
 * a precio de venta. Antes se usaba siempre el de venta y un producto sin
 * existencias anotadas contaba como una unidad; las existencias negativas
 * (ventas antes de dar entrada a la compra) no restan.
 */
function valorStock(p: Product): number {
  const unidades = Math.max(0, p.stockQuantity ?? 0);
  const coste = p.costePmp ?? 0;
  return unidades * (coste > 0 ? coste : p.unitPrice);
}

/** «Las otras 38 categorías: 120.000 € (34 %)», bajo un ranking recortado. */
function RestoDelRanking<T>({ filas, total, valor, formato }: {
  filas: T[];
  total: number;
  valor: (fila: T) => number;
  formato: (n: number) => string;
}) {
  if (filas.length === 0) return null;
  const suma = filas.reduce((n, f) => n + valor(f), 0);
  const pct = total > 0 ? Math.round((suma / total) * 100) : 0;
  return (
    <p className="chart-nota">
      {filas.length === 1 ? 'La otra categoría' : `Las otras ${filas.length} categorías`}:{' '}
      <strong>{formato(suma)}</strong> ({pct} % del total). Todas, en «Tabla».
    </p>
  );
}

const SIN_PENDIENTES = { pendienteRecibir: 0, pendienteEntregar: 0 };

function ProductosPageContenido() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const pendientes = useMemo(() => pendientesPorProducto(invoices), [invoices]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Tabs: 'products' | 'categories'
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  // Borrado de varias categorías a la vez.
  const [catSeleccion, setCatSeleccion] = useState<Set<string>>(() => new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrandoCats, setBorrandoCats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortField, setSortField] = useState<'ref' | 'supplierRef' | 'name' | 'category' | 'unitPrice' | 'costePmp' | 'stockQuantity' | 'defaultTaxRate' | 'active'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Product modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Category CRUD modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryOption | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Package');
  const [savingCat, setSavingCat] = useState(false);

  const { success, warning, error: toastError, addToast } = useToast();
  const { cuenta } = usePerfiles();

  // Selección para subir precios en bloque, y lo borrado que aún se puede
  // deshacer (no se pinta, pero no se ha tocado todavía).
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [verSubida, setVerSubida] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());
  const [fijadoEditando, setFijadoEditando] = useState(false);

  const [form, setForm] = useState({
    ref: '', supplierRef: '', name: '', description: '', category: 'otros',
    unitPrice: 0, defaultTaxRate: TaxRate.REDUCIDO as TaxRate, unit: UnitOfMeasure.KG as UnitOfMeasure,
    active: true, stockQuantity: 100, lowStockThreshold: 10, imageUrl: '', unitsPerPackage: '',
    tarifaPrices: {} as Record<string, number>,
    costePmp: 0,
    costeUltimaCompra: 0,
    purchasePrice: 0,
    // '' = el mismo impuesto que en la venta.
    purchaseTaxRate: '' as number | '',
    notes: '',
  });

  const imageInputRef = useRef<HTMLInputElement>(null);

  // La ficha que aconseja mira el precio y los costes que se están
  // escribiendo, para que el margen responda mientras se teclea.
  const productoDelConsejo = useMemo(() => editing && {
    ...editing,
    unitPrice: Number(form.unitPrice) || 0,
    costePmp: Number(form.costePmp) || 0,
    costeUltimaCompra: Number(form.costeUltimaCompra) || 0,
    purchasePrice: Number(form.purchasePrice) || 0,
  }, [editing, form.unitPrice, form.costePmp, form.costeUltimaCompra, form.purchasePrice]);

  // Los campos de la ficha nueva que se han escrito a mano: de ésos no se
  // sugiere nada (lib/fichaProducto).
  const [tocados, setTocados] = useState<Set<CampoSugerido>>(() => new Set());
  const tocar = (campo: CampoSugerido) => setTocados(prev => (prev.has(campo) ? prev : new Set(prev).add(campo)));

  const updateForm = (field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      [field]: typeof prev[field as keyof typeof prev] === 'number' ? Number(value) : value
    }));
  };

  const updateTarifaPrice = (tarifaId: string, price: number) => {
    setForm(prev => ({
      ...prev,
      tarifaPrices: {
        ...prev.tarifaPrices,
        [tarifaId]: price,
      }
    }));
  };

  const handlePickImage = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await processImageFile(file);
      updateForm('imageUrl', dataUrl);
    } catch (err) {
      toastError('No se pudo cargar la imagen', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const productosConTipoRaro = settings ? products.filter(p => tipoImpositivoRaro(p.defaultTaxRate, settings)) : [];
  const [corrigiendoTipos, setCorrigiendoTipos] = useState(false);
  const corregirTipos = async () => {
    if (!settings) return;
    const tipo = tipoGeneral(settings);
    if (!confirm(`¿Poner el ${tipo} % a ${productosConTipoRaro.length} productos? Las facturas ya emitidas no cambian; las nuevas usarán el ${tipo} %.`)) return;
    setCorrigiendoTipos(true);
    try {
      for (const p of productosConTipoRaro) await persistProduct({ ...p, defaultTaxRate: tipo, updatedAt: new Date().toISOString() }, { conservarStock: true });
      success('Productos corregidos', `${productosConTipoRaro.length} al ${tipo} %`);
      await loadData();
    } catch (e) {
      toastError('No se han podido corregir', e instanceof Error ? e.message : '');
    } finally {
      setCorrigiendoTipos(false);
    }
  };

  const loadData = async () => {
    const [prods, cats, sett, invs] = await Promise.all([
      getProducts(),
      getCompanyCategories(),
      getCompanySettings(),
      getInvoices(),
    ]);
    setProducts(prods);
    setCategories(cats);
    setSettings(sett);
    setInvoices(invs);
  };

  useEffect(() => {
    (async () => {
      await loadData();
      setMounted(true);
    })();

    const handleAutoRefresh = () => {
      loadData();
    };

    window.addEventListener('klima-products-updated', handleAutoRefresh);
    window.addEventListener('klima-invoices-updated', handleAutoRefresh);
    return () => {
      window.removeEventListener('klima-products-updated', handleAutoRefresh);
      window.removeEventListener('klima-invoices-updated', handleAutoRefresh);
    };
  }, []);

  // Al volver a la pestaña y cada rato: stock y precios cambiados en otro equipo salen solos.
  useRevisarAlVolver(['products', 'invoices']);

  const reloadProducts = async () => {
    setRefreshing(true);
    await loadData();
    setTimeout(() => setRefreshing(false), 400);
  };
  const reloadCategories = async () => setCategories(await getCompanyCategories());

  // Filtered Products
  // Lo borrado que aún se puede deshacer ya no sale en ninguna parte.
  const productosVivos = useMemo(() => products.filter(p => !ocultos.has(p.id)), [products, ocultos]);

  const filteredProducts = useMemo(() => {
    let result = [...productosVivos];
    if (search) {
      // Sin tildes y con varias palabras; también el código de barras (escáner) y la familia.
      result = result.filter(p => casaTexto(search, p.name, p.ref, p.supplierRef, p.barcode, p.description, p.category, p.notes));
    }
    if (categoryFilter) result = result.filter(p => p.category === categoryFilter);

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'ref':
          cmp = a.ref.localeCompare(b.ref);
          break;
        case 'supplierRef':
          cmp = (a.supplierRef || '').localeCompare(b.supplierRef || '');
          break;
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
          break;
        case 'category':
          cmp = (a.category || '').localeCompare(b.category || '', 'es', { sensitivity: 'base' });
          break;
        case 'unitPrice':
          cmp = a.unitPrice - b.unitPrice;
          break;
        case 'costePmp':
          cmp = (a.costePmp ?? 0) - (b.costePmp ?? 0);
          break;
        case 'stockQuantity':
          cmp = (a.stockQuantity ?? 0) - (b.stockQuantity ?? 0);
          break;
        case 'defaultTaxRate':
          cmp = Number(a.defaultTaxRate) - Number(b.defaultTaxRate);
          break;
        case 'active':
          cmp = (a.active ? 1 : 0) - (b.active ? 1 : 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [productosVivos, search, categoryFilter, sortField, sortDir]);

  // Por páginas: un catálogo de cientos de artículos no se pinta de una vez.
  const paginado = usePaginacion(filteredProducts, {
    clave: 'articulos',
    reinicio: [search, categoryFilter, sortField, sortDir].join('|'),
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIcon = (field: typeof sortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="sort-icon" />
      : <ChevronDown size={13} className="sort-icon" />;
  };

  // Product CRUD
  const openCreateProduct = () => {
    setEditing(null);
    setTocados(new Set());
    const defaultCat = categories.length > 0 ? categories[0].value : 'otros';
    setForm({
      ref: `PRD-${String(products.length + 1).padStart(3, '0')}`,
      supplierRef: '',
      name: '', description: '', category: defaultCat,
      unitPrice: 0, defaultTaxRate: getDefaultTaxRate(settings), unit: UnitOfMeasure.UNIDAD, active: true,
      stockQuantity: 50, lowStockThreshold: 5, imageUrl: '', unitsPerPackage: '',
      tarifaPrices: {},
      costePmp: 0,
      costeUltimaCompra: 0,
      purchasePrice: 0,
      purchaseTaxRate: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditProduct = (p: Product) => {
    setEditing(p);
    // Se recuerda para el buscador y el menú lateral (lib/memoriaFichas).
    const memoria = recordarFicha(cuenta, {
      clave: `producto:${p.id}`, tipo: 'producto', titulo: p.ref ? `[${p.ref}] ${p.name}` : p.name,
      detalle: getCategoryInfo(p.category).label, href: `/productos?editar=${p.id}`,
    });
    setFijadoEditando(estaFijada(memoria, `producto:${p.id}`));
    setForm({
      ref: p.ref,
      supplierRef: p.supplierRef || '',
      name: p.name,
      description: p.description,
      category: p.category,
      unitPrice: p.unitPrice,
      defaultTaxRate: p.defaultTaxRate,
      unit: p.unit,
      active: p.active,
      stockQuantity: p.stockQuantity ?? 50,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      imageUrl: p.imageUrl || '',
      unitsPerPackage: p.unitsPerPackage ? String(p.unitsPerPackage) : '',
      tarifaPrices: p.tarifaPrices || {},
      costePmp: p.costePmp ?? 0,
      costeUltimaCompra: p.costeUltimaCompra ?? 0,
      purchasePrice: p.purchasePrice ?? 0,
      purchaseTaxRate: p.purchaseTaxRate ?? '',
      notes: p.notes || '',
    });
    setShowModal(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name || !form.ref) return;
    const product: Product = {
      id: editing?.id || generateId(),
      ...form,
      costePmp: Number(form.costePmp || 0),
      costeUltimaCompra: Number(form.costeUltimaCompra || 0),
      purchasePrice: Number(form.purchasePrice || 0),
      purchaseTaxRate: form.purchaseTaxRate === '' ? undefined : Number(form.purchaseTaxRate),
      notes: form.notes.trim() || undefined,
      supplierRef: form.supplierRef.trim() || undefined,
      imageUrl: form.imageUrl || undefined,
      unitsPerPackage: Number(form.unitsPerPackage) > 0 ? Number(form.unitsPerPackage) : undefined,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (editing) {
        // El stock lo mueven los documentos mientras la ficha está abierta:
        // guardarla no lo pisa. Si se ha cambiado a mano, se apunta solo la
        // diferencia con lo que había al abrirla.
        await persistProduct(product, { conservarStock: true });
        const diferencia = Number(form.stockQuantity || 0) - (editing.stockQuantity ?? 0);
        if (diferencia !== 0) await adjustStock(editing.id, diferencia);
      } else {
        await persistProduct(product);
      }
      await reloadProducts();
      setShowModal(false);
      success(editing ? 'Producto actualizado' : 'Producto creado', form.name);
    } catch (err) {
      toastError('No se pudo guardar el producto', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  // Borrar no pregunta: el artículo sale de la lista al momento y el aviso
  // ofrece deshacer unos segundos. El borrado de verdad espera a que pasen
  // (lib/borradoDiferido), así que deshacer no tiene nada que reconstruir.
  const handleDeleteProduct = (p: Product) => {
    const quitarDe = (set: Set<string>) => { const s = new Set(set); s.delete(p.id); return s; };
    const volverAPintar = () => setOcultos(quitarDe);
    setOcultos(prev => new Set(prev).add(p.id));
    setSeleccion(quitarDe);
    const borrado = programarBorrado(`producto:${p.id}`, async () => {
      await removeProduct(p.id);
      olvidarFicha(cuenta, `producto:${p.id}`);
    }, {
      alTerminar: () => { void loadData().then(volverAPintar); },
      alFallar: e => {
        volverAPintar();
        toastError('No se ha podido eliminar', `${p.name}: ${e instanceof Error ? e.message : 'error desconocido'}`);
      },
    });
    addToast({
      type: 'info',
      title: 'Producto eliminado',
      message: p.name,
      duration: ESPERA_DESHACER_MS,
      accion: { etiqueta: 'Deshacer', alPulsar: () => { if (borrado.deshacer()) volverAPintar(); } },
    });
  };

  // ---- Subir precios en bloque (lib/subidaPrecios) ----
  // A lo seleccionado; sin selección, a lo que se ve en la lista (la
  // categoría elegida, o lo que sale con la búsqueda).
  const objetivoSubida = seleccion.size > 0 ? filteredProducts.filter(p => seleccion.has(p.id)) : filteredProducts;
  const queSonSubida = () => {
    const n = objetivoSubida.length;
    const art = n === 1 ? 'artículo' : 'artículos';
    if (seleccion.size > 0) return `${n === 1 ? 'el' : `los ${n}`} ${art} ${n === 1 ? 'seleccionado' : 'seleccionados'}`;
    if (search) return `los ${n} ${art} que salen con «${search}»`;
    if (categoryFilter) return `los ${n} ${art} de ${getCategoryInfo(categoryFilter).label}`;
    return `todo el catálogo (${n} ${art})`;
  };

  const deshacerSubida = async (antes: Pick<Product, 'id' | 'unitPrice' | 'tarifaPrices'>[]) => {
    try {
      const actuales = await getProducts();
      for (const a of antes) {
        const p = actuales.find(x => x.id === a.id);
        if (p) await persistProduct(conPreciosDeAntes(p, a), { conservarStock: true });
      }
      success('Precios como estaban', `${antes.length} ${antes.length === 1 ? 'artículo' : 'artículos'}`);
    } catch (e) {
      toastError('No se han podido devolver todos', e instanceof Error ? e.message : '');
    } finally {
      await loadData();
    }
  };

  const aplicarSubida = async (subida: Subida) => {
    const antes: Pick<Product, 'id' | 'unitPrice' | 'tarifaPrices'>[] = [];
    try {
      // Uno a uno por la vía de siempre: sin conexión, cada uno va a la cola.
      for (const p of objetivoSubida) {
        const nuevo = conPrecioSubido(p, subida);
        if (nuevo.unitPrice === p.unitPrice && JSON.stringify(nuevo.tarifaPrices) === JSON.stringify(p.tarifaPrices)) continue;
        await persistProduct(nuevo, { conservarStock: true });
        antes.push({ id: p.id, unitPrice: p.unitPrice, tarifaPrices: p.tarifaPrices });
      }
    } catch (e) {
      toastError('La subida se ha quedado a medias', `${antes.length} guardados. ${e instanceof Error ? e.message : ''}`);
      await loadData();
      return;
    }
    await loadData();
    setVerSubida(false);
    setSeleccion(new Set());
    const valor = `${subida.valor > 0 ? '+' : ''}${String(subida.valor).replace('.', ',')}${subida.modo === 'porcentaje' ? ' %' : ' €'}`;
    addToast({
      type: 'success',
      title: `${antes.length} ${antes.length === 1 ? 'precio actualizado' : 'precios actualizados'}`,
      message: `${valor}. Las facturas nuevas ya los usan.`,
      duration: 10000,
      accion: { etiqueta: 'Deshacer', alPulsar: () => { void deshacerSubida(antes); } },
    });
  };

  const alternarSeleccion = (id: string) => setSeleccion(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const todosSeleccionados = filteredProducts.length > 0 && filteredProducts.every(p => seleccion.has(p.id));
  const alternarTodos = () => setSeleccion(todosSeleccionados ? new Set() : new Set(filteredProducts.map(p => p.id)));

  // Category CRUD
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('Package');
    setShowCatModal(true);
  };

  const openEditCategory = (cat: CategoryOption) => {
    setEditingCategory(cat);
    setCatName(cat.label);
    setCatIcon(cat.icon);
    setShowCatModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      if (editingCategory) {
        await updateCustomCategory(editingCategory.value, catName.trim(), catIcon);
        success('Categoría actualizada', catName.trim());
      } else {
        const added = await addCustomCategory(catName.trim(), catIcon);
        success('Categoría creada', added.label);
      }
      await reloadCategories();
      setShowCatModal(false);
    } catch (err) {
      toastError('Error', 'No se pudo guardar la categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: CategoryOption) => {
    if (cat.value === 'otros') {
      warning('No se puede eliminar', '"Otros" es la categoría de respaldo del sistema.');
      return;
    }

    const linkedProducts = products.filter(p => p.category === cat.value);
    const confirmMsg = linkedProducts.length > 0
      ? `¿Eliminar la categoría "${cat.label}"? Hay ${linkedProducts.length} producto(s) asignado(s) a esta categoría. Se moverán a "otros".`
      : `¿Eliminar la categoría "${cat.label}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await deleteCustomCategory(cat.value);
      for (const p of linkedProducts) {
        await persistProduct({ ...p, category: 'otros' }, { conservarStock: true });
      }
      await reloadCategories();
      await reloadProducts();
      warning('Categoría eliminada', cat.label);
    } catch (err) {
      toastError('Error', 'No se pudo eliminar la categoría');
    }
  };

  // «otros» no se puede borrar: es donde caen los productos de las demás.
  const catsBorrables = categories.filter(c => c.value !== 'otros');
  const seleccionadas = catsBorrables.filter(c => catSeleccion.has(c.value));
  const productosAfectados = products.filter(p => catSeleccion.has(p.category));

  const alternarCategoria = (valor: string) => {
    setCatSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(valor)) next.delete(valor); else next.add(valor);
      return next;
    });
  };
  const alternarTodas = () => {
    setCatSeleccion(prev => (prev.size === catsBorrables.length ? new Set() : new Set(catsBorrables.map(c => c.value))));
  };

  const borrarSeleccionadas = async () => {
    if (seleccionadas.length === 0) return;
    setBorrandoCats(true);
    try {
      await deleteCategories(seleccionadas.map(c => c.value));
      for (const p of productosAfectados) {
        await persistProduct({ ...p, category: 'otros' }, { conservarStock: true });
      }
      if (categoryFilter && catSeleccion.has(categoryFilter)) setCategoryFilter('');
      await reloadCategories();
      await reloadProducts();
      warning(
        seleccionadas.length === 1 ? 'Categoría borrada' : `${seleccionadas.length} categorías borradas`,
        productosAfectados.length > 0 ? `${productosAfectados.length} producto(s) pasan a «Otros».` : seleccionadas.map(c => c.label).join(', '),
      );
      setCatSeleccion(new Set());
      setConfirmarBorrado(false);
    } catch {
      toastError('Error', 'No se pudieron borrar las categorías');
    } finally {
      setBorrandoCats(false);
    }
  };

  // Cuántos artículos tiene cada categoría, de una pasada: los chips lo
  // necesitan para cada familia y antes se recorría el catálogo entero por chip.
  const productosPorCategoria = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const p of products) cuenta.set(p.category, (cuenta.get(p.category) ?? 0) + 1);
    return cuenta;
  }, [products]);

  const getCategoryInfo = (catValue: string) => {
    return categories.find(c => c.value === catValue) || { label: catValue, icon: 'Package' };
  };

  // Lo que la ficha nueva propone a partir del nombre y de los parecidos.
  // Sólo al dar de alta: una ficha que ya existe se edita, no se adivina.
  const sugerencias = useMemo(() => {
    if (!showModal || editing) return [];
    return sugerenciasFicha({
      name: form.name,
      category: form.category,
      defaultTaxRate: Number(form.defaultTaxRate),
      unitPrice: Number(form.unitPrice) || 0,
      unitsPerPackage: form.unitsPerPackage,
      coste: Number(form.purchasePrice) || Number(form.costePmp) || 0,
    }, products, {
      tocados,
      nombreCategoria: id => categories.find(c => c.value === id)?.label ?? id,
    });
  }, [showModal, editing, form.name, form.category, form.defaultTaxRate, form.unitPrice, form.unitsPerPackage, form.purchasePrice, form.costePmp, products, tocados, categories]);

  const aceptarSugerencias = (lista: SugerenciaFicha[]) => {
    setForm(prev => {
      const sig = { ...prev };
      for (const s of lista) {
        if (s.campo === 'unitsPerPackage') sig.unitsPerPackage = String(s.valor);
        else if (s.campo === 'category') sig.category = String(s.valor);
        else if (s.campo === 'defaultTaxRate') sig.defaultTaxRate = Number(s.valor) as TaxRate;
        else sig.unitPrice = Number(s.valor);
      }
      return sig;
    });
    // Aceptada es como escrita: ya no se vuelve a proponer encima.
    setTocados(prev => { const n = new Set(prev); for (const s of lista) n.add(s.campo); return n; });
  };

  // Datos de la analítica, con su vista en tabla
  const { accent } = useColoresGrafica();

  // Con un catálogo de distribuidor (cincuenta familias, mil quinientos
  // artículos) una barra por familia son rayas de 3 px con los nombres
  // pisados, y un donut de 58 porciones es un arcoíris. Se dibujan las diez
  // que más pesan y el resto se dice en una línea, con su importe: sumado en
  // una barra «Resto» sería más larga que la mayor y aplastaría a las demás.
  // La vista en tabla sigue teniendo todas.
  const porFamilia = useMemo(() => categories.map(cat => {
    const delGrupo = products.filter(p => p.category === cat.value);
    return {
      name: cat.label,
      count: delGrupo.length,
      total: Number(delGrupo.reduce((sum, p) => sum + valorStock(p), 0).toFixed(2)),
    };
  }), [products, categories]);

  const stockPorFamilia = useMemo(
    () => porFamilia.filter(c => c.total > 0).sort((a, b) => b.total - a.total),
    [porFamilia],
  );
  const productosPorFamilia = useMemo(
    () => porFamilia.filter(c => c.count > 0).sort((a, b) => b.count - a.count),
    [porFamilia],
  );

  // «+» de Artículos en el menú de Mantenimientos.
  useNuevoDeLaDireccion(mounted && !!settings, () => openCreateProduct());
  // Un artículo elegido en el buscador universal (Ctrl+K) se abre en su ficha.
  useNuevoDeLaDireccion(mounted && products.length > 0, id => {
    const p = products.find(x => x.id === id);
    if (p) openEditProduct(p);
  }, 'editar');

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando productos y categorías" />;
  }

  const totalInventoryValue = products.reduce((sum, p) => sum + valorStock(p), 0);

  return (
    <div className="animate-fade-in pantalla-lista">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Productos y categorías</h1>
          {products.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(products.length)} /></span>
                <span className="page-meta-label">referencias</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value is-success"><CifraQueCuenta texto={String(categories.length)} /></span>
                <span className="page-meta-label">categorías</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(formatCurrency(totalInventoryValue))} /></span>
                <span className="page-meta-label">valor stock</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-ghost btn-icon"
            onClick={reloadProducts}
            disabled={refreshing}
            title="Refrescar catálogo en tiempo real"
            aria-label="Refrescar catálogo"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {activeTab === 'products' && products.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setVerSubida(true)}
              disabled={objetivoSubida.length === 0}
              title={seleccion.size > 0 ? 'Subir el precio de los seleccionados' : 'Subir el precio de lo que ves en la lista (elige una categoría o selecciona)'}
            >
              <TrendingUp size={16} /> Subir precios{seleccion.size > 0 ? ` (${seleccion.size})` : ''}
            </button>
          )}
          <button className="btn btn-secondary" onClick={openCreateCategory}>
            <Tag size={16} /> Nueva categoría
          </button>
          <Link href="/importar" className="btn btn-secondary" title="Traer productos desde otro programa (Excel o CSV)">
            <Upload size={16} /> Importar
          </Link>
          <span className="neon accion-neon">
            <button className="btn btn-primary" onClick={openCreateProduct}>
              <Plus size={16} /> Nuevo producto
            </button>
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="segmentos" role="group" aria-label="Qué ver" style={{ marginBottom: 'var(--space-5)' }}>
        <button
          className="btn btn-sm"
          aria-pressed={activeTab === 'products'}
          onClick={() => setActiveTab('products')}
        >
          <Package size={16} /> Catálogo de productos <span className="segmentos-num">{products.length}</span>
        </button>
        <button
          className="btn btn-sm"
          aria-pressed={activeTab === 'categories'}
          onClick={() => setActiveTab('categories')}
        >
          <Layers size={16} /> Gestión de categorías <span className="segmentos-num">{categories.length}</span>
        </button>
      </div>

      {/* TAB 1: PRODUCTOS */}
      {activeTab === 'products' && (
        <>
          {/* Filters Bar */}
          <div className="filters-bar">
            <div className="search-bar" style={{ maxWidth: 320 }}>
              <div className="search-bar-icon"><Search size={16} /></div>
              <input
                type="text"
                placeholder="Buscar por nombre, ref o descripción..."
                aria-label="Buscar productos"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Borrar la búsqueda" title="Borrar">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="cluster-sm" style={{ flexWrap: 'wrap' }}>
              <button
                className={`filter-chip ${!categoryFilter ? 'active' : ''}`}
                onClick={() => setCategoryFilter('')}
              >
                Todas las categorías
              </button>
              {/* Las categorías sin artículos no filtran nada: con las que trae el
                  sector salían decenas de «(0)» y había que buscar las buenas.
                  La elegida se queda aunque se haya vaciado, para poder quitarla. */}
              {categories.map(cat => {
                const count = productosPorCategoria.get(cat.value) ?? 0;
                if (count === 0 && categoryFilter !== cat.value) return null;
                return (
                  <button
                    key={cat.value}
                    className={`filter-chip ${categoryFilter === cat.value ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(categoryFilter === cat.value ? '' : cat.value)}
                  >
                    <CategoryIcon name={cat.icon} size={14} /> {cat.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Productos con un tipo de impuesto que no es del régimen de la
              empresa (un 21 % de IVA con IGIC): las facturas los heredan. */}
          {settings && productosConTipoRaro.length > 0 && (
            <div className="productos-aviso-impuesto" role="alert">
              <AlertTriangle size={16} />
              <span>
                <strong>{productosConTipoRaro.length} {productosConTipoRaro.length === 1 ? 'producto tiene' : 'productos tienen'} un tipo de {settings.igicEnabled ? 'IGIC' : 'IVA'} que no existe</strong>
                {' '}({[...new Set(productosConTipoRaro.map(p => `${p.defaultTaxRate} %`))].join(', ')}). {tipoImpositivoRaro(productosConTipoRaro[0].defaultTaxRate, settings)}
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void corregirTipos()} disabled={corrigiendoTipos}>
                {corrigiendoTipos ? <Loader2 size={14} className="spin" /> : null} Pasarlos al {tipoGeneral(settings)} %
              </button>
            </div>
          )}

          {/* Lo que se va a acabar a su ritmo de venta y lo que lleva meses
              parado (lib/reposicion). Sin nada que decir, no ocupa sitio. */}
          <AvisoReposicion productos={productosVivos} documentos={invoices} pendientes={pendientes} onAbrir={openEditProduct} />

          {seleccion.size > 0 && (
            <div className="cat-seleccion-barra productos-seleccion" role="region" aria-label="Artículos seleccionados">
              <strong>{seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}</strong>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setVerSubida(true)}>
                <TrendingUp size={14} /> Subir precios
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set())}>
                Quitar selección
              </button>
            </div>
          )}

          {/* Table */}
          <div className="table-container">
            <table className="table table--sortable tabla-tarjetas">
              <thead>
                <tr>
                  <th className="table-checkbox">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los artículos de la lista"
                      checked={todosSeleccionados}
                      ref={el => { if (el) el.indeterminate = seleccion.size > 0 && !todosSeleccionados; }}
                      onChange={alternarTodos}
                    />
                  </th>
                  <th className={sortField === 'ref' ? 'sorted' : ''} onClick={() => handleSort('ref')} style={{ cursor: 'pointer' }}>
                    Ref. {sortIcon('ref')}
                  </th>
                  <th className={sortField === 'supplierRef' ? 'sorted' : ''} onClick={() => handleSort('supplierRef')} style={{ cursor: 'pointer' }}>
                    Ref. proveedor {sortIcon('supplierRef')}
                  </th>
                  <th className={sortField === 'name' ? 'sorted' : ''} onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                    Producto {sortIcon('name')}
                  </th>
                  <th className={sortField === 'category' ? 'sorted' : ''} onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>
                    Categoría {sortIcon('category')}
                  </th>
                  <th className={sortField === 'unitPrice' ? 'sorted' : ''} onClick={() => handleSort('unitPrice')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                    Precio ud. {sortIcon('unitPrice')}
                  </th>
                  <th className={sortField === 'costePmp' ? 'sorted' : ''} onClick={() => handleSort('costePmp')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                    PMP (coste) {sortIcon('costePmp')}
                  </th>
                  <th className={sortField === 'stockQuantity' ? 'sorted' : ''} onClick={() => handleSort('stockQuantity')} style={{ cursor: 'pointer' }}>
                    Stock actual {sortIcon('stockQuantity')}
                  </th>
                  <th>Pdte. recibir</th>
                  <th>Pdte. entregar</th>
                  <th className={sortField === 'defaultTaxRate' ? 'sorted' : ''} onClick={() => handleSort('defaultTaxRate')} style={{ cursor: 'pointer' }}>
                    IVA/IGIC {sortIcon('defaultTaxRate')}
                  </th>
                  <th className={sortField === 'active' ? 'sorted' : ''} onClick={() => handleSort('active')} style={{ cursor: 'pointer' }}>
                    Estado {sortIcon('active')}
                  </th>
                  <th style={{ width: 100 }}><span className="solo-lectores">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {paginado.visibles.map(p => {
                  const cat = getCategoryInfo(p.category);
                  const isLowStock = p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
                  const isOutOfStock = (p.stockQuantity ?? 0) <= 0;
                  const { pendienteRecibir, pendienteEntregar } = pendientes.get(p.id) ?? SIN_PENDIENTES;
                  const disponible = (p.stockQuantity ?? 0) + pendienteRecibir - pendienteEntregar;

                  return (
                    <tr key={p.id} data-seleccionada={seleccion.has(p.id) || undefined}>
                      <td className="table-checkbox" data-m="check">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${p.name}`}
                          checked={seleccion.has(p.id)}
                          onChange={() => alternarSeleccion(p.id)}
                        />
                      </td>
                      <td className="mono" data-m="dato" data-label="Ref.">{p.ref}</td>
                      <td data-m={p.supplierRef ? 'dato' : 'oculto'} data-label="Ref. prov.">
                        {p.supplierRef ? (
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {p.supplierRef}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                        )}
                      </td>
                      <td data-m="titulo" style={{ minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <ImageOff size={15} style={{ color: 'var(--text-tertiary)' }} />
                            </span>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td data-m="dato">
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CategoryIcon name={cat.icon} size={13} />
                          {cat.label}
                        </span>
                      </td>
                      <td className="amount" data-m="importe">
                        {formatCurrency(p.unitPrice)}
                      </td>
                      <td className="amount" style={{ fontWeight: 500, color: p.costePmp ? 'var(--text-secondary)' : 'var(--text-muted)' }} data-m={p.costePmp ? 'dato' : 'oculto'} data-label="Coste">
                        {p.costePmp ? formatCurrency(p.costePmp) : '—'}
                      </td>
                      <td data-m="estado">
                        <span className={`badge ${isOutOfStock ? 'badge-danger' : isLowStock ? 'badge-warning' : 'badge-success'}`}>
                          {p.stockQuantity ?? 0} {p.unit}
                        </span>
                        {(pendienteRecibir > 0 || pendienteEntregar > 0) && (
                          <span
                            className="producto-disponible mono"
                            data-negativo={disponible < 0 || undefined}
                            title="Stock + pendiente de recibir − pendiente de entregar"
                          >
                            Disp. {disponible} {p.unit}
                          </span>
                        )}
                      </td>
                      <td data-m={pendienteRecibir > 0 ? 'dato' : 'oculto'} data-label="Por recibir">
                        {pendienteRecibir > 0 ? (
                          <span className="badge badge-warning" title="Unidades solicitadas en pedidos de compra pendientes">
                            +{pendienteRecibir} {p.unit}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0</span>
                        )}
                      </td>
                      <td data-m={pendienteEntregar > 0 ? 'dato' : 'oculto'} data-label="Por entregar">
                        {pendienteEntregar > 0 ? (
                          <span className="badge badge-info" title="Unidades comprometidas en pedidos de venta pendientes">
                            -{pendienteEntregar} {p.unit}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0</span>
                        )}
                      </td>
                      <td data-m="oculto">{p.defaultTaxRate}%</td>
                      <td data-m={p.active ? 'oculto' : 'estado'}>
                        <span className={`badge ${p.active ? 'badge-success' : 'badge-neutral'}`}>
                          {p.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td data-m="acciones">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => openEditProduct(p)} aria-label={`Editar ${p.name}`} title="Editar">
                            <Edit size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDeleteProduct(p)} aria-label={`Eliminar ${p.name}`} title="Eliminar">
                            <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <TableEmpty
                    colSpan={13}
                    icon={SearchX}
                    title="No hay productos que coincidan"
                    hint="Prueba a cambiar el texto de búsqueda o el filtro de categoría."
                  />
                )}
              </tbody>
            </table>
            <Paginacion paginado={paginado} etiqueta="artículos" />
          </div>

          {/* Las gráficas, debajo de la lista: lo que se viene a hacer aquí es
              buscar un artículo, y antes había que bajar dos tarjetas para
              llegar a la tabla. */}
          {products.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 'var(--space-5)', marginTop: 'var(--space-6)' }}>
              <ChartCard
                title="Valor del stock por categoría"
                subtitle={stockPorFamilia.length > RANKING_MAX
                  ? `Las ${RANKING_MAX} categorías con más dinero en almacén, a precio de coste`
                  : 'Dinero en almacén de cada categoría, a precio de coste'}
                height={300}
                isEmpty={stockPorFamilia.length === 0}
                emptyLabel="Ningún producto tiene existencias"
                tableColumns={[
                  { key: 'name', label: 'Categoría' },
                  { key: 'count', label: 'Productos', align: 'right' },
                  { key: 'total', label: 'Valor del stock', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
                ]}
                tableRows={stockPorFamilia}
                legend={
                  <RestoDelRanking
                    filas={stockPorFamilia.slice(RANKING_MAX)}
                    total={stockPorFamilia.reduce((n, c) => n + c.total, 0)}
                    valor={c => c.total}
                    formato={formatCurrency}
                  />
                }
              >
                <RankedBars data={stockPorFamilia.slice(0, RANKING_MAX)} color={accent} ariaLabel="Valor del stock por categoría" />
              </ChartCard>

              <ChartCard
                title="Productos por categoría"
                subtitle={productosPorFamilia.length > RANKING_MAX
                  ? `Las ${RANKING_MAX} categorías con más referencias`
                  : 'Referencias de cada categoría'}
                height={300}
                isEmpty={productosPorFamilia.length === 0}
                emptyLabel="Sin datos"
                tableColumns={[
                  { key: 'name', label: 'Categoría' },
                  { key: 'count', label: 'Productos', align: 'right' },
                ]}
                tableRows={productosPorFamilia}
                legend={
                  <RestoDelRanking
                    filas={productosPorFamilia.slice(RANKING_MAX)}
                    total={products.length}
                    valor={c => c.count}
                    formato={n => `${n.toLocaleString('es-ES')} productos`}
                  />
                }
              >
                <RankedBars
                  data={productosPorFamilia.slice(0, RANKING_MAX).map(c => ({ name: c.name, total: c.count }))}
                  color={SERIES[0]}
                  formato="numero"
                  ariaLabel="Productos por categoría"
                />
              </ChartCard>
            </div>
          )}
        </>
      )}

      {/* TAB 2: CATEGORÍAS */}
      {activeTab === 'categories' && (
        <div>
          {catsBorrables.length > 0 && (
            <div className="cat-seleccion-barra">
              <label className="cat-seleccion-todas">
                <input
                  type="checkbox"
                  checked={catSeleccion.size > 0 && catSeleccion.size === catsBorrables.length}
                  ref={el => { if (el) el.indeterminate = catSeleccion.size > 0 && catSeleccion.size < catsBorrables.length; }}
                  onChange={alternarTodas}
                />
                {catSeleccion.size > 0 ? `${seleccionadas.length} seleccionada${seleccionadas.length === 1 ? '' : 's'}` : 'Seleccionar todas'}
              </label>
              {catSeleccion.size > 0 && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCatSeleccion(new Set())}>
                    Quitar selección
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmarBorrado(true)}>
                    <Trash2 size={14} /> Borrar {seleccionadas.length === 1 ? 'categoría' : `${seleccionadas.length} categorías`}
                  </button>
                </>
              )}
            </div>
          )}
          <div className="kpi-grid" style={{ marginBottom: 'var(--space-6)' }}>
            {categories.map(cat => {
              const catProds = products.filter(p => p.category === cat.value);
              const val = catProds.reduce((sum, p) => sum + (p.unitPrice * (p.stockQuantity ?? 1)), 0);
              const marcada = catSeleccion.has(cat.value);

              return (
                <div key={cat.value} className={`kpi-card cat-tarjeta ${marcada ? 'is-marcada' : ''}`} style={{ padding: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                      {cat.value !== 'otros' ? (
                        <input
                          type="checkbox"
                          className="cat-casilla"
                          checked={marcada}
                          onChange={() => alternarCategoria(cat.value)}
                          aria-label={`Seleccionar ${cat.label}`}
                        />
                      ) : (
                        <span className="cat-casilla-hueco" title="«Otros» no se puede borrar: ahí van los productos de las categorías borradas." />
                      )}
                      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CategoryIcon name={cat.icon} size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.label}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cat.value}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => openEditCategory(cat)} aria-label={`Editar la categoría ${cat.label}`} title="Editar">
                        <Edit size={14} />
                      </button>
                      {cat.value !== 'otros' && (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDeleteCategory(cat)} aria-label={`Eliminar la categoría ${cat.label}`} title="Eliminar">
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{catProds.length} productos</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatCurrency(val)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Producto */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar producto' : 'Nuevo producto'}</h3>
              {editing && (
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm producto-fijar${fijadoEditando ? ' is-fijada' : ''}`}
                  aria-pressed={fijadoEditando}
                  onClick={() => {
                    const m = alternarFijada(cuenta, {
                      clave: `producto:${editing.id}`, tipo: 'producto', titulo: editing.ref ? `[${editing.ref}] ${editing.name}` : editing.name,
                      detalle: getCategoryInfo(editing.category).label, href: `/productos?editar=${editing.id}`,
                    });
                    setFijadoEditando(estaFijada(m, `producto:${editing.id}`));
                  }}
                  title="Fijado sale arriba en el buscador (Ctrl+K) y en el menú"
                >
                  <Star size={14} /> {fijadoEditando ? 'Fijado' : 'Fijar'}
                </button>
              )}
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Referencia / código</label>
                  <input className="form-input mono" value={form.ref} onChange={e => updateForm('ref', e.target.value)} placeholder="PRD-001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia del proveedor</label>
                  <input className="form-input mono" value={form.supplierRef} onChange={e => updateForm('supplierRef', e.target.value)} placeholder="Ej: PROV-REF-99" />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: '2 1 240px' }}>
                  <label className="form-label required">Nombre del producto</label>
                  <input className="form-input" value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Ej: Agua mineral 6x1,5L" />
                </div>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.category} onChange={e => { tocar('category'); updateForm('category', e.target.value); }}>
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Lo que dice el nombre y lo que hacen los parecidos (lib/fichaProducto). */}
              <SugerenciasFicha sugerencias={sugerencias} onAceptar={aceptarSugerencias} />

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Precio de venta (€)</label>
                  <input className="form-input" type="number" step="0.01" value={form.unitPrice} onChange={e => { tocar('unitPrice'); updateForm('unitPrice', e.target.value); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unidad de medida</label>
                  <select className="form-select" value={form.unit} onChange={e => updateForm('unit', e.target.value)}>
                    {UNITS_OF_MEASURE.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                {/* Se pone una vez aquí y cada línea que use el producto la
                    hereda, en vez de teclearla en cada factura. */}
                <div className="form-group">
                  <label className="form-label">Unidades por bulto (U/C)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="—"
                    value={form.unitsPerPackage}
                    onChange={e => { tocar('unitsPerPackage'); updateForm('unitsPerPackage', e.target.value); }}
                  />
                  <p className="form-hint">
                    Cuántas unidades sueltas trae cada caja. Déjalo vacío si lo vendes por unidades.
                  </p>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <TaxRateSlider
                    label={`Impuesto de venta (${getTaxLabel(settings)})`}
                    value={form.defaultTaxRate}
                    onChange={v => { tocar('defaultTaxRate'); setForm(prev => ({ ...prev, defaultTaxRate: v })); }}
                  />
                </div>
              </div>

              {/* Lo de comprar: el precio al que lo vende el proveedor, lo
                  que costó la última entrada y el coste medio. Las compras
                  actualizan los dos últimos solas; se pueden corregir a mano
                  al dar de alta el catálogo. */}
              <fieldset className="producto-compra">
                <legend>Compra y costes</legend>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-precio-compra">Precio de compra (€)</label>
                    <input id="prod-precio-compra" className="form-input" type="number" step="0.0001" min="0" value={form.purchasePrice} onChange={e => updateForm('purchasePrice', e.target.value)} />
                    <p className="form-hint">El que se propone en pedidos, albaranes y facturas de compra.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-precio-entrada">Precio de última entrada (€)</label>
                    <input id="prod-precio-entrada" className="form-input" type="number" step="0.0001" min="0" value={form.costeUltimaCompra} onChange={e => updateForm('costeUltimaCompra', e.target.value)} />
                    <p className="form-hint">Lo que costó en la última compra recibida.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="prod-precio-medio">Precio medio (€)</label>
                    <input id="prod-precio-medio" className="form-input" type="number" step="0.0001" min="0" value={form.costePmp} onChange={e => updateForm('costePmp', e.target.value)} />
                    <p className="form-hint">Coste medio ponderado de todo lo comprado.</p>
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.purchaseTaxRate === ''}
                        onChange={e => setForm(prev => ({ ...prev, purchaseTaxRate: e.target.checked ? '' : prev.defaultTaxRate }))}
                      />
                      Impuesto de compra igual que el de venta
                    </label>
                    {form.purchaseTaxRate !== '' && (
                      <TaxRateSlider
                        label={`Impuesto de compra (${getTaxLabel(settings)})`}
                        value={form.purchaseTaxRate}
                        onChange={v => setForm(prev => ({ ...prev, purchaseTaxRate: v }))}
                      />
                    )}
                  </div>
                  {form.unitPrice > 0 && (Number(form.purchasePrice) || Number(form.costePmp)) > 0 && (() => {
                    const coste = Number(form.purchasePrice) || Number(form.costePmp);
                    const margen = ((form.unitPrice - coste) / form.unitPrice) * 100;
                    return (
                      <div className="form-group">
                        <span className="form-label">Margen sobre la venta</span>
                        <strong className="mono" style={{ color: margen < 0 ? 'var(--color-danger)' : undefined }}>
                          {margen.toFixed(1).replace('.', ',')} %
                        </strong>
                        <p className="form-hint">Con el {Number(form.purchasePrice) ? 'precio de compra' : 'precio medio'}.</p>
                      </div>
                    );
                  })()}
                </div>
                {editing && (() => {
                  const { pendienteRecibir, pendienteEntregar } = pendientes.get(editing.id) ?? SIN_PENDIENTES;
                  const disponible = Number(form.stockQuantity || 0) + pendienteRecibir - pendienteEntregar;
                  return (
                    <div className="producto-pendientes">
                      <div>
                        <span>Pendiente de recibir</span>
                        <strong className="mono">{pendienteRecibir} {editing.unit}</strong>
                        <small>En pedidos de compra sin recibir del todo</small>
                      </div>
                      <div>
                        <span>Pendiente de entregar</span>
                        <strong className="mono">{pendienteEntregar} {editing.unit}</strong>
                        <small>En pedidos de venta sin servir del todo</small>
                      </div>
                      <div data-negativo={disponible < 0 || undefined}>
                        <span>Disponible</span>
                        <strong className="mono">{disponible} {editing.unit}</strong>
                        <small>Stock + por recibir − por entregar</small>
                      </div>
                    </div>
                  );
                })()}
              </fieldset>

              {/* Lo que dicen las facturas de este artículo (lib/consejoProducto). */}
              {productoDelConsejo && (
                <ConsejoProducto
                  producto={productoDelConsejo}
                  documentos={invoices}
                  onUsarPrecio={precio => updateForm('unitPrice', precio)}
                />
              )}

              {/* Matriz de Precios por Tarifa si existen tarifas configuradas */}
              {settings?.tarifas && settings.tarifas.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  <label className="form-label" style={{ marginBottom: 'var(--space-2)', fontWeight: 700 }}>
                    Precios específicos por tarifa (€)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 'var(--space-3)' }}>
                    {settings.tarifas.map(t => (
                      <div key={t.id} className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {t.nombre} {t.porcentajeDefecto !== undefined ? `(${t.porcentajeDefecto > 0 ? `+${t.porcentajeDefecto}%` : `${t.porcentajeDefecto}%`})` : ''}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          placeholder={t.porcentajeDefecto ? `Auto: ${(form.unitPrice * (1 + t.porcentajeDefecto/100)).toFixed(2)}` : 'Precio base'}
                          value={form.tarifaPrices[t.id] ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            if (val === undefined) {
                              const copy = { ...form.tarifaPrices };
                              delete copy[t.id];
                              setForm(prev => ({ ...prev, tarifaPrices: copy }));
                            } else {
                              updateTarifaPrice(t.id, val);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Stock actual</label>
                  <input className="form-input" type="number" value={form.stockQuantity} onChange={e => updateForm('stockQuantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Avisar cuando el stock baje de</label>
                  <input className="form-input" type="number" value={form.lowStockThreshold} onChange={e => updateForm('lowStockThreshold', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Descripción corta (opcional)</label>
                <textarea className="form-textarea" rows={2} value={form.description} onChange={e => updateForm('description', e.target.value)} />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label" htmlFor="prod-observaciones">Observaciones</label>
                <textarea id="prod-observaciones" className="form-textarea" rows={3} value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder="Notas internas: no salen en los documentos" />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Imagen del producto (opcional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {form.imageUrl ? (
                    <>
                      <img
                        src={form.imageUrl}
                        alt="Vista previa"
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateForm('imageUrl', '')}>
                        <ImageOff size={14} /> Quitar imagen
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()}>
                      <ImagePlus size={14} /> Añadir foto
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => {
                      handlePickImage(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
                <span className="form-hint">La imagen se reduce y comprime en el navegador para que apenas ocupe espacio.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveProduct}>Guardar producto</button>
            </div>
          </div>
        </div>
      )}

      {verSubida && (
        <SubidaPrecios
          productos={objetivoSubida}
          queSon={queSonSubida()}
          onCerrar={() => setVerSubida(false)}
          onAplicar={aplicarSubida}
        />
      )}

      {/* Modal Crear / Editar Categoría */}
      {confirmarBorrado && (
        <div className="modal-overlay" onClick={() => !borrandoCats && setConfirmarBorrado(false)}>
          <div className="modal" style={{ maxWidth: 460 }} role="alertdialog" aria-labelledby="titulo-borrar-cats" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id="titulo-borrar-cats">
                Borrar {seleccionadas.length === 1 ? 'la categoría' : `${seleccionadas.length} categorías`}
              </h3>
              <button className="modal-close" onClick={() => setConfirmarBorrado(false)} disabled={borrandoCats} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <ul className="cat-borrar-lista">
                {seleccionadas.map(c => {
                  const n = products.filter(p => p.category === c.value).length;
                  return (
                    <li key={c.value}>
                      <CategoryIcon name={c.icon} size={14} /> {c.label}
                      <span>{n === 0 ? 'sin productos' : `${n} producto${n === 1 ? '' : 's'}`}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="equipo-nota" style={{ marginTop: 'var(--space-3)' }}>
                {productosAfectados.length > 0
                  ? `Los ${productosAfectados.length} productos que tienen pasarán a «Otros». No se borra ningún producto.`
                  : 'Ninguna tiene productos.'}
                {' '}Las categorías que venían con tu sector se pueden recuperar creándolas otra vez.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmarBorrado(false)} disabled={borrandoCats}>Cancelar</button>
              <button className="btn btn-danger" onClick={borrarSeleccionadas} disabled={borrandoCats}>
                <Trash2 size={15} /> {borrandoCats ? 'Borrando…' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingCategory ? 'Editar categoría' : 'Nueva categoría'}</h3>
              <button className="modal-close" onClick={() => setShowCatModal(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Nombre de la categoría</label>
                <input
                  className="form-input"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="Ej. Bebidas, Embutidos, Herramientas"
                />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Icono ilustrativo</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {ICON_PRESETS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      className={`btn btn-sm ${catIcon === iconName ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setCatIcon(iconName)}
                    >
                      <CategoryIcon name={iconName} size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveCategory} disabled={savingCat}>
                {savingCat ? 'Guardando...' : 'Guardar categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Suspense: la pantalla lee de la dirección la pestaña y el «nuevo» que
// pide el menú de Mantenimientos (hooks/useDireccion).
export default function ProductosPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" label="Cargando productos y categorías" />}>
      <ProductosPageContenido />
    </Suspense>
  );
}
