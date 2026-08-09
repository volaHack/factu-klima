'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Unlock, List, X, Store, Settings as SettingsIcon, Keyboard, PlusCircle, Receipt, ScanBarcode, TrendingUp, Armchair } from 'lucide-react';
import TpvProductGrid from '@/components/tpv/TpvProductGrid';
import TpvCart from '@/components/tpv/TpvCart';
import TpvCheckout from '@/components/tpv/TpvCheckout';
import TpvCashSession from '@/components/tpv/TpvCashSession';
import TpvTicket from '@/components/tpv/TpvTicket';
import TpvCustomItemModal from '@/components/tpv/TpvCustomItemModal';
import TpvKeyboardHelpModal from '@/components/tpv/TpvKeyboardHelpModal';
import TpvQuickCreateProductModal from '@/components/tpv/TpvQuickCreateProductModal';
import TpvTodaySalesModal from '@/components/tpv/TpvTodaySalesModal';
import TpvInsightsModal from '@/components/tpv/TpvInsightsModal';
import TpvWeightModal from '@/components/tpv/TpvWeightModal';
import TpvTables from '@/components/tpv/TpvTables';
import {
  getProducts, getCompanySettings, saveCompanySettings, getCompanyCategories,
  getActivePosSession, openPosSession, closePosSession, ensureWalkInClient,
  issueInvoice, adjustStock, saveProduct, getOnboardingStatus, getInvoices,
} from '@/lib/storage';
import {
  getOpenChecks, createOpenCheck, saveOpenCheck, deleteOpenCheck, addLineToCheck, OpenCheck,
} from '@/lib/openChecks';
import { generateId, generateInvoiceNumber, getToday, calculateInvoiceTotals } from '@/lib/utils';
import { isTpvEnabled, defaultTpvModeForSector } from '@/lib/constants';
import { nextOfflineNumber } from '@/lib/tpvOffline';
import { getDeviceSuffix } from '@/lib/offlineDb';
import { posAudio } from '@/lib/posAudio';
import {
  Product, CompanySettings, PosSession, PosCartLine, PosHeldSale,
  Invoice, InvoiceLineItem, InvoiceStatus, PaymentMethod, UnitOfMeasure
} from '@/lib/types';
import { useToast } from '@/hooks/useToast';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import ToastContainer from '@/components/ui/ToastContainer';
import { evaluatePlanLimit } from '@/lib/planLimits';
import SubscriptionPaywallModal from '@/components/ui/SubscriptionPaywallModal';

const HELD_SALES_KEY = 'tpv-held-sales';

function loadHeldSales(): PosHeldSale[] {
  try {
    const raw = localStorage.getItem(HELD_SALES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHeldSales(sales: PosHeldSale[]) {
  localStorage.setItem(HELD_SALES_KEY, JSON.stringify(sales));
}

export default function TpvPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [session, setSession] = useState<PosSession | undefined>(undefined);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [heldSales, setHeldSales] = useState<PosHeldSale[]>([]);
  const [heldListOpen, setHeldListOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateBarcode, setQuickCreateBarcode] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [todaySalesOpen, setTodaySalesOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const [cashModalMode, setCashModalMode] = useState<'open' | 'close' | null>(null);
  const [lastSale, setLastSale] = useState<{ invoice: Invoice; cashGiven?: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // --- Mesas (modo restaurante) ---
  const [tpvView, setTpvView] = useState<'products' | 'tables'>('products');
  const [checks, setChecks] = useState<OpenCheck[]>([]);
  // Mesa activa cuya cuenta se está editando (panel lateral derecho)
  const [activeCheck, setActiveCheck] = useState<OpenCheck | null>(null);
  // Cuenta que se está cobrando (abre TpvCheckout con sus líneas)
  const [checkoutCheck, setCheckoutCheck] = useState<OpenCheck | null>(null);
  const { toasts, removeToast, success, error: toastError } = useToast();
  const [paywallState, setPaywallState] = useState<{ title: string; description: string; requiredPlan: 'basico' | 'pro' | 'sin_limite' } | null>(null);

  // Modo kiosk del instalador TPV (electron expone window.klimaDesktop.mode).
  // En él el cajero no puede salir del terminal: se oculta "Salir del TPV"
  // y el enlace a Ajustes. Se lee tras el montaje para no diferir del SSR.
  const [isTpvKiosk, setIsTpvKiosk] = useState(false);
  useEffect(() => {
    const desktop = (window as { klimaDesktop?: { mode?: string } }).klimaDesktop;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTpvKiosk(desktop?.mode === 'tpv');
  }, []);

  // El TPV no se abandona con el historial del navegador: ni el botón
  // "atrás", ni Alt+←, ni el gesto de retroceso en pantallas táctiles.
  // Por defecto, en cualquier dispositivo. Al entrar se añade un ancla al
  // historial y cada intento de volver empuja de nuevo el TPV al frente.
  // La salida solo es deliberada: el botón "Salir del TPV" (modo web) o
  // cerrar la ventana (kiosk de escritorio).
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadProducts = useCallback(async () => {
    const [prods, cats] = await Promise.all([getProducts(), getCompanyCategories()]);
    setProducts(prods);
    setCategories(cats);
  }, []);

  const loadChecks = useCallback(async () => {
    setChecks(await getOpenChecks());
  }, []);

  useEffect(() => {
    (async () => {
      const [stg, active] = await Promise.all([getCompanySettings(), getActivePosSession()]);
      setSettings(stg);
      setSession(active);
      setSessionChecked(true);
      setHeldSales(loadHeldSales());
      await Promise.all([loadProducts(), loadChecks()]);
    })();
  }, [loadProducts, loadChecks]);

  // Atajos de teclado globales para el cajero
  const isAnyModalOpen = useMemo(
    () => checkoutOpen || customItemOpen || quickCreateOpen || shortcutsOpen ||
      heldListOpen || cashModalMode !== null || lastSale !== null || todaySalesOpen || insightsOpen || weightProduct !== null || activeCheck !== null,
    [checkoutOpen, customItemOpen, quickCreateOpen, shortcutsOpen, heldListOpen, cashModalMode, lastSale, todaySalesOpen, insightsOpen, weightProduct, activeCheck],
  );

  const holdSale = useCallback(() => {
    if (cart.length === 0) return;
    const held: PosHeldSale = {
      id: generateId(),
      label: `Venta aparcada · ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      heldAt: new Date().toISOString(),
      lines: cart,
    };
    const next = [...heldSales, held];
    setHeldSales(next);
    persistHeldSales(next);
    setCart([]);
    posAudio.playHold();
    success('Venta aparcada', 'Puedes retomarla desde "Aparcadas".');
  }, [cart, heldSales, success]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'F2' || e.key === ' ') {
        if (!isAnyModalOpen && cart.length > 0 && document.activeElement?.tagName !== 'INPUT') {
          e.preventDefault();
          setCheckoutOpen(true);
        }
        return;
      }
      if (e.key === 'F3') {
        if (!isAnyModalOpen && cart.length > 0) {
          e.preventDefault();
          holdSale();
        }
        return;
      }
      if (e.key === 'F4') {
        if (!isAnyModalOpen) {
          e.preventDefault();
          setCustomItemOpen(true);
        }
        return;
      }
      if (e.key === 'F5') {
        if (!isAnyModalOpen) {
          e.preventDefault();
          setQuickCreateBarcode('');
          setQuickCreateOpen(true);
        }
        return;
      }
      if (e.key === 'F7') {
        if (!isAnyModalOpen) {
          e.preventDefault();
          setTodaySalesOpen(true);
        }
        return;
      }
      if (e.key === 'F12' || (e.key === '?' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isAnyModalOpen, holdSale]);

  const total = cart.reduce((sum, l) => {
    const gross = l.quantity * l.unitPrice;
    const discount = gross * (l.discountPercent / 100);
    const subtotal = gross - discount;
    return sum + subtotal + subtotal * (l.taxRate / 100);
  }, 0);

  // --- Carrito ---

  const addProductToCart = (product: Product, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(l => l.productId === product.id);
      if (existing) {
        const nextQty = product.unit === UnitOfMeasure.KG
          ? Math.round((existing.quantity + quantity) * 1000) / 1000
          : existing.quantity + quantity;
        return prev.map(l => l.productId === product.id ? { ...l, quantity: nextQty } : l);
      }
      const line: PosCartLine = {
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: product.unitPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
        quantity: product.unit === UnitOfMeasure.KG ? Math.round(quantity * 1000) / 1000 : quantity,
        discountPercent: 0,
        stockQuantity: product.stockQuantity ?? 0,
      };
      return [...prev, line];
    });
    posAudio.playScan();
    if (product.lowStockThreshold != null && (product.stockQuantity ?? 0) <= 0) {
      posAudio.playError();
      toastError('Sin stock', `${product.name} está marcado sin stock — revisa antes de vender.`);
    }
  };

  const handleAddCustomItem = (item: { name: string; unitPrice: number; quantity: number; taxRate: number }) => {
    const customId = `custom-${generateId()}`;
    const line: PosCartLine = {
      productId: customId,
      productName: item.name,
      productRef: 'VAR',
      unitPrice: item.unitPrice,
      unit: UnitOfMeasure.UNIDAD,
      taxRate: item.taxRate,
      quantity: item.quantity,
      discountPercent: 0,
      stockQuantity: 999,
    };
    setCart(prev => [...prev, line]);
    posAudio.playScan();
    success('Artículo añadido', `${item.name} por ${item.unitPrice.toFixed(2)} €`);
  };

  const handleProductCreated = async (newProduct: Product) => {
    await loadProducts();
    addProductToCart(newProduct);
    success('Producto registrado', `${newProduct.name} añadido al catálogo y al ticket.`);
  };

  // Añade un producto a la cuenta activa (modo mesa)
  const addToCheck = async (product: Product, quantity = 1) => {
    if (!activeCheck) return;
    const qty = product.unit === UnitOfMeasure.KG
      ? Math.round(quantity * 1000) / 1000
      : quantity;
    const base: PosCartLine = {
      productId: product.id,
      productName: product.name,
      productRef: product.ref,
      unitPrice: product.unitPrice,
      unit: product.unit,
      taxRate: product.defaultTaxRate,
      quantity: qty,
      discountPercent: 0,
      stockQuantity: product.stockQuantity ?? 0,
    };
    const updated = await addLineToCheck(activeCheck, base);
    setActiveCheck(updated);
    setChecks(prev => prev.map(c => c.id === updated.id ? updated : c));
    posAudio.playScan();
  };

  // Selector unificado: va a la cuenta activa si hay una, si no al carrito
  const handleSelectProduct = (product: Product) => {
    if (activeCheck) { addToCheck(product).then(); return; }
    addProductToCart(product);
  };

  const handleAddWeight = (kg: number) => {
    if (!weightProduct) return;
    if (activeCheck) {
      addToCheck(weightProduct, kg).then();
    } else {
      addProductToCart(weightProduct, kg);
    }
    setWeightProduct(null);
  };

  const handleScan = (code: string): boolean => {
    // Código de báscula (PLU): empieza por 2 + 5 dígitos de producto, con
    // peso y dígito de control opcionales (EAN de 6-13 dígitos).
    const pluMatch = /^2\d{5}/.exec(code);
    if (pluMatch && code.length >= 6 && code.length <= 13) {
      const base = code.slice(0, 6);
      const weighted = products.find(p => p.barcode === code || p.barcode === base || p.ref === base);
      if (weighted && weighted.unit === UnitOfMeasure.KG) {
        setWeightProduct(weighted);
        return true;
      }
    }

    const match = products.find(p => p.barcode === code || p.ref.toLowerCase() === code.toLowerCase());
    if (!match) {
      posAudio.playError();
      toastError('Código no registrado', `Abriendo ficha para dar de alta "${code}"...`);
      setQuickCreateBarcode(code);
      setQuickCreateOpen(true);
      return false;
    }
    handleSelectProduct(match);
    return true;
  };

  // Escáner de mostrador (teclado-clavija): funciona sin necesidad de foco
  const { scanning } = useBarcodeScanner({ onScan: handleScan, disabled: isAnyModalOpen });

  // Tras cerrar cualquier ventana, devuelve el foco al buscador para que
  // el siguiente escaneo llegue directo.
  const prevModalOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevModalOpenRef.current;
    prevModalOpenRef.current = isAnyModalOpen;
    if (wasOpen && !isAnyModalOpen) {
      searchInputRef.current?.focus();
    }
  }, [isAnyModalOpen]);

  const incrementLine = (productId: string) =>
    setCart(prev => prev.map(l => l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l));
  const decrementLine = (productId: string) =>
    setCart(prev => prev
      .map(l => l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l)
      .filter(l => l.quantity > 0));
  const removeLine = (productId: string) => setCart(prev => prev.filter(l => l.productId !== productId));
  const setLineDiscount = (productId: string, discountPercent: number) =>
    setCart(prev => prev.map(l => l.productId === productId ? { ...l, discountPercent } : l));
  const clearCart = () => setCart([]);

  // --- Operaciones sobre líneas de cuenta de mesa ---
  const updateCheckLines = async (fn: (ls: PosCartLine[]) => PosCartLine[]) => {
    if (!activeCheck) return;
    const updated = { ...activeCheck, lines: fn(activeCheck.lines) };
    await saveOpenCheck(updated);
    setActiveCheck(updated);
    setChecks(prev => prev.map(c => c.id === updated.id ? updated : c));
  };
  const incCheckLine = (productId: string) =>
    updateCheckLines(ls => ls.map(l => l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l));
  const decCheckLine = (productId: string) =>
    updateCheckLines(ls =>
      ls.map(l => l.productId === productId ? { ...l, quantity: Math.max(0.001, l.quantity - 1) } : l)
        .filter(l => l.quantity > 0.001));
  const removeCheckLine = (productId: string) =>
    updateCheckLines(ls => ls.filter(l => l.productId !== productId));
  const setCheckDiscount = (productId: string, d: number) =>
    updateCheckLines(ls => ls.map(l => l.productId === productId ? { ...l, discountPercent: d } : l));
  const clearCheckLines = () => updateCheckLines(() => []);

  // --- Handlers de mesas ---
  const handleOpenTable = async (tableId: string) => {
    const check = await createOpenCheck(tableId);
    await loadChecks();
    setActiveCheck(check);
  };

  const handleSelectCheck = (check: OpenCheck) => {
    setActiveCheck(check);
  };

  // --- Aparcar venta ---

  const resumeHeld = (id: string) => {
    const held = heldSales.find(h => h.id === id);
    if (!held) return;
    setCart(held.lines);
    const next = heldSales.filter(h => h.id !== id);
    setHeldSales(next);
    persistHeldSales(next);
    setHeldListOpen(false);
  };

  const discardHeld = (id: string) => {
    const next = heldSales.filter(h => h.id !== id);
    setHeldSales(next);
    persistHeldSales(next);
  };

  // --- Caja ---

  const handleOpenSession = async (startingCash: number) => {
    const opened = await openPosSession(startingCash);
    setSession(opened);
  };

  const handleCloseSession = async (countedCash: number): Promise<PosSession> => {
    if (!session) throw new Error('No hay turno abierto.');
    const closed = await closePosSession(session.id, countedCash);
    return closed;
  };

  const finishClosingSession = () => {
    setSession(undefined);
    setSessionDismissed(false);
    setCashModalMode(null);
  };

  // --- Cobro ---

  /**
   * Emite una factura de TPV.
   * @param linesOverride - Si se pasa, se cobran esas líneas en lugar del carrito
   *                        (uso: cobro de cuenta de mesa). El carrito no se limpia.
   */
  const handleConfirmCheckout = async (method: PaymentMethod, cashGiven?: number, linesOverride?: PosCartLine[]) => {
    if (!settings) throw new Error('No se han cargado los datos de la empresa.');

    const existingInvoices = await getInvoices();
    const planCheck = evaluatePlanLimit(settings, existingInvoices);
    if (!planCheck.allowed) {
      setCheckoutOpen(false);
      setPaywallState({
        title: 'Límite de Plan Alcanzado',
        description: planCheck.reason || 'Suscripción inactiva o límite de facturación alcanzado.',
        requiredPlan: planCheck.requiredPlan || 'pro',
      });
      throw new Error(planCheck.reason);
    }

    const onboarding = await getOnboardingStatus();
    if (!onboarding.isComplete) {
      throw new Error(onboarding.message);
    }

    const client = await ensureWalkInClient();
    const now = new Date().toISOString();

    // Usar las líneas proporcionadas (mesa) o el carrito actual (venta normal)
    const lines = linesOverride ?? cart;

    const lineItems: InvoiceLineItem[] = lines.map(l => {
      const gross = l.quantity * l.unitPrice;
      const discount = gross * (l.discountPercent / 100);
      const subtotal = Number((gross - discount).toFixed(2));
      const taxAmount = Number((subtotal * (l.taxRate / 100)).toFixed(2));
      return {
        id: generateId(),
        productId: l.productId,
        productName: l.productName,
        productRef: l.productRef,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unit: l.unit,
        taxRate: l.taxRate,
        discountPercent: l.discountPercent,
        subtotal,
        taxAmount,
        total: Number((subtotal + taxAmount).toFixed(2)),
      };
    });

    const totals = calculateInvoiceTotals(lineItems);

    // Calcular el número real de ticket TPV para evitar duplicados o errores.
    // Offline se genera como SERIE-AÑO-0000-SUFIJO (sufijo por dispositivo):
    // dos cajas pueden coincidir en el correlativo pero el servidor renumerá
    // al sincronizar si hay colisión — nunca se descarta el ticket.
    const offline = !navigator.onLine;
    const deviceSuffix = offline ? await getDeviceSuffix() : undefined;
    const tpvSeriesInvoices = (await getInvoices()).filter(i => i.series === settings.tpvSeries);
    const seedNumbers = tpvSeriesInvoices.map(i => i.number);
    if (settings.nextTpvNumber && settings.nextTpvNumber > 1) {
      seedNumbers.push(generateInvoiceNumber(settings.tpvSeries, settings.nextTpvNumber));
    }
    const number = nextOfflineNumber(seedNumbers, settings.tpvSeries, new Date().getFullYear(), deviceSuffix);
    const nextTpvNum = parseInt(number.split('-')[2], 10);

    const invoice: Invoice = {
      id: generateId(),
      number,
      series: settings.tpvSeries,
      clientId: client.id,
      clientName: client.businessName,
      clientNif: client.nif,
      clientAddress: '',
      issueDate: getToday(),
      dueDate: getToday(),
      status: InvoiceStatus.BORRADOR,
      lineItems,
      ...totals,
      paymentMethod: method,
      notes: linesOverride ? `Cuenta mesa ${checkoutCheck?.tableId ?? ''}` : 'Venta de TPV',
      createdAt: now,
      updatedAt: now,
      posSessionId: session?.id,
      numberTemporary: offline,
    };

    const issued = await issueInvoice(invoice);

    const updatedSettings = { ...settings, nextTpvNumber: nextTpvNum + 1 };
    setSettings(updatedSettings);
    try {
      await saveCompanySettings(updatedSettings);
    } catch {
      console.warn('Could not update nextTpvNumber in backend, but invoice was emitted.');
    }

    for (const line of lines) {
      if (!line.productId.startsWith('custom-')) {
        try {
          await adjustStock(line.productId, -line.quantity);
          // Inventario IA: contador de unidades vendidas (base del orden
          // inteligente del grid). saveProduct encola el upsert si está offline.
          const prod = products.find(p => p.id === line.productId);
          if (prod) {
            await saveProduct({ ...prod, unitsSold: (prod.unitsSold ?? 0) + line.quantity });
          }
        } catch {
          toastError('Aviso de stock', `No se pudo actualizar el stock de ${line.productName}.`);
        }
      }
    }

    setLastSale({ invoice: issued, cashGiven });
    setCheckoutOpen(false);

    if (!linesOverride) {
      // Venta de carrito normal: limpiar el carrito
      setCart([]);
    }
    // Si es cobro de mesa, el borrado del check lo hace handleChargeCheck

    loadProducts();
  };

  /** Cobra la cuenta de una mesa: llama a handleConfirmCheckout con sus líneas y elimina el check. */
  const handleChargeCheck = async (method: PaymentMethod, cashGiven?: number) => {
    if (!checkoutCheck) return;
    await handleConfirmCheckout(method, cashGiven, checkoutCheck.lines);
    await deleteOpenCheck(checkoutCheck.id);
    setCheckoutCheck(null);
    setActiveCheck(null);
    await loadChecks();
  };

  const showSessionGate = sessionChecked && !session && !sessionDismissed;

  if (settings && !isTpvEnabled(settings)) {
    return (
      <div className="empty-state" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
          <Store size={32} />
        </div>
        <h2 className="empty-state-title">Módulo TPV no activado</h2>
        {isTpvKiosk ? (
          <p className="empty-state-subtitle" style={{ maxWidth: 480, textAlign: 'center' }}>
            El Terminal Punto de Venta está desactivado para esta cuenta. Actívalo desde el panel de Klima Facturación en otro equipo.
          </p>
        ) : (
          <>
            <p className="empty-state-subtitle" style={{ maxWidth: 460, textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              El Terminal Punto de Venta (TPV) está desactivado para la configuración actual. Puedes activarlo libremente en cualquier momento.
            </p>
            <Link href="/ajustes" className="btn btn-primary">
              <SettingsIcon size={16} />
              Activar TPV en Ajustes
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="tpv-shell">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <header className="tpv-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {!isTpvKiosk && (
            <Link href="/dashboard" className="tpv-back-link">
              <ArrowLeft size={18} /> Salir del TPV
            </Link>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShortcutsOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-muted)' }}
            title="Ver atajos de teclado para cajero (F12)"
          >
            <Keyboard size={15} />
            <span>Atajos de teclado</span>
          </button>
          <div
            className={`tpv-scanner-status ${scanning ? 'is-scanning' : ''}`}
            title="Escáner de mostrador: escanea un código en cualquier momento, sin tocar nada"
          >
            <ScanBarcode size={14} />
            <span>{scanning ? 'Escaneando…' : 'Escáner'}</span>
          </div>
        </div>

        <div className="tpv-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setTodaySalesOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            title="Ver histórico de ventas del turno y reimprimir tickets (F7)"
          >
            <Receipt size={15} style={{ color: 'var(--accent-500)' }} />
            <span>Tickets Hoy (F7)</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setInsightsOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            title="Patrones de consumo: lo más vendido, picos por hora y alertas de reposición"
          >
            <TrendingUp size={15} style={{ color: 'var(--accent-500)' }} />
            <span>Patrones</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCustomItemOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <PlusCircle size={15} style={{ color: 'var(--accent-500)' }} />
            <span>Venta Libre (F4)</span>
          </button>

          {session ? (
            <button className="tpv-session-status is-open" onClick={() => setCashModalMode('close')}>
              <Unlock size={14} /> Caja abierta
            </button>
          ) : (
            <button className="tpv-session-status" onClick={() => setSessionDismissed(false)}>
              <Lock size={14} /> Caja cerrada
            </button>
          )}
        </div>
      </header>

      <div className="tpv-main">
        <div className="tpv-left-panel">
          {settings?.tpvMode === 'restaurante' && (
            <div className="tpv-view-tabs">
              <button
                className={`tpv-view-tab${tpvView === 'products' ? ' is-active' : ''}`}
                onClick={() => setTpvView('products')}
              >
                <Store size={15} /> Productos
              </button>
              <button
                className={`tpv-view-tab${tpvView === 'tables' ? ' is-active' : ''}`}
                onClick={() => { setTpvView('tables'); loadChecks().then(); }}
              >
                <Armchair size={15} /> Mesas
              </button>
            </div>
          )}
          {(tpvView === 'products' || settings?.tpvMode !== 'restaurante') ? (
            <TpvProductGrid
              products={products}
              categories={categories}
              mode={settings?.tpvMode ?? defaultTpvModeForSector(settings?.sector ?? 'tienda')}
              onSelectProduct={handleSelectProduct}
              onScan={handleScan}
              onOpenCustomItem={() => setCustomItemOpen(true)}
              onOpenQuickCreateProduct={(code) => {
                setQuickCreateBarcode(code || '');
                setQuickCreateOpen(true);
              }}
              searchInputRef={searchInputRef}
            />
          ) : (
            <TpvTables
              checks={checks}
              onCreateCheck={handleOpenTable}
              onOpenCheck={handleSelectCheck}
            />
          )}
        </div>
        <TpvCart
          lines={cart}
          onIncrement={incrementLine}
          onDecrement={decrementLine}
          onRemove={removeLine}
          onSetDiscount={setLineDiscount}
          onClear={clearCart}
          onHold={holdSale}
          onCheckout={() => setCheckoutOpen(true)}
          heldCount={heldSales.length}
          onShowHeld={() => setHeldListOpen(true)}
        />
      </div>

      {todaySalesOpen && (
        <TpvTodaySalesModal
          onReprint={(inv) => {
            setTodaySalesOpen(false);
            setLastSale({ invoice: inv });
          }}
          onClose={() => setTodaySalesOpen(false)}
        />
      )}

      {insightsOpen && (
        <TpvInsightsModal onClose={() => setInsightsOpen(false)} />
      )}

      {weightProduct && (
        <TpvWeightModal
          product={weightProduct}
          onAdd={handleAddWeight}
          onClose={() => setWeightProduct(null)}
        />
      )}

      {checkoutOpen && (
        checkoutCheck ? (
          <TpvCheckout
            total={checkoutCheck.lines.reduce((sum, l) => {
              const gross = l.quantity * l.unitPrice;
              const disc = gross * (l.discountPercent / 100);
              const sub = gross - disc;
              return sum + sub + sub * (l.taxRate / 100);
            }, 0)}
            onConfirm={handleChargeCheck}
            onClose={() => { setCheckoutOpen(false); setCheckoutCheck(null); }}
          />
        ) : (
          <TpvCheckout total={total} onConfirm={handleConfirmCheckout} onClose={() => setCheckoutOpen(false)} />
        )
      )}

      {/* Panel de cuenta de mesa (modal) */}
      {activeCheck && (
        <div className="modal-overlay" onClick={() => setActiveCheck(null)}>
          <div
            className="modal tpv-check-modal"
            onClick={e => e.stopPropagation()}
          >
            <TpvCart
              tableMode
              title={`Mesa ${activeCheck.tableId}`}
              lines={activeCheck.lines}
              onIncrement={pid => incCheckLine(pid)}
              onDecrement={pid => decCheckLine(pid)}
              onRemove={pid => removeCheckLine(pid)}
              onSetDiscount={(pid, d) => setCheckDiscount(pid, d)}
              onClear={clearCheckLines}
              onHold={() => {}}
              onCheckout={() => {
                setCheckoutCheck(activeCheck);
                setActiveCheck(null);
                setCheckoutOpen(true);
              }}
              heldCount={0}
              onShowHeld={() => {}}
            />
          </div>
        </div>
      )}

      {customItemOpen && (
        <TpvCustomItemModal onAdd={handleAddCustomItem} onClose={() => setCustomItemOpen(false)} />
      )}

      {quickCreateOpen && (
        <TpvQuickCreateProductModal
          initialBarcode={quickCreateBarcode}
          categories={categories}
          onCreated={handleProductCreated}
          onClose={() => setQuickCreateOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <TpvKeyboardHelpModal onClose={() => setShortcutsOpen(false)} />
      )}

      {lastSale && settings && (
        <TpvTicket
          invoice={lastSale.invoice}
          settings={settings}
          cashGiven={lastSale.cashGiven}
          onNewSale={() => setLastSale(null)}
        />
      )}

      {showSessionGate && (
        <TpvCashSession
          mode="open"
          onSubmit={handleOpenSession}
          onSkip={() => setSessionDismissed(true)}
        />
      )}

      {cashModalMode === 'close' && session && (
        <TpvCashSession
          mode="close"
          session={session}
          onSubmit={handleCloseSession}
          onDone={finishClosingSession}
        />
      )}

      {heldListOpen && (
        <div className="modal-overlay animate-fade-in" onClick={() => setHeldListOpen(false)} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
          <div
            className="modal tpv-held-modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: '92vw',
              padding: 0,
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: 'var(--space-5) var(--space-6)',
              background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 255, 255, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}>
                  <List size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                    Ventas Aparcadas ({heldSales.length})
                  </h3>
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                    Tickets en espera de cobro
                  </p>
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setHeldListOpen(false)}
                style={{ color: '#ffffff', opacity: 0.8 }}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
              {heldSales.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  No hay ventas aparcadas en este momento.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {heldSales.map(h => (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <button
                        onClick={() => resumeHeld(h.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {h.label}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-500)', fontWeight: 600, marginTop: 2 }}>
                          {h.lines.length} {h.lines.length === 1 ? 'artículo' : 'artículos'} · Recuperar ticket
                        </div>
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => discardHeld(h.id)}
                        style={{ color: 'var(--color-danger)' }}
                        title="Descartar venta"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {paywallState && (
        <SubscriptionPaywallModal
          title={paywallState.title}
          description={paywallState.description}
          requiredPlan={paywallState.requiredPlan}
          onClose={() => setPaywallState(null)}
        />
      )}
    </div>
  );
}
