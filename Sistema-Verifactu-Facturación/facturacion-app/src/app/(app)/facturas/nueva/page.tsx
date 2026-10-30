'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, ArrowLeft, Keyboard, RotateCcw, X } from 'lucide-react';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import { problemasDeLineas } from '@/lib/validation/lineas';
import TotalesDocumento from '@/components/documentos/TotalesDocumento';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Link from 'next/link';
import {
  getClients, getProducts, getCompanySettings, saveInvoice, EMISION_SIN_CONEXION,
  saveCompanySettings, issueInvoice, getOnboardingStatus, getInvoices,
  applyAbonoToInvoice, getCurrentUserId
} from '@/lib/storage';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, UnitOfMeasure, CompanySettings
} from '@/lib/types';
import {
  generateId, generateInvoiceNumber, getToday, addDays,
  calculateInvoiceTotals, sequenceFromNumber, formatCurrency
} from '@/lib/utils';
import { PAYMENT_METHODS, getDefaultTaxRate } from '@/lib/constants';
import type { PlanId } from '@/lib/plans';
import { esOperacionIntracomunitaria, tipoOperacion349 } from '@/lib/intracomunitarias';
import { useToast } from '@/hooks/useToast';
import { avisadorDeNavegador, repasarAntesDeEmitir } from '@/lib/validation/antesDeEmitir';
import { evaluatePlanLimit } from '@/lib/planLimits';
import SubscriptionPaywallModal from '@/components/ui/SubscriptionPaywallModal';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';
import { getPlantillaActiva } from '@/lib/plantillas/almacen';
import { clavesManualesUsadasPorPlantilla, columnasPersonalizadasDePlantilla } from '@/lib/plantillas/plantilla';
import { ajustarPlantillaAlSector } from '@/lib/plantillas/porSector';
import { DatosPlantillaCard } from '@/components/facturas/DatosPlantillaCard';
import { ClienteOcasionalCard } from '@/components/facturas/ClienteOcasionalCard';
import AvisoPlantillaDeOtroOficio from '@/components/facturas/AvisoPlantillaDeOtroOficio';
import {
  clienteManualComoDatosExtras, customColsDeLineas, type ClienteManual
} from '@/lib/plantillas/datos';
import BuscadorFicha from '@/components/clientes/BuscadorFicha';
import ResumenFichaElegida from '@/components/clientes/ResumenFichaElegida';
import AtajosVencimiento from '@/components/documentos/AtajosVencimiento';
import ChuletaAtajos from '@/components/documentos/ChuletaAtajos';
import RevisionAntesDeEmitir from '@/components/facturas/RevisionAntesDeEmitir';
import { accionDelEditorEnEvento } from '@/lib/atajos';
import { revisarAntesDeEmitir, type PuntoRevision } from '@/lib/revisionEmision';
import {
  almacenDelNavegador, borrarBorrador, guardarBorrador, leerBorrador, resumenBorrador,
  VERSION_BORRADOR, type BorradorFactura,
} from '@/lib/borradorLocal';

/** Lo que se espera desde la última tecla antes de copiar la factura a medias. */
const ESPERA_AUTOGUARDADO_MS = 800;

function createEmptyLine(settings?: CompanySettings | null): InvoiceLineItem {
  return {
    id: generateId(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.KG,
    taxRate: getDefaultTaxRate(settings),
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

/** «hoy a las 10:32», «el 28 de octubre a las 18:05». */
function cuandoSeGuardo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`;
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (d.toDateString() === ayer.toDateString()) return `ayer a las ${hora}`;
  return `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${hora}`;
}

export default function NuevaFacturaPage() {
  const router = useRouter();
  const { success, error } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paywallState, setPaywallState] = useState<{ title: string; description: string; requiredPlan: PlanId } | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [clienteOcasional, setClienteOcasional] = useState(false);
  const [clienteManual, setClienteManual] = useState<ClienteManual>({
    nombre: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '',
  });
  const [cobradaAlEmitir, setCobradaAlEmitir] = useState(false);
  const [issueDate, setIssueDate] = useState(getToday());
  const [dueDate, setDueDate] = useState(addDays(getToday(), 30));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [globalDiscounts, setGlobalDiscounts] = useState<[number, number, number]>([0, 0, 0]);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([createEmptyLine()]);
  const [abonoSelection, setAbonoSelection] = useState<AbonoSelection | null>(null);
  const [clavesManuales, setClavesManuales] = useState<string[]>([]);
  const [columnasCustom, setColumnasCustom] = useState<{ clave: string; cabecera: string }[]>([]);
  /** Con qué oficio se montó la plantilla activa, si se hizo desde cero. */
  const [oficioDeLaPlantilla, setOficioDeLaPlantilla] = useState<string | undefined>(undefined);
  // Los ajustes de la empresa hacen falta en el editor de líneas: de ahí sale
  // si se factura con IVA o con IGIC y qué tipos se ofrecen.
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);
  const [datosExtras, setDatosExtras] = useState<Record<string, string>>({});

  // La factura a medias de esta cuenta (lib/borradorLocal.ts). `cuenta` es
  // el usuario de la sesión: sin él no se guarda nada.
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [copiaPendiente, setCopiaPendiente] = useState<BorradorFactura | null>(null);
  // Mientras no se decida qué hacer con la copia que había, no se escribe
  // encima: la primera tecla la borraría antes de poder recuperarla.
  const [copiaDecidida, setCopiaDecidida] = useState(false);
  // Al guardar o emitir ya no hay nada a medias que copiar.
  const terminada = useRef(false);
  // Los documentos que ya hay, para el repaso antes de emitir (duplicadas y
  // lo habitual del cliente).
  const [anteriores, setAnteriores] = useState<Invoice[]>([]);
  const [revision, setRevision] = useState<PuntoRevision[] | null>(null);
  const [chuleta, setChuleta] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, p, settings] = await Promise.all([
        getClients(),
        getProducts(),
        getCompanySettings()
      ]);
      setClients(c.filter(cl => cl.active));
      setProducts(p.filter(pr => pr.active));
      setAjustes(settings);
      setPaymentMethod(settings.defaultPaymentMethod);
      setDueDate(addDays(getToday(), settings.defaultPaymentDays));
      setLineItems([createEmptyLine(settings)]);
      try {
        // Antes de leer el diseño, que siga al sector. Ajustes ya lo hace al
        // tocar el selector, pero eso no alcanza a quien cambió de gremio
        // antes de que esto existiera: se quedaría con las columnas del
        // oficio anterior para siempre. Aquí se corrige solo, y no hace nada
        // cuando ya coinciden.
        const ajuste = await ajustarPlantillaAlSector(settings.sector, settings);
        if (ajuste.cambiada) {
          success(
            `Tu factura pasa a la de ${ajuste.oficio}`,
            'Las líneas te piden ahora lo de tu oficio. La anterior sigue guardada en Diseño de documentos.',
          );
        }
        const plantilla = await getPlantillaActiva('factura');
        if (plantilla?.plantilla) {
          setClavesManuales(clavesManualesUsadasPorPlantilla(plantilla.plantilla));
          setColumnasCustom(columnasPersonalizadasDePlantilla(plantilla.plantilla));
          setOficioDeLaPlantilla(plantilla.diagnostico?.oficio);
        }
      } catch {
        // Sin plantilla activa no hay campos manuales que mostrar.
      }
      const usuario = await getCurrentUserId().catch(() => null);
      const copia = leerBorrador(almacenDelNavegador(), usuario);
      setCuenta(usuario);
      setCopiaPendiente(copia);
      setCopiaDecidida(!copia);
      getInvoices().then(setAnteriores).catch(() => {});
      setMounted(true);
    })();
  }, []);

  // When client changes, update payment terms
  // `nueva`: la ficha recién creada desde el buscador, que aún no está en `clients`.
  const handleClientChange = (cId: string, nueva?: Client) => {
    setClientId(cId);
    setAbonoSelection(null);
    if (cId) setClienteOcasional(false);
    const client = nueva ?? clients.find(c => c.id === cId);
    if (client) {
      setPaymentMethod(client.defaultPaymentMethod);
      setDueDate(addDays(issueDate, client.paymentDays));
    }
  };

  // Totals
  //
  // Los descuentos de pie entran aquí, no en las líneas: son una rebaja
  // sobre el total de la factura, encadenada igual que los de línea.
  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, globalDiscounts),
    [lineItems, globalDiscounts],
  );

  const selectedClient = clients.find(c => c.id === clientId);

  /** Lo que se lleva escrito, tal cual se guarda en el equipo. */
  const copiaActual = (): BorradorFactura => ({
    version: VERSION_BORRADOR,
    guardado: new Date().toISOString(),
    clientId: clienteOcasional ? '' : clientId,
    clienteNombre: selectedClient?.tradeName || selectedClient?.businessName || '',
    clienteOcasional,
    clienteManual,
    issueDate,
    dueDate,
    paymentMethod,
    notes,
    globalDiscounts,
    lineItems,
    datosExtras,
    cobradaAlEmitir,
    total: totals.total,
  });
  const ultimaCopia = useRef(copiaActual);
  useEffect(() => { ultimaCopia.current = copiaActual; });

  // Se copia un poco después de la última tecla, no en cada una.
  useEffect(() => {
    if (!mounted || !copiaDecidida || !cuenta || terminada.current) return;
    const reloj = window.setTimeout(() => guardarBorrador(almacenDelNavegador(), cuenta, ultimaCopia.current()), ESPERA_AUTOGUARDADO_MS);
    return () => window.clearTimeout(reloj);
  }, [mounted, copiaDecidida, cuenta, clientId, clienteOcasional, clienteManual, issueDate, dueDate,
    paymentMethod, notes, globalDiscounts, lineItems, datosExtras, cobradaAlEmitir]);

  // Y al irse (otra pantalla, cerrar la pestaña), lo último sin esperar.
  useEffect(() => {
    if (!mounted || !copiaDecidida || !cuenta) return;
    const volcar = () => { if (!terminada.current) guardarBorrador(almacenDelNavegador(), cuenta, ultimaCopia.current()); };
    window.addEventListener('pagehide', volcar);
    return () => { window.removeEventListener('pagehide', volcar); volcar(); };
  }, [mounted, copiaDecidida, cuenta]);

  const recuperarCopia = () => {
    const b = copiaPendiente;
    if (!b) return;
    // La ficha puede haberse dado de baja desde entonces.
    const ficha = b.clientId ? clients.find(c => c.id === b.clientId) : undefined;
    setClientId(ficha ? ficha.id : '');
    setClienteOcasional(b.clienteOcasional);
    setClienteManual(b.clienteManual);
    setIssueDate(b.issueDate);
    setDueDate(b.dueDate);
    if (b.paymentMethod) setPaymentMethod(b.paymentMethod);
    setNotes(b.notes);
    setGlobalDiscounts(b.globalDiscounts);
    setLineItems(b.lineItems.length ? b.lineItems : [createEmptyLine(ajustes)]);
    setDatosExtras(b.datosExtras);
    setCobradaAlEmitir(b.cobradaAlEmitir);
    setCopiaPendiente(null);
    setCopiaDecidida(true);
    success('Factura recuperada', b.clientId && !ficha ? 'Ese cliente ya no está de alta: elige otro.' : 'Sigue donde lo dejaste.');
  };

  const descartarCopia = () => {
    borrarBorrador(almacenDelNavegador(), cuenta);
    setCopiaPendiente(null);
    setCopiaDecidida(true);
  };


  const handleSave = async (status: InvoiceStatus) => {
    const esOcasional = clienteOcasional;
    if (!esOcasional && !clientId) {
      error('Error', 'Selecciona un cliente');
      return;
    }
    if (esOcasional && !clienteManual.nombre.trim()) {
      error('Error', 'Escribe el nombre del cliente');
      return;
    }
    // Una línea con producto y sin unidades no se descarta en silencio: se
    // avisa (ver problemasDeLineas).
    const validLines = lineItems.filter(l => l.productId);
    if (validLines.length === 0) {
      error('Error', 'Añade al menos un producto');
      return;
    }
    const fallosLineas = problemasDeLineas(validLines, await getCompanySettings()).filter(p => p.gravedad === 'error');
    if (fallosLineas.length > 0) {
      error('Revisa las líneas', fallosLineas.map(p => p.mensaje).join(' '));
      return;
    }

    // Bloquear emisión si falta completar datos críticos
    if (status === InvoiceStatus.EMITIDA) {
      const obStatus = await getOnboardingStatus();
      if (!obStatus.isComplete) {
        error('Completa los primeros pasos', obStatus.message);
        return;
      }
    }

    const settings = await getCompanySettings();
    const existingInvoices = await getInvoices();
    const check = evaluatePlanLimit(settings, existingInvoices);
    if (!check.allowed) {
      setPaywallState({
        title: 'Has llegado al límite de tu plan',
        description: check.reason || 'Has alcanzado el límite de uso de tu plan.',
        requiredPlan: check.requiredPlan || 'pro',
      });
      return;
    }

    const invoiceNumber = generateInvoiceNumber(settings.invoiceSeries, settings.nextInvoiceNumber);
    const client = esOcasional ? undefined : clients.find(c => c.id === clientId);
    const datosExtrasFinal = {
      ...datosExtras,
      ...(esOcasional ? clienteManualComoDatosExtras(clienteManual) : {}),
      ...customColsDeLineas(validLines),
    };
    const nombreCliente = esOcasional ? clienteManual.nombre : (client?.tradeName || client?.businessName || '');
    const clientAddress = esOcasional
      ? [clienteManual.direccion, clienteManual.cp, clienteManual.ciudad]
          .map(s => s.trim()).filter(Boolean).join(', ')
      : `${client?.address ?? ''}, ${client?.postalCode ?? ''} ${client?.city ?? ''}`;

    const invoice: Invoice = {
      id: generateId(),
      number: invoiceNumber,
      series: settings.invoiceSeries,
      clientId: esOcasional ? '' : (client?.id ?? ''),
      clientName: nombreCliente,
      clientNif: esOcasional ? clienteManual.nif : (client?.nif ?? ''),
      clientAddress,
      issueDate,
      dueDate,
      status,
      lineItems: validLines,
      ...totals,
      globalDiscountPercent1: globalDiscounts[0] || 0,
      globalDiscountPercent2: globalDiscounts[1] || 0,
      globalDiscountPercent3: globalDiscounts[2] || 0,
      paymentMethod,
      notes,
      esIntracomunitaria: client ? esOperacionIntracomunitaria(client, settings) : false,
      clientVatNumber: client?.vatNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      datosExtras: datosExtrasFinal,
    };
    if (invoice.esIntracomunitaria) {
      invoice.tipoOperacion349 = tipoOperacion349(invoice) || 'E';
    }

    setSaving(true);
    try {
      if (status === InvoiceStatus.BORRADOR) {
        const saved = await saveInvoice(invoice);
        success('Borrador guardado', `${saved.number} · ${nombreCliente}`);
        // El contador se sincroniza con el número REAL persistido:
        // saveInvoice reasigna el número si el previsto ya estaba en uso
        // (colisión) y un contador desfasado es la causa de la numeración
        // saltada (FAC-2026-0026 previsto → 0033 guardado).
        settings.nextInvoiceNumber = sequenceFromNumber(saved.number) + 1;
      } else {
        // Emitir es un proceso en dos pasos: primero se consolidan las
        // líneas como borrador y después el servidor sella la cabecera.
        // Al revés, la factura quedaría sellada antes de tener líneas y
        // el servidor rechazaría escribirlas.
        // Repaso con la persona delante: avisos, y NIF + nombre contra el
        // censo de la AEAT si hay certificado. Puede corregir el nombre.
        const revisada = await repasarAntesDeEmitir(invoice, avisadorDeNavegador(error));
        if (!revisada) return;
        const issued = await issueInvoice(revisada);

        let abonoNote = '';
        let cobrada = cobradaAlEmitir;
        if (abonoSelection && abonoSelection.amount > 0) {
          await applyAbonoToInvoice(abonoSelection.abono.id, invoice.id, issued.number, abonoSelection.amount);
          const restante = Number((invoice.total - abonoSelection.amount).toFixed(2));
          if (restante <= 0.01) {
            cobrada = true;
            abonoNote = ' · abono aplicado, factura cobrada';
          } else {
            abonoNote = ' · abono aplicado';
          }
        }
        if (cobrada) {
          await saveInvoice({
            ...issued,
            status: InvoiceStatus.PAGADA,
            paidDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString(),
          });
          abonoNote = cobradaAlEmitir && !abonoNote ? ' · emitida como cobrada' : abonoNote;
        }

        settings.nextInvoiceNumber = sequenceFromNumber(issued.number) + 1;

        success(
          'Factura emitida y sellada',
          `${issued.number} · huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…${abonoNote}`
        );
      }

      // Ya está guardada en su sitio: la copia de la factura a medias sobra.
      terminada.current = true;
      borrarBorrador(almacenDelNavegador(), cuenta);

      await saveCompanySettings(settings);

      router.push('/facturas');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      // Sin conexión no se emite: ya está guardada como borrador en este
      // equipo. Se sale a la lista para no crear otro borrador al reintentar.
      if (mensaje.startsWith(EMISION_SIN_CONEXION)) {
        terminada.current = true;
        borrarBorrador(almacenDelNavegador(), cuenta);
        error('No emitida: no hay conexión', mensaje);
        router.push('/facturas');
        return;
      }
      error('No se pudo guardar', mensaje);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Emitir pasa antes por el repaso (lib/revisionEmision.ts): si hay algo
   * raro se enseña y se elige; si no, se emite sin más ventanas. Lo que
   * falta del todo (cliente, líneas) lo sigue diciendo `handleSave`.
   */
  const pedirEmision = () => {
    if (saving) return;
    const lineas = lineItems.filter(l => l.productId);
    const sinCliente = clienteOcasional ? !clienteManual.nombre.trim() : !clientId;
    if (sinCliente || lineas.length === 0) {
      void handleSave(InvoiceStatus.EMITIDA);
      return;
    }
    const ficha = clienteOcasional ? undefined : selectedClient;
    const nif = clienteOcasional ? clienteManual.nif : ficha?.nif;
    const puntos = revisarAntesDeEmitir({
      lineas,
      clienteId: ficha?.id ?? null,
      clienteNombre: clienteOcasional ? clienteManual.nombre : (ficha?.tradeName || ficha?.businessName),
      clienteNif: nif,
      clienteDireccion: clienteOcasional ? clienteManual.direccion : ficha?.address,
      clientePais: ficha?.country,
      intracomunitaria: ficha ? esOperacionIntracomunitaria(ficha) : false,
      simplificada: !nif?.trim() && !ficha?.vatNumber,
      fechaEmision: issueDate,
      fechaVencimiento: dueDate,
      total: totals.total,
      descuentosPie: globalDiscounts,
    }, anteriores);
    if (puntos.length > 0) setRevision(puntos);
    else void handleSave(InvoiceStatus.EMITIDA);
  };

  // Ctrl+Intro, Ctrl+S y la chuleta (lib/atajos.ts). Alt+N y Alt+flechas los
  // lleva el editor de líneas. Antes de emitir o guardar se suelta el foco:
  // así una cuenta a medio escribir en una casilla se resuelve y entra.
  const teclado = useRef({ emitir: pedirEmision, guardar: () => {} });
  useEffect(() => {
    teclado.current = {
      emitir: pedirEmision,
      guardar: () => { if (!saving) void handleSave(InvoiceStatus.BORRADOR); },
    };
  });
  const alAtajo = useCallback((e: KeyboardEvent) => {
    const accion = accionDelEditorEnEvento(e);
    if (accion === 'chuleta') {
      e.preventDefault();
      setChuleta(true);
      return;
    }
    if (accion !== 'emitir' && accion !== 'guardar') return;
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.setTimeout(() => teclado.current[accion](), 0);
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', alAtajo);
    return () => window.removeEventListener('keydown', alAtajo);
  }, [alAtajo]);

  if (!mounted) {
    return <PageSkeleton variant="form" label="Preparando la factura" />;
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/facturas" className="page-back">
            <ArrowLeft /> Facturas
          </Link>
          <h1 className="page-title">Nueva factura</h1>
          <p className="page-subtitle">
            Puedes guardarla como borrador y seguir después. Al emitirla se sella y ya no se podrá
            modificar.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm boton-atajos"
            onClick={() => setChuleta(true)}
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
          >
            <Keyboard size={16} aria-hidden />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleSave(InvoiceStatus.BORRADOR)}
            disabled={saving}
            title="Guardar como borrador (Ctrl+S)"
          >
            <Save size={16} /> Guardar borrador
          </button>
          <button
            className="btn btn-primary neon neon--al-pasar"
            onClick={pedirEmision}
            disabled={saving}
            title="Al emitir, la factura se sella y no podrá modificarse (Ctrl+Intro)"
          >
            <Send size={16} /> {saving ? 'Sellando…' : 'Emitir factura'}
          </button>
        </div>
      </div>

      {copiaPendiente && (
        <div className="factura-sin-terminar" role="status">
          <RotateCcw size={18} aria-hidden className="factura-sin-terminar-icono" />
          <p className="factura-sin-terminar-texto">
            <strong>{resumenBorrador(copiaPendiente)}</strong>
            <span>Guardada en este equipo {cuandoSeGuardo(copiaPendiente.guardado)}.</span>
          </p>
          <div className="factura-sin-terminar-acciones">
            <button type="button" className="btn btn-primary btn-sm" onClick={recuperarCopia}>
              <RotateCcw size={14} aria-hidden /> Recuperar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={descartarCopia}>
              <X size={14} aria-hidden /> Descartar
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '900px' }}>
        <AvisoPlantillaDeOtroOficio oficioDeLaPlantilla={oficioDeLaPlantilla} sector={ajustes?.sector} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-6)', maxWidth: '900px' }}>
        {/* Client & Dates */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className={`form-label${clienteOcasional ? '' : ' required'}`}>Cliente</label>
              {clienteOcasional ? (
                <div className="field-message" style={{ paddingTop: 'var(--space-2)' }}>
                  Se usa el cliente ocasional definido abajo.
                </div>
              ) : (
                <>
                <BuscadorFicha
                  fichas={clients}
                  value={clientId}
                  onSelect={id => handleClientChange(id)}
                  placeholder="Buscar cliente: nombre, NIF, teléfono o ciudad"
                  ariaLabel="Cliente"
                  alCrear={c => { setClients(prev => [...prev, c]); handleClientChange(c.id, c); }}
                />
                <ResumenFichaElegida ficha={clients.find(c => c.id === clientId)} />
                </>
              )}
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha de emisión</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha de vencimiento</label>
              <input
                type="date"
                className="form-input"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
              <AtajosVencimiento
                emision={issueDate}
                vencimiento={dueDate}
                diasCliente={clienteOcasional ? null : selectedClient?.paymentDays}
                onElegir={setDueDate}
              />
            </div>
          </div>

          {selectedClient && !clienteOcasional && (
            <div style={{
              marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedClient.businessName}</strong>
              <br />{selectedClient.nif} · {selectedClient.address}, {selectedClient.postalCode} {selectedClient.city}
              <br />{selectedClient.email} · {selectedClient.phone}
            </div>
          )}

          <ClienteOcasionalCard
            activo={clienteOcasional}
            onActivo={setClienteOcasional}
            cliente={clienteManual}
            onChange={setClienteManual}
          />
        </div>

        <DatosPlantillaCard
          claves={clavesManuales}
          datosExtras={datosExtras}
          onChange={(clave, valor) => setDatosExtras(prev => ({ ...prev, [clave]: valor }))}
          sector={ajustes?.sector}
        />

        {/* Las líneas van por el componente compartido y no por una copia
            propia: es lo que trae los tres descuentos en cascada, la etiqueta
            IVA o IGIC según el régimen de la empresa y las columnas que pida
            la plantilla. Manteniendo dos editores parecidos, lo que se
            arreglaba en uno seguía roto en el otro. */}
        {ajustes && (
          <LineasDocumento
            lineItems={lineItems}
            onChange={setLineItems}
            products={products}
            settings={ajustes}
            tarifaId={selectedClient?.tarifaId}
            defaultDiscounts={clienteOcasional ? undefined : selectedClient?.defaultDiscounts}
            cliente={clienteOcasional ? null : selectedClient}
            columnasCustom={columnasCustom}
            clienteId={clienteOcasional ? null : selectedClient?.id}
          />
        )}

        {/* Totales y pago */}
        <TotalesDocumento
          subtotal={totals.subtotal}
          totalDiscount={totals.totalDiscount}
          taxBreakdown={totals.taxBreakdown}
          totalTax={totals.totalTax}
          total={totals.total}
          etiquetaImpuesto={ajustes?.igicEnabled ? 'IGIC' : 'IVA'}
          descuentoAlPie={totals.globalDiscountAmount ?? 0}
          porcentajesPie={globalDiscounts.filter(p => p > 0)}
          globalDiscounts={globalDiscounts}
          onGlobalDiscountsChange={setGlobalDiscounts}
          destacado
        >
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Forma de pago</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map(pm => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="field-check" style={{ marginTop: 'var(--space-5)' }}>
                <input
                  type="checkbox"
                  checked={cobradaAlEmitir}
                  onChange={e => setCobradaAlEmitir(e.target.checked)}
                />
                Marcar como cobrada al emitir
              </label>
              <div className="field-message">Registra la fecha de cobro de hoy en el momento de emitir.</div>
            </div>
          </div>
        </TotalesDocumento>

        {/* Notes */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea
            className="form-textarea"
            placeholder="Notas adicionales que aparecerán en la factura..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {clientId && (
          <AbonoPanel key={clientId} clientId={clientId} invoiceTotal={totals.total} onSelection={setAbonoSelection} />
        )}

        {/* El cierre del formulario, sólo en el teléfono. Allí los botones
            de arriba quedan muy lejos cuando se termina de rellenar, y una
            barra fija abajo se montaría encima de la navegación móvil (ver
            «La barra flotante, fuera del teléfono» en globals.css). Aquí
            van en su sitio, al final, con el total a la vista. */}
        <div className="nueva-cierre">
          <div className="nueva-cierre-total">
            <span>Total</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </div>
          <div className="nueva-cierre-acciones">
            <button
              className="btn btn-secondary"
              onClick={() => handleSave(InvoiceStatus.BORRADOR)}
              disabled={saving}
            >
              <Save size={16} /> Borrador
            </button>
            <button
              className="btn btn-primary"
              onClick={pedirEmision}
              disabled={saving}
            >
              <Send size={16} /> {saving ? 'Sellando…' : 'Emitir factura'}
            </button>
          </div>
        </div>
      </div>

      {revision && (
        <RevisionAntesDeEmitir
          puntos={revision}
          onRevisar={() => setRevision(null)}
          onEmitir={() => { setRevision(null); void handleSave(InvoiceStatus.EMITIDA); }}
        />
      )}

      {chuleta && <ChuletaAtajos onCerrar={() => setChuleta(false)} />}

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
