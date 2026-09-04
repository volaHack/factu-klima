'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe, Download, AlertTriangle, Info, FileText,
  Search, Filter, X, ChevronUp, ChevronDown, CheckCircle2,
  ExternalLink, Copy, Check, FileSpreadsheet,
  PackageCheck, ShoppingBag, Briefcase, ChevronRight, Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import type { Invoice, CompanySettings } from '@/lib/types';
import {
  generarDatos349, generarFichero349,
  calcularResumenIntracomunitarias, validarVatNumber,
  tipoOperacion349,
  type Operacion349, type ClaveOperacion349,
} from '@/lib/intracomunitarias';
import { PAISES_UE } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

// ============================================================
// TIPOS Y CONSTANTES
// ============================================================

type SortField = 'codigoPais' | 'vatNumber' | 'nombreRazon' | 'claveOperacion' | 'baseImponible';
type ClaveFilter = 'all' | ClaveOperacion349;

const CLAVE_FILTER_OPTIONS: { value: ClaveFilter; label: string; keyName: string; color: string }[] = [
  { value: 'all', label: 'Todas las claves', keyName: 'Todas', color: 'var(--color-primary)' },
  { value: 'E', label: 'Entregas (E)', keyName: 'E', color: 'var(--color-success, #10b981)' },
  { value: 'A', label: 'Adquisiciones (A)', keyName: 'A', color: 'var(--color-info, #06b6d4)' },
  { value: 'S', label: 'Servicios prestados (S)', keyName: 'S', color: 'var(--color-warning, #f59e0b)' },
  { value: 'I', label: 'Servicios adquiridos (I)', keyName: 'I', color: '#8b5cf6' },
  { value: 'T', label: 'Triangulares (T)', keyName: 'T', color: '#ec4899' },
];

function claveLabel(clave: string): string {
  const map: Record<string, string> = {
    E: 'Entregas de bienes',
    A: 'Adquisiciones de bienes',
    T: 'Triangulares',
    S: 'Servicios prestados',
    I: 'Servicios adquiridos',
  };
  return map[clave] || clave;
}

function claveBadgeStyle(clave: string): { bg: string; text: string; border: string } {
  switch (clave) {
    case 'E':
      return {
        bg: 'rgba(16, 185, 129, 0.12)',
        text: 'var(--color-success, #10b981)',
        border: 'rgba(16, 185, 129, 0.3)',
      };
    case 'A':
      return {
        bg: 'rgba(6, 182, 212, 0.12)',
        text: 'var(--color-info, #06b6d4)',
        border: 'rgba(6, 182, 212, 0.3)',
      };
    case 'S':
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        text: 'var(--color-warning, #f59e0b)',
        border: 'rgba(245, 158, 11, 0.3)',
      };
    case 'I':
      return {
        bg: 'rgba(139, 92, 246, 0.12)',
        text: '#8b5cf6',
        border: 'rgba(139, 92, 246, 0.3)',
      };
    case 'T':
      return {
        bg: 'rgba(236, 72, 153, 0.12)',
        text: '#ec4899',
        border: 'rgba(236, 72, 153, 0.3)',
      };
    default:
      return {
        bg: 'var(--bg-tertiary)',
        text: 'var(--text-secondary)',
        border: 'var(--border-color)',
      };
  }
}

function getCountryFlag(code: string): string {
  if (!code || code.length !== 2) return '🇪🇺';
  const isoCode = code.toUpperCase() === 'EL' ? 'GR' : code.toUpperCase();
  return isoCode.replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getCountryName(code: string): string {
  const p = PAISES_UE.find(item => item.codigo === code.toUpperCase());
  return p ? p.nombre : code;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function IntracomunitariasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  // Periodo seleccionado
  const hoy = new Date();
  const [ejercicio, setEjercicio] = useState(hoy.getFullYear());
  const [trimestre, setTrimestre] = useState(Math.ceil((hoy.getMonth() + 1) / 3));
  const periodoLabel = `${trimestre}T ${ejercicio}`;

  // Filtros, búsqueda y ordenación
  const [search, setSearch] = useState('');
  const [claveFilter, setClaveFilter] = useState<ClaveFilter>('all');
  const [sortField, setSortField] = useState<SortField>('baseImponible');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [allInvoices, cs] = await Promise.all([getInvoices(), getCompanySettings()]);
      setInvoices(allInvoices);
      setSettings(cs);
      setMounted(true);
    })();
  }, []);

  const resumen = useMemo(() => calcularResumenIntracomunitarias(invoices), [invoices]);

  const datos349 = useMemo(
    () => generarDatos349(invoices, ejercicio, `${trimestre}T`),
    [invoices, ejercicio, trimestre],
  );

  // Descarga fichero oficial BOE
  const descargar349 = () => {
    if (!settings) return;
    const fichero = generarFichero349(datos349, settings);
    const blob = new Blob([fichero], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo_349_${datos349.ejercicio}_${datos349.periodo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar a CSV compatible con gestorías y Excel
  const exportarCsv = () => {
    const headers = ['País', 'NIF-IVA', 'Nombre/Razón Social', 'Clave Operación', 'Descripción Clave', 'Base Imponible (€)'];
    const rows = filteredOperaciones.map(op => [
      op.codigoPais,
      `${op.codigoPais}${op.vatNumber}`,
      `"${(op.nombreRazon || '').replace(/"/g, '""')}"`,
      op.claveOperacion,
      `"${claveLabel(op.claveOperacion)}"`,
      op.baseImponible.toFixed(2),
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo_349_${datos349.ejercicio}_${datos349.periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copiar resumen al portapapeles
  const copiarResumen = async () => {
    const texto = `RESUMEN MODELO 349 — ${periodoLabel}\n` +
      `========================================\n` +
      `Entregas de bienes (E): ${formatCurrency(resumen.totalEntregas)}\n` +
      `Adquisiciones de bienes (A): ${formatCurrency(resumen.totalAdquisiciones)}\n` +
      `Servicios (S/I): ${formatCurrency(resumen.totalServicios)}\n` +
      `Total Operadores: ${datos349.totalOperaciones}\n` +
      `Total Base Imponible: ${formatCurrency(datos349.totalBaseImponible)}\n\n` +
      `OPERADORES:\n` +
      datos349.operaciones.map(op =>
        `• [${op.codigoPais}] ${op.codigoPais}${op.vatNumber} — ${op.nombreRazon} (Clave ${op.claveOperacion}: ${claveLabel(op.claveOperacion)}): ${formatCurrency(op.baseImponible)}`
      ).join('\n');

    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  // Filtrar operaciones
  const filteredOperaciones = useMemo(() => {
    let list = datos349.operaciones;

    // Filtro por clave
    if (claveFilter !== 'all') {
      list = list.filter(op => op.claveOperacion === claveFilter);
    }

    // Búsqueda textual
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(op => {
        const vatCompleto = `${op.codigoPais}${op.vatNumber}`.toLowerCase();
        const paisNombre = getCountryName(op.codigoPais).toLowerCase();
        return (
          vatCompleto.includes(q) ||
          op.nombreRazon.toLowerCase().includes(q) ||
          op.codigoPais.toLowerCase().includes(q) ||
          paisNombre.includes(q)
        );
      });
    }

    // Ordenación
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'codigoPais':
          cmp = a.codigoPais.localeCompare(b.codigoPais);
          break;
        case 'vatNumber':
          cmp = a.vatNumber.localeCompare(b.vatNumber);
          break;
        case 'nombreRazon':
          cmp = a.nombreRazon.localeCompare(b.nombreRazon);
          break;
        case 'claveOperacion':
          cmp = a.claveOperacion.localeCompare(b.claveOperacion);
          break;
        case 'baseImponible':
          cmp = a.baseImponible - b.baseImponible;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [datos349.operaciones, claveFilter, search, sortField, sortDir]);

  // Total base filtrada
  const totalBaseFiltrada = useMemo(() => {
    return filteredOperaciones.reduce((sum, op) => sum + op.baseImponible, 0);
  }, [filteredOperaciones]);

  // Toggle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'baseImponible' ? 'desc' : 'asc');
    }
  };

  // Obtener facturas de un operador
  const getInvoicesForOperator = useCallback((op: Operacion349) => {
    const qStartMonth = (trimestre - 1) * 3 + 1;
    const qEndMonth = trimestre * 3;
    const startPrefix = `${ejercicio}-${String(qStartMonth).padStart(2, '0')}`;
    const endPrefix = `${ejercicio}-${String(qEndMonth).padStart(2, '0')}`;

    return invoices.filter(inv => {
      if (!inv.esIntracomunitaria || !inv.clientVatNumber) return false;
      if (inv.status === 'borrador' || inv.status === 'anulada') return false;
      if (inv.tipo === 'presupuesto' || inv.tipo === 'pedido' || inv.tipo === 'albaran') return false;

      const vat = inv.clientVatNumber.toUpperCase();
      const targetVat = `${op.codigoPais}${op.vatNumber}`.toUpperCase();
      if (vat !== targetVat) return false;

      const d = inv.issueDate;
      return d >= `${startPrefix}-01` && d <= `${endPrefix}-31`;
    });
  }, [invoices, trimestre, ejercicio]);

  if (!mounted) return <PageSkeleton variant="list" label="Cargando operaciones intracomunitarias" />;

  const totalDistribucion = resumen.totalEntregas + resumen.totalAdquisiciones + resumen.totalServicios;
  const pctEntregas = totalDistribucion > 0 ? (resumen.totalEntregas / totalDistribucion) * 100 : 0;
  const pctAdquisiciones = totalDistribucion > 0 ? (resumen.totalAdquisiciones / totalDistribucion) * 100 : 0;
  const pctServicios = totalDistribucion > 0 ? (resumen.totalServicios / totalDistribucion) * 100 : 0;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Globe size={24} style={{ color: 'var(--color-primary)' }} />
              Operaciones intracomunitarias
            </h1>
            <span
              className="badge"
              style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
              }}
            >
              Modelo 349
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: 'var(--space-1) 0 0 0' }}>
            Ventas y compras intracomunitarias con la Unión Europea exentas de IVA (inversión sujeto pasivo).
          </p>
        </div>

        {/* Controles de Periodo y Acciones */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="periodo-349">
            <select
              className="form-select"
              value={ejercicio}
              onChange={e => setEjercicio(Number(e.target.value))}
              aria-label="Ejercicio a declarar"
            >
              {[hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <div className="periodo-349-trimestres" role="group" aria-label="Trimestre a declarar">
              {[1, 2, 3, 4].map(t => (
                <button
                  key={t}
                  type="button"
                  className={`periodo-349-t ${trimestre === t ? 'activo' : ''}`}
                  aria-pressed={trimestre === t}
                  onClick={() => setTrimestre(t)}
                >
                  {t}T
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={copiarResumen}
              title="Copiar resumen para la gestoría"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? <Check size={15} style={{ color: 'var(--color-success)' }} /> : <Copy size={15} />}
              {copied ? 'Copiado' : 'Copiar resumen'}
            </button>

            {datos349.totalOperaciones > 0 && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={exportarCsv}
                  title="Descargar archivo CSV compatible con Excel"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FileSpreadsheet size={15} /> CSV
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={descargar349}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Download size={15} /> Descargar 349 (BOE)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status Panel informativo */}
      <div className="status-panel status-panel--info" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="status-panel-icon"><Info size={18} /></span>
        <div className="status-panel-body">
          <div className="status-panel-title">Presentación telemática del Modelo 349</div>
          <p className="status-panel-text">
            Se declara trimestralmente durante el mes siguiente al fin de cada periodo (ej. 1T en abril, 2T en julio, 3T en octubre, 4T en enero).
            Las entregas de bienes van <strong>sin IVA</strong> y se comprueba la validez del NIF-IVA en el censo <strong>VIES</strong>.
          </p>
        </div>
      </div>

      {/* KPIs con micro-animaciones */}
      <div
        className="kpi-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-success, #10b981)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Entregas de bienes (E)</span>
            <span className="kpi-card-icon"><PackageCheck size={18} /></span>
          </div>
          <span className="kpi-card-value">{formatCurrency(resumen.totalEntregas)}</span>
          <span className="kpi-card-sub">Ventas comunitarias exentas art. 25</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-info, #06b6d4)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Adquisiciones bienes (A)</span>
            <span className="kpi-card-icon"><ShoppingBag size={18} /></span>
          </div>
          <span className="kpi-card-value">{formatCurrency(resumen.totalAdquisiciones)}</span>
          <span className="kpi-card-sub">Compras comunitarias declaradas</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Servicios (S / I)</span>
            <span className="kpi-card-icon"><Briefcase size={18} /></span>
          </div>
          <span className="kpi-card-value">{formatCurrency(resumen.totalServicios)}</span>
          <span className="kpi-card-sub">Prestaciones y adquisiciones</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-primary)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Operadores en {periodoLabel}</span>
            <span className="kpi-card-icon"><Layers size={18} /></span>
          </div>
          <span className="kpi-card-value">{datos349.totalOperaciones}</span>
          <span className="kpi-card-sub">Total {formatCurrency(datos349.totalBaseImponible)}</span>
        </motion.div>
      </div>

      {/* Visual Distribution Bar */}
      {totalDistribucion > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              Distribución económica del periodo ({periodoLabel})
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Total: <strong>{formatCurrency(totalDistribucion)}</strong>
            </span>
          </div>

          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: 'var(--bg-tertiary)',
              display: 'flex',
              overflow: 'hidden',
              gap: 2,
              marginBottom: 'var(--space-3)',
            }}
          >
            {pctEntregas > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctEntregas}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: 'var(--color-success, #10b981)', height: '100%' }}
                title={`Entregas (E): ${pctEntregas.toFixed(1)}%`}
              />
            )}
            {pctAdquisiciones > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctAdquisiciones}%` }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: 'var(--color-info, #06b6d4)', height: '100%' }}
                title={`Adquisiciones (A): ${pctAdquisiciones.toFixed(1)}%`}
              />
            )}
            {pctServicios > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctServicios}%` }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: '#8b5cf6', height: '100%' }}
                title={`Servicios (S/I): ${pctServicios.toFixed(1)}%`}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-xs)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success, #10b981)' }} />
              Entregas de bienes: <strong>{pctEntregas.toFixed(1)}%</strong> ({formatCurrency(resumen.totalEntregas)})
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-info, #06b6d4)' }} />
              Adquisiciones: <strong>{pctAdquisiciones.toFixed(1)}%</strong> ({formatCurrency(resumen.totalAdquisiciones)})
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
              Servicios: <strong>{pctServicios.toFixed(1)}%</strong> ({formatCurrency(resumen.totalServicios)})
            </span>
          </div>
        </div>
      )}

      {/* Alerta si hay facturas incompletas */}
      {resumen.facturasIncompletas > 0 && (
        <div className="status-panel status-panel--warning" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="status-panel-icon"><AlertTriangle size={18} /></span>
          <div className="status-panel-body">
            <div className="status-panel-title">
              {resumen.facturasIncompletas} factura{resumen.facturasIncompletas !== 1 ? 's' : ''} sin NIF-IVA excluidas del Modelo 349
            </div>
            <p className="status-panel-text">
              Para entrar en el Modelo 349 telemático, el cliente o proveedor de la UE debe tener su NIF-IVA (VAT Number) indicado en su ficha.
              Asigna el identificador fiscal europeo para que se computen automáticamente en el fichero BOE.
            </p>
          </div>
        </div>
      )}

      {/* Tabla de operadores */}
      <div className="card">
        {/* Barra de Búsqueda y Filtros */}
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 400 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Buscar por operador, NIF-IVA o país..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: '100%' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Chips de filtro por Clave */}
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Filter size={12} /> Clave:
              </span>
              {CLAVE_FILTER_OPTIONS.map(opt => {
                const isActive = claveFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                    onClick={() => setClaveFilter(opt.value)}
                    style={isActive ? { borderColor: opt.color, color: opt.color } : {}}
                  >
                    {opt.keyName}
                  </button>
                );
              })}

              {(claveFilter !== 'all' || search) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setClaveFilter('all');
                    setSearch('');
                  }}
                  style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', height: 'auto' }}
                >
                  Quitar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contenedor de la Tabla */}
        <div className="table-container">
          <table className="table table--sortable">
            <thead>
              <tr>
                <th
                  onClick={() => handleSort('codigoPais')}
                  style={{ cursor: 'pointer', width: 90 }}
                  className={sortField === 'codigoPais' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>País</span>
                    {sortField === 'codigoPais' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('vatNumber')}
                  style={{ cursor: 'pointer', width: 170 }}
                  className={sortField === 'vatNumber' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>NIF-IVA (VAT)</span>
                    {sortField === 'vatNumber' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('nombreRazon')}
                  style={{ cursor: 'pointer' }}
                  className={sortField === 'nombreRazon' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Nombre / Razón Social</span>
                    {sortField === 'nombreRazon' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('claveOperacion')}
                  style={{ cursor: 'pointer', width: 190 }}
                  className={sortField === 'claveOperacion' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Clave 349</span>
                    {sortField === 'claveOperacion' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('baseImponible')}
                  style={{ cursor: 'pointer', textAlign: 'right', width: 160 }}
                  className={sortField === 'baseImponible' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>Base imponible</span>
                    {sortField === 'baseImponible' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th style={{ width: 44, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredOperaciones.length === 0 ? (
                datos349.operaciones.length === 0 ? (
                  <TableEmpty
                    colSpan={6}
                    icon={Globe}
                    title={`Sin operaciones en ${periodoLabel}`}
                    hint="No se han registrado facturas intracomunitarias en este trimestre. Al crear facturas a clientes de la UE con VAT Number, aparecerán aquí automáticamente."
                  />
                ) : (
                  <TableEmpty
                    colSpan={6}
                    icon={Filter}
                    title="No hay coincidencias con los filtros aplicados"
                    hint="Prueba a cambiar el término de búsqueda o selecciona otra clave de operación."
                    action={
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setSearch('');
                          setClaveFilter('all');
                        }}
                      >
                        Restablecer filtros
                      </button>
                    }
                  />
                )
              ) : (
                filteredOperaciones.map((op, i) => {
                  const vatCompleto = `${op.codigoPais}${op.vatNumber}`;
                  const rowKey = `${vatCompleto}_${op.claveOperacion}`;
                  const isExpanded = expandedKey === rowKey;
                  const badgeStyle = claveBadgeStyle(op.claveOperacion);
                  const validacionVat = validarVatNumber(vatCompleto);
                  const flag = getCountryFlag(op.codigoPais);
                  const countryName = getCountryName(op.codigoPais);
                  const operatorInvoices = isExpanded ? getInvoicesForOperator(op) : [];

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        style={{
                          cursor: 'pointer',
                          background: isExpanded ? 'var(--bg-card-hover)' : undefined,
                          transition: 'background var(--transition-fast)',
                        }}
                      >
                        {/* País */}
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '1.25rem', lineHeight: 1 }} role="img" aria-label={countryName}>
                              {flag}
                            </span>
                            <span className="badge" style={{ fontWeight: 700 }}>
                              {op.codigoPais}
                            </span>
                          </div>
                        </td>

                        {/* NIF-IVA */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <code style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.04em' }}>
                              {vatCompleto}
                            </code>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {validacionVat.valido ? (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--color-success)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                  title="Formato de NIF-IVA válido según especificación europea"
                                >
                                  <CheckCircle2 size={11} /> Sintaxis UE OK
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--color-warning)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                  title={validacionVat.error}
                                >
                                  <AlertTriangle size={11} /> Revisar formato
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Nombre / Razón */}
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {op.nombreRazon || 'Sin denominación'}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {countryName}
                          </div>
                        </td>

                        {/* Clave */}
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: badgeStyle.bg,
                              color: badgeStyle.text,
                              border: `1px solid ${badgeStyle.border}`,
                              fontWeight: 700,
                              marginRight: 6,
                            }}
                          >
                            {op.claveOperacion}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                            {claveLabel(op.claveOperacion)}
                          </span>
                        </td>

                        {/* Base imponible */}
                        <td className="amount" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <strong>{formatCurrency(op.baseImponible)}</strong>
                        </td>

                        {/* Indicador expandir */}
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: 'inline-flex' }}
                          >
                            <ChevronRight size={16} />
                          </motion.div>
                        </td>
                      </tr>

                      {/* Fila expandible con detalle */}
                      <AnimatePresence>
                        {isExpanded && (
                          <tr style={{ background: 'var(--bg-tertiary)' }}>
                            <td colSpan={6} style={{ padding: 0 }}>
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                style={{
                                  overflow: 'hidden',
                                  padding: 'var(--space-4) var(--space-5)',
                                  borderBottom: '1px solid var(--border-color)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 'var(--space-3)',
                                    flexWrap: 'wrap',
                                    gap: 'var(--space-2)',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <FileText size={15} style={{ color: 'var(--color-primary)' }} />
                                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                      Facturas incluidas de {op.nombreRazon} ({periodoLabel})
                                    </span>
                                    <span className="badge" style={{ fontSize: 'var(--text-xs)' }}>
                                      {operatorInvoices.length} factura{operatorInvoices.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <a
                                      href={`https://ec.europa.eu/taxation_customs/vies/#/vat-validation`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-ghost"
                                      style={{
                                        fontSize: 'var(--text-xs)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        color: 'var(--color-primary)',
                                      }}
                                      title="Comprobar validez en el censo oficial VIES de la Comisión Europea"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <ExternalLink size={13} /> Consultar en VIES Oficial
                                    </a>
                                  </div>
                                </div>

                                {operatorInvoices.length === 0 ? (
                                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
                                    No se han encontrado facturas individuales con este NIF para el periodo seleccionado.
                                  </p>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-2)' }}>
                                    {operatorInvoices.map(inv => (
                                      <div
                                        key={inv.id}
                                        style={{
                                          padding: 'var(--space-3)',
                                          background: 'var(--bg-elevated)',
                                          borderRadius: 'var(--radius-md)',
                                          border: '1px solid var(--border-color)',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Link
                                              href={`/facturas?search=${encodeURIComponent(inv.number)}`}
                                              onClick={e => e.stopPropagation()}
                                              style={{
                                                fontWeight: 700,
                                                fontSize: 'var(--text-sm)',
                                                color: 'var(--color-primary)',
                                                textDecoration: 'none',
                                              }}
                                            >
                                              {inv.number}
                                            </Link>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                              {formatDate(inv.issueDate)}
                                            </span>
                                          </div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 2 }}>
                                            {inv.tipoOperacion349 || tipoOperacion349(inv) || 'Operación'} — {inv.lineItems?.length ?? 1} líneas
                                          </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                                            {formatCurrency(inv.subtotal)}
                                          </div>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            0% IVA (art. 25)
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {filteredOperaciones.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>
                    Total base imponible ({filteredOperaciones.length} operador{filteredOperaciones.length !== 1 ? 'es' : ''}):
                  </td>
                  <td className="amount" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatCurrency(totalBaseFiltrada)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
