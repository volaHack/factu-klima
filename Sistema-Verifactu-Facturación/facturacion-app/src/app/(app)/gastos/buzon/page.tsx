'use client';

/**
 * BANDEJA DE FACTURAS DE PROVEEDORES
 *
 * Donde llegan las facturas de gasto sin teclearlas: arrastrando los PDF o
 * fotos de golpe (las del mes, por ejemplo) o reenviándolas al correo del
 * buzón. Cada una la lee la IA y queda rellena para revisar; con «Guardar»
 * pasa a Gastos. Nada se guarda sin que una persona lo vea.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, ExternalLink, FileText, Inbox, Loader2, Mail, Trash2, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import {
  contenidoBuzon, getBandejaBuzon, getCompanySettings, getProveedores, marcarBuzon, saveGasto,
} from '@/lib/storage';
import { CATEGORIAS_GASTO, calcularGasto, gastoVacio } from '@/lib/gastos';
import { blobDesdeBase64, imagenParaLeer, leerFactura } from '@/lib/buzon/leer';
import type { Client, Gasto, GastoCategoria } from '@/lib/types';
import { formatCurrency, generateId } from '@/lib/utils';

interface Datos {
  fecha: string;
  proveedorId?: string;
  proveedorNombre: string;
  nif?: string;
  concepto: string;
  categoria: GastoCategoria;
  base: number;
  tipo: number;
  cuota: number;
  total: number;
}

interface Elemento {
  clave: string;
  origen: 'correo' | 'subido';
  docId?: string;
  nombre: string;
  mime: string;
  remitente?: string | null;
  asunto?: string | null;
  fichero?: Blob;
  estado: 'esperando' | 'leyendo' | 'listo' | 'error' | 'guardando' | 'guardado';
  error?: string;
  datos?: Datos;
  avisos: string[];
}

const ADMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const hoy = () => new Date().toISOString().slice(0, 10);

export default function BuzonPage() {
  const { success, error: toastError } = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [cargado, setCargado] = useState(false);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [proveedores, setProveedores] = useState<Client[]>([]);
  const [igic, setIgic] = useState(false);
  const [direccion, setDireccion] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [docs, provs, ajustes, dir] = await Promise.all([
        getBandejaBuzon(), getProveedores(), getCompanySettings(),
        fetch('/api/buzon/direccion').then(r => r.json()).catch(() => ({ disponible: false })),
      ]);
      if (!vivo) return;
      setProveedores(provs);
      setIgic(!!ajustes?.igicEnabled);
      setDireccion(dir?.disponible ? dir.direccion : null);
      setElementos(docs.map(d => ({
        clave: d.id, origen: 'correo', docId: d.id, nombre: d.nombre, mime: d.mime, remitente: d.remitente, asunto: d.asunto,
        estado: 'esperando', avisos: [],
      })));
      setCargado(true);
    })();
    return () => { vivo = false; };
  }, []);

  const cambiar = useCallback((clave: string, parcial: Partial<Elemento>) => {
    setElementos(lista => lista.map(e => (e.clave === clave ? { ...e, ...parcial } : e)));
  }, []);

  const ficheroDe = useCallback(async (e: Elemento): Promise<Blob> => {
    if (e.fichero) return e.fichero;
    const blob = blobDesdeBase64(await contenidoBuzon(e.docId!), e.mime);
    cambiar(e.clave, { fichero: blob });
    return blob;
  }, [cambiar]);

  // De uno en uno: la IA tiene un límite por hora y así se ve avanzar.
  const siguiente = elementos.find(e => e.estado === 'esperando');
  const hayLeyendo = elementos.some(e => e.estado === 'leyendo');
  useEffect(() => {
    if (!cargado || !siguiente || hayLeyendo) return;
    const e = siguiente;
    queueMicrotask(() => cambiar(e.clave, { estado: 'leyendo' }));
    (async () => {
      try {
        const imagen = await imagenParaLeer(await ficheroDe(e), e.nombre);
        const t = await leerFactura(imagen, igic);
        const nombre = (t.proveedor ?? '').toLowerCase();
        const prov = proveedores.find(p => t.nif && p.nif?.toUpperCase() === t.nif)
          ?? (nombre ? proveedores.find(p => p.businessName.toLowerCase() === nombre || (p.tradeName ?? '').toLowerCase() === nombre) : undefined);
        cambiar(e.clave, {
          estado: 'listo',
          avisos: t.avisos,
          datos: {
            fecha: t.fecha || hoy(), proveedorId: prov?.id, proveedorNombre: prov?.businessName ?? t.proveedor ?? '', nif: t.nif,
            concepto: t.concepto || t.proveedor || e.nombre.replace(/\.[a-z]+$/i, ''), categoria: t.categoria,
            base: t.base, tipo: t.tipo, cuota: t.cuota, total: t.total,
          },
        });
      } catch (err) {
        cambiar(e.clave, { estado: 'error', error: err instanceof Error ? err.message : 'No se ha podido leer.' });
      }
    })();
  }, [cargado, siguiente, hayLeyendo, igic, proveedores, cambiar, ficheroDe]);

  const añadir = (ficheros: FileList | null) => {
    if (!ficheros?.length) return;
    const nuevos: Elemento[] = [];
    let raros = 0;
    for (const f of Array.from(ficheros)) {
      const esPdf = /\.pdf$/i.test(f.name);
      if (!ADMITIDOS.includes(f.type) && !esPdf) { raros++; continue; }
      nuevos.push({ clave: generateId(), origen: 'subido', nombre: f.name, mime: f.type || 'application/pdf', fichero: f, estado: 'esperando', avisos: [] });
    }
    if (raros) toastError(`${raros} ${raros === 1 ? 'fichero no es' : 'ficheros no son'} PDF ni foto`, 'Se han dejado fuera.');
    setElementos(l => [...nuevos, ...l]);
  };

  const cambiarDatos = (e: Elemento, parcial: Partial<Datos>) => {
    const d = { ...e.datos!, ...parcial };
    if ('base' in parcial || 'tipo' in parcial) {
      const c = calcularGasto(d.base, d.tipo);
      d.cuota = c.taxAmount;
      d.total = c.total;
    }
    cambiar(e.clave, { datos: d });
  };

  const guardar = async (e: Elemento): Promise<boolean> => {
    const d = e.datos;
    if (!d || !d.concepto.trim()) { toastError('Falta el concepto', e.nombre); return false; }
    cambiar(e.clave, { estado: 'guardando' });
    try {
      const ahora = new Date().toISOString();
      const gasto: Gasto = {
        ...gastoVacio(d.fecha),
        id: generateId(), createdAt: ahora, updatedAt: ahora,
        concepto: d.concepto.trim(), categoria: d.categoria,
        proveedorId: d.proveedorId, proveedorNombre: d.proveedorNombre || undefined,
        baseImponible: d.base, taxRate: d.tipo, taxAmount: d.cuota, total: d.total,
        notas: [e.origen === 'correo' ? `Recibida por correo${e.remitente ? ` de ${e.remitente}` : ''}` : `Desde ${e.nombre}`,
          d.nif && !d.proveedorId ? `NIF del proveedor: ${d.nif}` : ''].filter(Boolean).join('. '),
      };
      await saveGasto(gasto);
      if (e.docId) await marcarBuzon(e.docId, 'procesado', gasto.id);
      cambiar(e.clave, { estado: 'guardado' });
      return true;
    } catch (err) {
      cambiar(e.clave, { estado: 'listo' });
      toastError('No se ha podido guardar', err instanceof Error ? err.message : '');
      return false;
    }
  };

  const guardarTodos = async () => {
    let n = 0;
    for (const e of elementos.filter(x => x.estado === 'listo')) if (await guardar(e)) n++;
    if (n) success(`${n} ${n === 1 ? 'gasto guardado' : 'gastos guardados'}`, 'Ya están en Gastos.');
  };

  const descartar = async (e: Elemento) => {
    if (e.docId) { try { await marcarBuzon(e.docId, 'descartado'); } catch { /* se quita de la vista igual */ } }
    setElementos(l => l.filter(x => x.clave !== e.clave));
  };

  const verOriginal = async (e: Elemento) => {
    try { window.open(URL.createObjectURL(await ficheroDe(e)), '_blank', 'noopener'); } catch { toastError('No se ha podido abrir'); }
  };

  if (!cargado) return <PageSkeleton />;

  const listos = elementos.filter(e => e.estado === 'listo').length;
  const pendientes = elementos.filter(e => e.estado !== 'guardado');

  return (
    <div className="page-container buzon">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/gastos" className="page-back"><ArrowLeft size={16} /> Gastos</Link>
          <h1 className="page-title">Facturas de proveedores</h1>
          <p className="page-subtitle">
            Arrastra aquí las facturas de gasto (PDF o foto) o reenvíalas al correo del buzón. Se leen solas y
            las revisas antes de guardarlas.
          </p>
        </div>
        {listos > 1 && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-primary" onClick={() => void guardarTodos()}><Check size={16} /> Guardar las {listos} revisadas</button>
          </div>
        )}
      </div>

      {direccion && (
        <section className="card buzon-correo">
          <Mail size={18} aria-hidden="true" />
          <div>
            <strong>Tu buzón de facturas</strong>
            <p className="form-hint" style={{ margin: 0 }}>Reenvía aquí las facturas que te llegan por correo, o dáselo a tus proveedores.</p>
          </div>
          <span className="mono buzon-direccion">{direccion}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
            try { await navigator.clipboard.writeText(direccion); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* */ }
          }}>{copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}</button>
        </section>
      )}

      <input ref={entrada} type="file" hidden multiple accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
        onChange={ev => { añadir(ev.target.files); ev.target.value = ''; }} />
      <div
        className={`card buzon-soltar ${arrastrando ? 'is-encima' : ''}`}
        onDragOver={ev => { ev.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={ev => { ev.preventDefault(); setArrastrando(false); añadir(ev.dataTransfer.files); }}
      >
        <Upload size={26} strokeWidth={1.6} aria-hidden="true" />
        <p><strong>Suelta aquí las facturas</strong>, todas a la vez si quieres.</p>
        <button type="button" className="btn btn-secondary" onClick={() => entrada.current?.click()}><Upload size={16} /> Elegir ficheros</button>
      </div>

      {pendientes.length === 0 ? (
        <p className="buzon-vacio"><Inbox size={18} /> No hay nada pendiente de revisar.</p>
      ) : (
        <ul className="buzon-lista">
          {pendientes.map(e => (
            <li key={e.clave} className={`card buzon-item is-${e.estado}`}>
              <div className="buzon-item-cabeza">
                <FileText size={18} aria-hidden="true" />
                <span className="buzon-item-nombre">
                  <strong>{e.nombre}</strong>
                  <small>{e.origen === 'correo' ? `Por correo${e.remitente ? ` · ${e.remitente}` : ''}${e.asunto ? ` · ${e.asunto}` : ''}` : 'Subida ahora'}</small>
                </span>
                <span className="buzon-item-estado">
                  {e.estado === 'esperando' && 'En cola'}
                  {e.estado === 'leyendo' && <><Loader2 size={14} className="spin" /> Leyendo…</>}
                  {e.estado === 'guardando' && <><Loader2 size={14} className="spin" /> Guardando…</>}
                  {e.estado === 'error' && <span className="buzon-error">{e.error}</span>}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void verOriginal(e)} title="Ver el original"><ExternalLink size={14} /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void descartar(e)} title="Descartar"><Trash2 size={14} /></button>
              </div>

              {e.datos && (e.estado === 'listo' || e.estado === 'guardando') && (
                <>
                  {e.avisos.length > 0 && <p className="buzon-avisos">{e.avisos.join(' · ')}</p>}
                  <div className="buzon-campos">
                    <label>Fecha<input type="date" className="form-input" value={e.datos.fecha} onChange={v => cambiarDatos(e, { fecha: v.target.value })} /></label>
                    <label>Proveedor
                      <select className="form-select" value={e.datos.proveedorId ?? ''} onChange={v => {
                        const p = proveedores.find(x => x.id === v.target.value);
                        cambiarDatos(e, { proveedorId: p?.id, proveedorNombre: p?.businessName ?? e.datos!.proveedorNombre });
                      }}>
                        <option value="">{e.datos.proveedorNombre ? `${e.datos.proveedorNombre} (sin ficha)` : 'Sin proveedor'}</option>
                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
                      </select>
                    </label>
                    <label className="buzon-campo-ancho">Concepto<input className="form-input" value={e.datos.concepto} maxLength={120} onChange={v => cambiarDatos(e, { concepto: v.target.value })} /></label>
                    <label>Categoría
                      <select className="form-select" value={e.datos.categoria} onChange={v => cambiarDatos(e, { categoria: v.target.value as GastoCategoria })}>
                        {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </label>
                    <label>Base<input type="number" step="0.01" className="form-input" value={e.datos.base} onChange={v => cambiarDatos(e, { base: Number(v.target.value) || 0 })} /></label>
                    <label>{igic ? 'IGIC' : 'IVA'} %<input type="number" step="0.5" className="form-input" value={e.datos.tipo} onChange={v => cambiarDatos(e, { tipo: Number(v.target.value) || 0 })} /></label>
                    <label>Total<input type="number" step="0.01" className="form-input" value={e.datos.total} onChange={v => cambiarDatos(e, { total: Number(v.target.value) || 0 })} /></label>
                  </div>
                  <div className="buzon-item-pie">
                    <span className="form-hint">Cuota {formatCurrency(e.datos.cuota)}</span>
                    <button type="button" className="btn btn-primary btn-sm" disabled={e.estado === 'guardando'} onClick={async () => {
                      if (await guardar(e)) success('Gasto guardado', e.datos!.concepto);
                    }}><Check size={14} /> Guardar gasto</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
