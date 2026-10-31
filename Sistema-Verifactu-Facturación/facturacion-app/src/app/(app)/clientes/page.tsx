'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { usePestanaDeLaDireccion, useNuevoDeLaDireccion } from '@/hooks/useDireccion';
import { useRevisarAlVolver } from '@/hooks/useRevisarAlVolver';
import Link from 'next/link';
import { Plus, Search, SearchX, Edit, Trash2, Eye, X, Check, BarChart3, Tag, Percent, RefreshCw, ChevronUp, ChevronDown, Upload, ClipboardPaste } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import EnlacePortal from '@/components/portal/EnlacePortal';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { useColoresGrafica, SERIES } from '@/components/charts/theme';
import { getClients, saveClient as persistClient, deleteClient as removeClient, getInvoices, getVendedores, getCompanySettings } from '@/lib/storage';
import { Client, Invoice, PaymentMethod, Vendedor, CompanySettings } from '@/lib/types';
import { formatCurrency, generateId } from '@/lib/utils';
import { isFactura } from '@/lib/documentos';
import { repartoPorFormaDePago } from '@/lib/repartoFormasPago';
import { PAYMENT_METHODS, PROVINCES, PAISES_SELECTOR, esPaisUeNoEspana } from '@/lib/constants';
import ComprobacionIdentidad, { problemasDeFicha } from '@/components/clientes/ComprobacionIdentidad';
import { comprobarNifYNombre, esClienteEspanol } from '@/lib/validation/identidad';
import { useToast } from '@/hooks/useToast';
import { NOMBRE_TIPO_FISCAL, tipoFiscalDe } from '@/lib/facturaElectronica/ambito';
import { casaTexto } from '@/lib/casaTexto';
import { usePaginacion } from '@/hooks/usePaginacion';
import Paginacion from '@/components/ui/Paginacion';
import { NOMBRE_ORIGEN, origenDelHistorico, topHistorico, type FilaTopHistorico, type TipoHistorico } from '@/lib/historico';
import { TIPOS_RANKING, esDeCompra, rankingDeKlima, rankingDelHistorico } from '@/lib/rankingTerceros';

import CifraQueCuenta from '@/components/ui/CifraQueCuenta';
import { programarBorrado, ESPERA_DESHACER_MS } from '@/lib/borradoDiferido';
import { olvidarFicha } from '@/lib/memoriaFichas';
import { usePerfiles } from '@/lib/perfilesCliente';
import { fichasParecidas } from '@/lib/clienteRepetido';
import type { CampoFicha } from '@/lib/fichaPegada';
import type { CasillasLugar } from '@/lib/codigosPostales';
import AvisoFichaRepetida from '@/components/clientes/AvisoFichaRepetida';
import PegarDatosFicha from '@/components/clientes/PegarDatosFicha';
import { MunicipiosParaElegir, useRellenoPorCp } from '@/components/clientes/RellenoPorCp';

/** Qué casilla del formulario es cada dato de «Pegar datos». */
const CASILLA_DE: Record<CampoFicha, 'businessName' | 'nif' | 'email' | 'phone' | 'contactPerson' | 'address' | 'postalCode' | 'city' | 'province'> = {
  razonSocial: 'businessName', nif: 'nif', email: 'email', telefono: 'phone', contacto: 'contactPerson',
  direccion: 'address', codigoPostal: 'postalCode', municipio: 'city', provincia: 'province',
};
/** Solo se guardan los DIR3 si hay alguno puesto. */
function limpiarDir3(d: { oficinaContable: string; organoGestor: string; unidadTramitadora: string }): Client['dir3'] {
  const limpio = {
    oficinaContable: d.oficinaContable.trim() || undefined,
    organoGestor: d.organoGestor.trim() || undefined,
    unidadTramitadora: d.unidadTramitadora.trim() || undefined,
  };
  return limpio.oficinaContable || limpio.organoGestor || limpio.unidadTramitadora ? limpio : undefined;
}

function ClientesPageContenido() {
  const [clients, setClients] = useState<Client[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoContactoFilter, setTipoContactoFilter] = usePestanaDeLaDireccion<'todos' | 'clientes' | 'proveedores'>(['todos', 'clientes', 'proveedores'], 'todos', 'tipo');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'nif' | 'city' | 'email' | 'invoiceCount' | 'total'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [tipoTop, setTipoTop] = useState<TipoHistorico>('factura_venta');
  const [origenTop, setOrigenTop] = useState<string>('klima');
  const [origenHistorico, setOrigenHistorico] = useState<string | null>(null);
  const [topDelHistorico, setTopDelHistorico] = useState<{ tipo: TipoHistorico; filas: FilaTopHistorico[] } | null>(null);
  const { success, error: toastError, addToast } = useToast();
  const { cuenta } = usePerfiles();
  // Lo borrado que aún se puede deshacer: no se pinta, pero no se ha tocado.
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());

  // Form state
  const [form, setForm] = useState({
    businessName: '', tradeName: '', nif: '', vatNumber: '', email: '', phone: '',
    contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'ES',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA as PaymentMethod,
    notes: '', active: true, esProveedor: false, vendedorId: '',
    codigo: '',
    tarifaId: '',
    defaultDiscounts: [0, 0, 0] as [number, number, number],
    dir3: { oficinaContable: '', organoGestor: '', unidadTramitadora: '' },
    tipoFiscal: '' as '' | NonNullable<Client['tipoFiscal']>,
  });

  useEffect(() => {
    (async () => {
      const [clientsData, allInvoices, vendData, settData] = await Promise.all([
        getClients(),
        getInvoices(),
        getVendedores(),
        getCompanySettings(),
      ]);
      setClients(clientsData);
      setInvoices(allInvoices);
      setVendedores(vendData);
      setSettings(settData);
      setMounted(true);
    })();

    const handleAutoRefresh = () => {
      reload();
    };

    window.addEventListener('klima-clients-updated', handleAutoRefresh);
    window.addEventListener('klima-invoices-updated', handleAutoRefresh);
    return () => {
      window.removeEventListener('klima-clients-updated', handleAutoRefresh);
      window.removeEventListener('klima-invoices-updated', handleAutoRefresh);
    };
  }, []);

  // Al volver a la pestaña y cada rato: lo de otros equipos sale solo.
  useRevisarAlVolver(['clients', 'invoices']);

  // ¿Hay historial de otro programa? Sólo entonces se ofrece en el top.
  useEffect(() => {
    let vivo = true;
    origenDelHistorico().then(o => { if (vivo) setOrigenHistorico(o); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  // El top del historial lo suma la base de datos: se pide al elegirlo.
  useEffect(() => {
    if (origenTop === 'klima') return;
    let vivo = true;
    topHistorico(tipoTop)
      .catch(() => [] as FilaTopHistorico[])
      .then(filas => { if (vivo) setTopDelHistorico({ tipo: tipoTop, filas }); });
    return () => { vivo = false; };
  }, [origenTop, tipoTop]);

  // Declaración, no constante: el escuchador de eventos de arriba la usa
  // antes de esta línea. Con `const` se quedaba con la versión del primer
  // render —el linter lo marcaba como error— y una recarga automática
  // podía trabajar con datos de hace varios renders.
  async function reload() {
    setRefreshing(true);
    const [clientsData, allInvoices, vendData] = await Promise.all([
      getClients(),
      getInvoices(),
      getVendedores(),
    ]);
    setClients(clientsData);
    setInvoices(allInvoices);
    setVendedores(vendData);
    setTimeout(() => setRefreshing(false), 400);
  }

  // Stats pre-calculados para poder ordenar por ellos (solo facturas de venta, no albaranes)
  const clientStats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const client of clients) {
      const clientInvs = invoices.filter(i => i.clientId === client.id && i.status !== 'anulada' && isFactura(i));
      map.set(client.id, {
        count: clientInvs.length,
        total: clientInvs.reduce((sum, i) => sum + i.total, 0),
      });
    }
    return map;
  }, [clients, invoices]);

  const filtered = useMemo(() => {
    let list = clients.filter(c => !ocultos.has(c.id));
    if (tipoContactoFilter === 'clientes') list = list.filter(c => !c.esProveedor);
    if (tipoContactoFilter === 'proveedores') list = list.filter(c => c.esProveedor);

    if (search) {
      // Sin tildes y con varias palabras: «pepe arrecife», «928 11», «jose».
      list = list.filter(c => casaTexto(search,
        c.businessName, c.tradeName, c.codigo, c.nif, c.city, c.province, c.postalCode, c.email, c.phone, c.contactPerson, c.address,
      ));
    }

    list.sort((a, b) => {
      const statsA = clientStats.get(a.id) ?? { count: 0, total: 0 };
      const statsB = clientStats.get(b.id) ?? { count: 0, total: 0 };
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.tradeName || a.businessName || '').localeCompare(b.tradeName || b.businessName || '', 'es', { sensitivity: 'base' }); break;
        case 'nif':
          cmp = a.nif.localeCompare(b.nif); break;
        case 'city':
          cmp = a.city.localeCompare(b.city, 'es', { sensitivity: 'base' }); break;
        case 'email':
          cmp = a.email.localeCompare(b.email); break;
        case 'invoiceCount':
          cmp = statsA.count - statsB.count; break;
        case 'total':
          cmp = statsA.total - statsB.total; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [clients, ocultos, search, tipoContactoFilter, clientStats, sortField, sortDir]);

  // Por páginas: con cientos de fichas la tabla entera se hacía eterna.
  const paginado = usePaginacion(filtered, {
    clave: 'clientes',
    reinicio: [search, tipoContactoFilter, sortField, sortDir].join('|'),
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

  const getClientStats = (clientId: string) => {
    return clientStats.get(clientId) ?? { count: 0, total: 0 };
  };

  // Datos de la analítica
  const { accent } = useColoresGrafica();

  // El top: de qué documento y de dónde (Klima o el programa anterior).
  const nombreDeFicha = useMemo(() => {
    const nombres = new Map(clients.map(c => [c.id, c.tradeName || c.businessName]));
    return (id: string) => nombres.get(id);
  }, [clients]);
  const topClientsData = useMemo(
    () => origenTop === 'klima'
      ? rankingDeKlima(invoices, nombreDeFicha, tipoTop)
      : topDelHistorico?.tipo === tipoTop ? rankingDelHistorico(topDelHistorico.filas, nombreDeFicha) : [],
    [origenTop, tipoTop, invoices, nombreDeFicha, topDelHistorico],
  );
  const cargandoTop = origenTop !== 'klima' && topDelHistorico?.tipo !== tipoTop;
  const tituloTop = esDeCompra(tipoTop) ? 'Top proveedores' : 'Top clientes';
  const nombreTipoTop = TIPOS_RANKING.find(t => t.id === tipoTop)?.nombre.toLowerCase() ?? '';
  const subtituloTop = origenTop === 'klima'
    ? `Por importe en ${nombreTipoTop} de Klima`
    : `Por importe en ${nombreTipoTop} de ${NOMBRE_ORIGEN[origenTop] ?? origenTop}`;

  // Cómo pagan los de la pestaña que se mira: los clientes, los proveedores o todos.
  const contactosDeLaPestana = useMemo(
    () => clients.filter(c => tipoContactoFilter === 'todos' || (tipoContactoFilter === 'proveedores') === Boolean(c.esProveedor)),
    [clients, tipoContactoFilter],
  );
  const reparto = useMemo(() => repartoPorFormaDePago(contactosDeLaPestana), [contactosDeLaPestana]);
  const quienes: [string, string] = tipoContactoFilter === 'proveedores' ? ['proveedor', 'proveedores']
    : tipoContactoFilter === 'clientes' ? ['cliente', 'clientes'] : ['ficha', 'fichas'];

  // «Pegar datos», el aviso de ficha repetida y el código postal que
  // rellena la provincia y el municipio.
  const [pegandoDatos, setPegandoDatos] = useState(false);
  const [crearIgualmente, setCrearIgualmente] = useState(false);
  const avisoRepetida = useRef<HTMLDivElement>(null);
  const rellenoLugar = useRellenoPorCp(useCallback((c: Partial<CasillasLugar>) => {
    setForm(prev => ({
      ...prev,
      ...(c.provincia !== undefined ? { province: c.provincia } : {}),
      ...(c.municipio !== undefined ? { city: c.municipio } : {}),
    }));
  }, []));
  const parecidas = useMemo(
    () => (showModal && !editingClient && !crearIgualmente
      ? fichasParecidas({ nif: form.nif, nombre: form.businessName, nombreComercial: form.tradeName }, clients)
      : []),
    [showModal, editingClient, crearIgualmente, form.nif, form.businessName, form.tradeName, clients],
  );

  const cambiarCp = (cp: string) => {
    updateForm('postalCode', cp);
    if (form.country === 'ES') rellenoLugar.alCambiarCp(cp, { provincia: form.province, municipio: form.city });
  };

  const aplicarPegado = (datos: Partial<Record<CampoFicha, string>>) => {
    setForm(prev => {
      const siguiente = { ...prev };
      for (const [campo, valor] of Object.entries(datos) as [CampoFicha, string][]) {
        siguiente[CASILLA_DE[campo]] = campo === 'nif' ? valor.toUpperCase() : valor;
      }
      return siguiente;
    });
    setPegandoDatos(false);
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setCrearIgualmente(false);
    rellenoLugar.reiniciar();
    setForm({
      businessName: '', tradeName: '', nif: '', vatNumber: '', email: '', phone: '',
      contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'ES',
      paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
      notes: '', active: true,
      esProveedor: tipoContactoFilter === 'proveedores',
      vendedorId: '',
      codigo: '',
      tarifaId: '',
      defaultDiscounts: [0, 0, 0],
      dir3: { oficinaContable: '', organoGestor: '', unidadTramitadora: '' },
      tipoFiscal: '',
    });
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setCrearIgualmente(false);
    rellenoLugar.reiniciar();
    setForm({
      businessName: client.businessName, tradeName: client.tradeName, nif: client.nif,
      vatNumber: client.vatNumber || '',
      email: client.email, phone: client.phone, contactPerson: client.contactPerson,
      address: client.address, city: client.city, postalCode: client.postalCode,
      province: client.province, country: client.country || 'ES',
      paymentDays: client.paymentDays, defaultPaymentMethod: client.defaultPaymentMethod,
      notes: client.notes, active: client.active,
      esProveedor: client.esProveedor ?? false,
      vendedorId: client.vendedorId || '',
      codigo: client.codigo || '',
      tarifaId: client.tarifaId || '',
      defaultDiscounts: client.defaultDiscounts || [0, 0, 0],
      dir3: {
        oficinaContable: client.dir3?.oficinaContable || '',
        organoGestor: client.dir3?.organoGestor || '',
        unidadTramitadora: client.dir3?.unidadTramitadora || '',
      },
      tipoFiscal: client.tipoFiscal ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async (forzar = false) => {
    if (!form.businessName || !form.nif) return;
    // Una ficha que ya existe: primero se ve el aviso; «Crear igualmente» guarda.
    if (!forzar && parecidas.length > 0) {
      avisoRepetida.current?.focus();
      return;
    }
    // Un NIF mal puesto aquí acaba en una factura que ya no se puede
    // corregir: con errores claros (formato, control, DNI con nombre de
    // sociedad…) no se guarda. Los avisos sí dejan guardar.
    const erroresNif = esClienteEspanol(form.country) && !form.vatNumber?.trim()
      ? comprobarNifYNombre(form.nif, form.businessName).filter(p => p.gravedad === 'error')
      : [];
    if (erroresNif.length > 0) {
      toastError('Revisa el NIF', erroresNif.map(e => e.mensaje).join(' '));
      return;
    }
    const client: Client = {
      // Se parte de la ficha guardada: lo que este formulario no enseña (su
      // grupo, su ruta, sus precios especiales…) no se puede perder al
      // guardar un cambio de teléfono.
      ...(editingClient ?? {}),
      id: editingClient?.id || generateId(),
      ...form,
      codigo: form.codigo.trim(),
      vatNumber: form.vatNumber ? form.vatNumber.trim().toUpperCase() : undefined,
      vendedorId: form.vendedorId || undefined,
      tarifaId: form.tarifaId || undefined,
      defaultDiscounts: form.defaultDiscounts,
      dir3: limpiarDir3(form.dir3),
      tipoFiscal: form.tipoFiscal || undefined,
      createdAt: editingClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistClient(client);
      await reload();
      setShowModal(false);
      const tipoTxt = client.esProveedor ? 'Proveedor' : 'Cliente';
      success(editingClient ? `${tipoTxt} actualizado` : `${tipoTxt} creado`, form.tradeName || form.businessName);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  // Sin «¿seguro?»: la ficha sale de la lista y el aviso ofrece deshacer
  // unos segundos; el borrado de verdad espera a que pasen
  // (lib/borradoDiferido). Sus facturas no se tocan nunca.
  const handleDelete = (client: Client) => {
    const nombre = client.tradeName || client.businessName;
    const volverAPintar = () => setOcultos(prev => { const s = new Set(prev); s.delete(client.id); return s; });
    setOcultos(prev => new Set(prev).add(client.id));
    const borrado = programarBorrado(`cliente:${client.id}`, async () => {
      await removeClient(client.id);
      olvidarFicha(cuenta, `cliente:${client.id}`);
    }, {
      alTerminar: () => { void reload().then(volverAPintar); },
      alFallar: e => {
        volverAPintar();
        toastError('No se ha podido eliminar', `${nombre}: ${e instanceof Error ? e.message : 'error desconocido'}`);
      },
    });
    const facturas = clientStats.get(client.id)?.count ?? 0;
    addToast({
      type: 'info',
      title: client.esProveedor ? 'Proveedor eliminado' : 'Cliente eliminado',
      message: facturas > 0 ? `${nombre}. Sus ${facturas} facturas se quedan como están.` : nombre,
      duration: ESPERA_DESHACER_MS,
      accion: { etiqueta: 'Deshacer', alPulsar: () => { if (borrado.deshacer()) volverAPintar(); } },
    });
  };

  const updateForm = (field: string, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateDefaultDiscount = (index: number, val: number) => {
    setForm(prev => {
      const next: [number, number, number] = [...prev.defaultDiscounts];
      next[index] = val;
      return { ...prev, defaultDiscounts: next };
    });
  };

  // «+» de Clientes o Proveedores en el menú de Mantenimientos.
  useNuevoDeLaDireccion(mounted, () => {
    openCreateModal();
    if (tipoContactoFilter === 'proveedores') setForm(f => ({ ...f, esProveedor: true }));
  });

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando los clientes" />;
  }

  const activeCount = clients.filter(c => c.active).length;
  const totalClientRevenue = invoices.filter(i => i.status !== 'anulada').reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="animate-fade-in pantalla-lista">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Clientes</h1>
          {clients.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(clients.length)} /></span>
                <span className="page-meta-label">en ficha</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value is-success"><CifraQueCuenta texto={String(activeCount)} /></span>
                <span className="page-meta-label">activos</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(formatCurrency(totalClientRevenue))} /></span>
                <span className="page-meta-label">facturación acumulada</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-ghost btn-icon"
            onClick={reload}
            disabled={refreshing}
            title="Refrescar clientes en tiempo real"
            aria-label="Refrescar lista"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link href="/importar" className="btn btn-secondary" title="Traer clientes desde otro programa (Excel o CSV)">
            <Upload size={16} /> Importar
          </Link>
          <span className="neon accion-neon">
            <button className="btn btn-primary" onClick={openCreateModal}>
              <Plus size={16} /> Nuevo cliente
            </button>
          </span>
        </div>
      </div>

      <div className="segmentos fila-desplazable" role="group" aria-label="Qué fichas ver" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          className="btn btn-sm"
          aria-pressed={tipoContactoFilter === 'todos'}
          onClick={() => setTipoContactoFilter('todos')}
        >
          Todos <span className="segmentos-num">{clients.length}</span>
        </button>
        <button
          className="btn btn-sm"
          aria-pressed={tipoContactoFilter === 'clientes'}
          onClick={() => setTipoContactoFilter('clientes')}
        >
          Clientes <span className="segmentos-num">{clients.filter(c => !c.esProveedor).length}</span>
        </button>
        <button
          className="btn btn-sm"
          aria-pressed={tipoContactoFilter === 'proveedores'}
          onClick={() => setTipoContactoFilter('proveedores')}
        >
          Proveedores <span className="segmentos-num">{clients.filter(c => c.esProveedor).length}</span>
        </button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="search-box">
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Buscar por nombre, NIF, email o ciudad..."
            aria-label="Buscar clientes"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Borrar la búsqueda" title="Borrar">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="table table--sortable tabla-tarjetas">
          <thead>
            <tr>
              <th
                className={sortField === 'nif' ? 'sorted' : ''}
                aria-sort={sortField === 'nif' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('nif')} title="Ordenar por NIF/CIF">
                  NIF/CIF {sortIcon('nif')}
                </button>
              </th>
              <th
                className={sortField === 'name' ? 'sorted' : ''}
                aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('name')} title="Ordenar por nombre comercial">
                  Nombre comercial {sortIcon('name')}
                </button>
              </th>
              <th>Tipo</th>
              <th>Tarifa / dtos.</th>
              <th
                className={sortField === 'city' ? 'sorted' : ''}
                aria-sort={sortField === 'city' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('city')} title="Ordenar por ciudad">
                  Ciudad {sortIcon('city')}
                </button>
              </th>
              <th
                className={sortField === 'email' ? 'sorted' : ''}
                aria-sort={sortField === 'email' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('email')} title="Ordenar por contacto / email">
                  Contacto {sortIcon('email')}
                </button>
              </th>
              <th
                className={sortField === 'invoiceCount' ? 'sorted' : ''}
                aria-sort={sortField === 'invoiceCount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('invoiceCount')} title="Ordenar por número de facturas">
                  Facturas {sortIcon('invoiceCount')}
                </button>
              </th>
              <th
                className={sortField === 'total' ? 'sorted' : ''}
                aria-sort={sortField === 'total' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                style={{ textAlign: 'right', }}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('total')} title="Ordenar por total facturado">
                  Total facturado {sortIcon('total')}
                </button>
              </th>
              <th>Estado</th>
              <th style={{ width: 120 }}><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {paginado.visibles.map(client => {
              const stats = getClientStats(client.id);
              const matchedTarifa = settings?.tarifas?.find(t => t.id === client.tarifaId);
              const hasDiscounts = client.defaultDiscounts && (client.defaultDiscounts[0] > 0 || client.defaultDiscounts[1] > 0 || client.defaultDiscounts[2] > 0);

              return (
                <tr key={client.id}>
                  <td className="mono" data-m="dato" data-label="NIF">{client.nif}</td>
                  <td className="primary" data-m="titulo">
                    <Link href={`/clientes/${client.id}`} className="cell-link">
                      {client.codigo && <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 'var(--space-2)' }}>{client.codigo}</span>}
                      {client.tradeName || client.businessName}
                    </Link>
                    {client.tradeName && <span className="cell-sub">{client.businessName}</span>}
                  </td>
                  <td data-m="dato">
                    <span className={`badge ${client.esProveedor ? 'badge-warning' : 'badge-neutral'}`}>
                      {client.esProveedor ? 'Proveedor' : 'Cliente'}
                    </span>
                  </td>
                  <td data-m="oculto">
                    {matchedTarifa ? (
                      <span className="badge badge-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Tag size={11} /> {matchedTarifa.nombre}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Tarifa base</span>
                    )}
                    {hasDiscounts && (
                      <span className="badge badge-info" style={{ marginLeft: '4px', fontSize: '10px' }}>
                        {[client.defaultDiscounts![0], client.defaultDiscounts![1], client.defaultDiscounts![2]].filter(d => d > 0).map(d => `${d}%`).join('+')}
                      </span>
                    )}
                  </td>
                  <td data-m="dato">{client.city}</td>
                  <td data-m="oculto">
                    {client.contactPerson}
                    {client.phone && <span className="cell-sub">{client.phone}</span>}
                  </td>
                  <td data-m="dato" data-label="Facturas">{stats.count}</td>
                  <td className="amount" data-m="importe">{formatCurrency(stats.total)}</td>
                  <td data-m="estado">
                    <span className={`badge ${client.active ? 'badge-activo' : 'badge-inactivo'}`}>
                      {client.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td data-m="acciones">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Link href={`/clientes/${client.id}`} className="btn btn-ghost btn-xs" aria-label={`Ver la ficha de ${client.tradeName || client.businessName}`} title="Ver ficha">
                        <Eye size={14} />
                      </Link>
                      <EnlacePortal compacto clientId={client.id} clienteNombre={client.businessName} telefono={client.phone} email={client.email} />
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => openEditModal(client)} aria-label={`Editar ${client.tradeName || client.businessName}`} title="Editar">
                        <Edit size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDelete(client)} aria-label={`Eliminar ${client.tradeName || client.businessName}`} title="Eliminar">
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <TableEmpty
                colSpan={10}
                icon={SearchX}
                title="No hay clientes que coincidan"
                hint="Prueba a cambiar el término de búsqueda o limpia el filtro."
              />
            )}
          </tbody>
        </table>
        <Paginacion paginado={paginado} etiqueta={tipoContactoFilter === 'proveedores' ? 'proveedores' : tipoContactoFilter === 'clientes' ? 'clientes' : 'fichas'} />
      </div>

      {/* Las gráficas van después de la lista: a esta pantalla se viene a
          buscar una ficha, y con ellas arriba había que bajar para llegar. */}
      <div className="dashboard-grid" style={{ marginTop: 'var(--space-6)' }}>
        <ChartCard title={tituloTop} subtitle={subtituloTop}>
          <div className="top-terceros-filtros">
            <select
              className="form-select form-select-sm"
              aria-label="Tipo de documento"
              value={tipoTop}
              onChange={e => setTipoTop(e.target.value as TipoHistorico)}
            >
              {TIPOS_RANKING.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            {origenHistorico && (
              <select
                className="form-select form-select-sm"
                aria-label="Origen de los documentos"
                value={origenTop}
                onChange={e => setOrigenTop(e.target.value)}
              >
                <option value="klima">Klima</option>
                <option value={origenHistorico}>{NOMBRE_ORIGEN[origenHistorico] ?? origenHistorico}</option>
              </select>
            )}
          </div>
          {cargandoTop ? (
            <div className="empty-state-card" aria-busy="true">Sumando el historial…</div>
          ) : topClientsData.length > 0 ? (
            <RankedBars data={topClientsData} color={accent} />
          ) : (
            <div className="empty-state-card">Sin {nombreTipoTop} que sumar</div>
          )}
        </ChartCard>

        <ChartCard
          title="Formas de pago preferidas"
          subtitle={tipoContactoFilter === 'proveedores' ? 'Cómo se paga a tus proveedores'
            : tipoContactoFilter === 'clientes' ? 'Cómo te pagan tus clientes' : 'Clientes y proveedores, según su ficha'}
          height={200}
          isEmpty={reparto.length === 0}
          emptyLabel="Sin fichas todavía"
          legend={
            <ChartLegend
              enLista
              items={reparto.map((d, i) => ({
                name: d.nombre,
                value: `${d.cuantos.toLocaleString('es-ES')} · ${d.porcentaje}`,
                color: SERIES[i % SERIES.length],
              }))}
            />
          }
        >
          <StatusDonut
            data={reparto.map((d, i) => ({ name: d.nombre, value: d.cuantos, color: SERIES[i % SERIES.length] }))}
            centerLabel={quienes[1]}
            centerValue={contactosDeLaPestana.length.toLocaleString('es-ES')}
            unidad={quienes}
          />
        </ChartCard>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingClient ? 'Editar contacto' : 'Nuevo contacto'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="pegar-datos-fila">
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPegandoDatos(true)}>
                  <ClipboardPaste size={13} aria-hidden /> Pegar datos
                </button>
                <span className="form-hint">La firma de un correo o un WhatsApp con los datos: se rellena solo.</span>
              </div>
              {pegandoDatos && (
                <PegarDatosFicha
                  actual={Object.fromEntries((Object.keys(CASILLA_DE) as CampoFicha[]).map(c => [c, String(form[CASILLA_DE[c]] ?? '')]))}
                  onAplicar={aplicarPegado}
                  onCerrar={() => setPegandoDatos(false)}
                />
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Razón social / nombre fiscal</label>
                  <input className="form-input" value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} placeholder="Ej: Acme Solutions S.L." />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre comercial (opcional)</label>
                  <input className="form-input" value={form.tradeName} onChange={e => updateForm('tradeName', e.target.value)} placeholder="Ej: Acme" />
                </div>
                <div className="form-group">
                  <label className="form-label">Código (opcional)</label>
                  <input className="form-input mono" value={form.codigo} onChange={e => updateForm('codigo', e.target.value)} placeholder="Ej: 260" autoComplete="off" />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required">NIF / CIF / NIE</label>
                  <input
                    className={`form-input mono ${problemasDeFicha(form.nif, form.businessName, form.country).some(p => p.gravedad === 'error') ? 'is-invalid' : ''}`}
                    value={form.nif}
                    onChange={e => updateForm('nif', e.target.value.toUpperCase())}
                    placeholder="B12345674"
                    autoComplete="off"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email de facturación</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="facturacion@acme.es" />
                </div>
              </div>
              <AvisoFichaRepetida
                ref={avisoRepetida}
                parecidas={parecidas}
                href={f => `/clientes/${f.id}`}
                onCrearIgualmente={() => { setCrearIgualmente(true); void handleSave(true); }}
              />
              <ComprobacionIdentidad
                nif={form.nif}
                nombre={form.businessName}
                pais={form.country}
                onUsarNombre={n => updateForm('businessName', n)}
              />
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Teléfono de contacto</label>
                  <input className="form-input" value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+34 600 000 000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Persona de contacto</label>
                  <input className="form-input" value={form.contactPerson} onChange={e => updateForm('contactPerson', e.target.value)} placeholder="María García" />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Dirección fiscal</label>
                <input className="form-input" value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="Calle Mayor 12, 3º B" />
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-input" value={form.city} onChange={e => updateForm('city', e.target.value)} placeholder="Madrid" />
                </div>
                <div className="form-group">
                  <label className="form-label">Código postal</label>
                  <input className="form-input mono" inputMode="numeric" value={form.postalCode} onChange={e => cambiarCp(e.target.value)} placeholder="35500" />
                </div>
                <div className="form-group">
                  <label className="form-label">País</label>
                  <select
                    className="form-select"
                    value={form.country}
                    onChange={e => updateForm('country', e.target.value)}
                  >
                    {PAISES_SELECTOR.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {form.country === 'ES' ? (
                  <div className="form-group">
                    <label className="form-label">Provincia</label>
                    <select className="form-select" value={form.province} onChange={e => updateForm('province', e.target.value)}>
                      <option value="">Selecciona provincia</option>
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">
                      NIF-IVA (VAT) {esPaisUeNoEspana(form.country) && <span style={{ color: 'var(--color-primary)', fontSize: 'var(--text-xs)' }}>· UE</span>}
                    </label>
                    <input
                      className="form-input mono"
                      value={form.vatNumber}
                      onChange={e => updateForm('vatNumber', e.target.value.toUpperCase())}
                      placeholder={form.country === 'FR' ? 'FR12345678901' : form.country === 'DE' ? 'DE123456789' : 'Prefijo + número'}
                    />
                  </div>
                )}
              </div>

              {form.country === 'ES' && (
                <MunicipiosParaElegir municipios={rellenoLugar.elegir} onElegir={rellenoLugar.elegirMunicipio} />
              )}

              {!form.esProveedor && (
                <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                  <label className="form-label" htmlFor="cliente-tipo-fiscal">Tipo de cliente</label>
                  <select id="cliente-tipo-fiscal" className="form-select" value={form.tipoFiscal}
                    onChange={e => updateForm('tipoFiscal', e.target.value as typeof form.tipoFiscal)}>
                    <option value="">Según el NIF ({NOMBRE_TIPO_FISCAL[tipoFiscalDe({ nif: form.nif, dir3: form.dir3 })].toLowerCase()})</option>
                    {(Object.keys(NOMBRE_TIPO_FISCAL) as (keyof typeof NOMBRE_TIPO_FISCAL)[]).map(t => <option key={t} value={t}>{NOMBRE_TIPO_FISCAL[t]}</option>)}
                  </select>
                  <p className="form-hint">
                    A empresas y autónomos se les factura con factura electrónica (obligatoria entre empresas). Con un DNI no se puede saber si es
                    un particular o un autónomo: si es autónomo, márcalo aquí.
                  </p>
                </div>
              )}

              <details style={{ marginTop: 'var(--space-3)' }} open={Boolean(form.dir3.oficinaContable || form.dir3.organoGestor || form.dir3.unidadTramitadora)}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  ¿Es una Administración pública? Códigos DIR3 para FACe
                </summary>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', margin: 'var(--space-2) 0' }}>
                  Ayuntamientos, diputaciones y ministerios solo aceptan la factura electrónica (Facturae) con sus tres códigos DIR3. Te los dan en el pedido o el contrato.
                </p>
                <div className="form-row">
                  {([
                    ['oficinaContable', 'Oficina contable'],
                    ['organoGestor', 'Órgano gestor'],
                    ['unidadTramitadora', 'Unidad tramitadora'],
                  ] as const).map(([campo, etiqueta]) => (
                    <div className="form-group" key={campo}>
                      <label className="form-label">{etiqueta}</label>
                      <input
                        className="form-input mono"
                        value={form.dir3[campo]}
                        onChange={e => updateForm('dir3', { ...form.dir3, [campo]: e.target.value.toUpperCase().replace(/\s/g, '') })}
                        placeholder="L01460001"
                        maxLength={20}
                      />
                    </div>
                  ))}
                </div>
              </details>

              <div className="form-row" style={{ marginTop: 'var(--space-4)', background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tarifa de precios</label>
                  <select
                    className="form-select"
                    value={form.tarifaId}
                    onChange={e => updateForm('tarifaId', e.target.value)}
                  >
                    <option value="">-- Tarifa estándar / base --</option>
                    {settings?.tarifas?.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} {t.porcentajeDefecto !== undefined ? `(${t.porcentajeDefecto > 0 ? `+${t.porcentajeDefecto}%` : `${t.porcentajeDefecto}%`})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Descuentos en línea por defecto (hasta 3 en cascada)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto. 1 (%)"
                      value={form.defaultDiscounts[0] || ''}
                      onChange={e => updateDefaultDiscount(0, parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto. 2 (%)"
                      value={form.defaultDiscounts[1] || ''}
                      onChange={e => updateDefaultDiscount(1, parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto. 3 (%)"
                      value={form.defaultDiscounts[2] || ''}
                      onChange={e => updateDefaultDiscount(2, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Vendedor asignado</label>
                  <select
                    className="form-select"
                    value={form.vendedorId}
                    onChange={e => updateForm('vendedorId', e.target.value)}
                  >
                    <option value="">-- Sin vendedor asignado --</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'center', marginTop: 'var(--space-4)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.esProveedor}
                      onChange={e => updateForm('esProveedor', e.target.checked)}
                    />
                    <span style={{ fontWeight: 600 }}>Es un proveedor (para compras)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => void handleSave()}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Suspense: la pantalla lee de la dirección la pestaña y el «nuevo» que
// pide el menú de Mantenimientos (hooks/useDireccion).
export default function ClientesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" label="Cargando los clientes" />}>
      <ClientesPageContenido />
    </Suspense>
  );
}
