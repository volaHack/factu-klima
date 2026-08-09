'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Unlock, List, X, Store, Settings as SettingsIcon, Keyboard, PlusCircle, Receipt, ScanBarcode, TrendingUp } from 'lucide-react';
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
import {
  getProducts, getCompanySettings, saveCompanySettings, getCompanyCategories,
  getActivePosSession, openPosSession, closePosSession, ensureWalkInClient,
  issueInvoice, adjustStock, saveProduct, getOnboardingStatus, getInvoices,
} from '@/lib/storage';
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
  const [cashModalMode, setCashModalMode] = useState<'open' | 'close' | null>(null);
  const [lastSale, setLastSale] = useState<{ invoice: Invoice; cashGiven?: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { toasts, removeToast, success, error: toastError } = useToast();

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

  useEffect(() => {
    (async () => {
      const [stg, active] = await Promise.all([getCompanySettings(), getActivePosSession()]);
      setSettings(stg);
      setSession(active);
      setSessionChecked(true);
      setHeldSales(loadHeldSales());
      await loadProducts();
    })();
  }, [loadProducts]);

  // Atajos de teclado globales para el cajero
  const isAnyModalOpen = useMemo(
    () => checkoutOpen || customItemOpen || quickCreateOpen || shortcutsOpen ||
      heldListOpen || cashModalMode !== null || lastSale !== null || todaySalesOpen || insightsOpen,
    [checkoutOpen, customItemOpen, quickCreateOpen, shortcutsOpen, heldListOpen, cashModalMode, lastSale, todaySalesOpen, insightsOpen],
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

  const addProductToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(l => l.productId === product.id);
      if (existing) {
        return prev.map(l => l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      const line: PosCartLine = {
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: product.unitPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
        quantity: 1,
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

  const handleScan = (code: string): boolean => {
    const match = products.find(p => p.barcode === code || p.ref.toLowerCase() === code.toLowerCase());
    if (!match) {
      posAudio.playError();
      toastError('Código no registrado', `Abriendo ficha para dar de alta "${code}"...`);
      setQuickCreateBarcode(code);
      setQuickCreateOpen(true);
      return false;
    }
    addProductToCart(match);
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

  const handleConfirmCheckout = async (method: PaymentMethod, cashGiven?: number) => {
    if (!settings) throw new Error('No se han cargado los datos de la empresa.');

    const onboarding = await getOnboardingStatus();
    if (!onboarding.isComplete) {
      throw new Error(onboarding.message);
    }

    const client = await ensureWalkInClient();
    const now = new Date().toISOString();

    const lineItems: InvoiceLineItem[] = cart.map(l => {
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
      notes: 'Venta de TPV',
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

    for (const line of cart) {
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
    setCart([]);
    loadProducts();
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
        <TpvProductGrid
          products={products}
          categories={categories}
          mode={settings?.tpvMode ?? defaultTpvModeForSector(settings?.sector ?? 'tienda')}
          onSelectProduct={addProductToCart}
          onScan={handleScan}
          onOpenCustomItem={() => setCustomItemOpen(true)}
          onOpenQuickCreateProduct={(code) => {
            setQuickCreateBarcode(code || '');
            setQuickCreateOpen(true);
          }}
          searchInputRef={searchInputRef}
        />
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

      {checkoutOpen && (
        <TpvCheckout total={total} onConfirm={handleConfirmCheckout} onClose={() => setCheckoutOpen(false)} />
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
        <div className="modal-overlay" onClick={() => setHeldListOpen(false)}>
          <div className="modal tpv-held-modal" onClick={e => e.stopPropagation()}>
            <div className="tpv-checkout-header">
              <h3><List size={18} /> Ventas aparcadas</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setHeldListOpen(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            {heldSales.length === 0 ? (
              <p className="tpv-checkout-note">No hay ventas aparcadas.</p>
            ) : (
              <ul className="tpv-held-list">
                {heldSales.map(h => (
                  <li key={h.id}>
                    <button className="tpv-held-item" onClick={() => resumeHeld(h.id)}>
                      <span>{h.label}</span>
                      <span>{h.lines.length} {h.lines.length === 1 ? 'artículo' : 'artículos'}</span>
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => discardHeld(h.id)} aria-label="Descartar">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
