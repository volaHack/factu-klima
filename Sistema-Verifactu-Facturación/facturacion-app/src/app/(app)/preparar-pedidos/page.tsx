'use client';

/**
 * PREPARAR PEDIDOS — LA PANTALLA DEL ALMACÉN
 *
 * Pensada para la tablet colgada junto a las estanterías o el ordenador
 * del muelle: se lee de lejos y se toca con el dedo (o con guantes). Lo
 * que el comercial pidió desde el móvil aparece aquí solo, sin recargar
 * (ver hooks/useColaAlmacen), y cada pedido se lleva de un toque a
 * «Preparado» y luego a «Entregado».
 *
 * Qué entra en la cola, qué significa cada botón y por qué «Preparado» no
 * es un estado: en lib/prepararPedidos.ts y lib/prepararPedidosAcciones.ts.
 *
 * La cola es una sola lista, por fecha o por llegada: en el almacén no hay
 * rutas de reparto (quien carga sabe dónde está cada tienda). Las hojas
 * (preparación por pedido y carga de varios) salen de los pedidos marcados
 * o, si no se marca ninguno, de los que se ven con el filtro y el buscador.
 * Se imprimen con el diálogo del navegador; almacen.css deja en el papel
 * sólo la hoja.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Truck, Printer, Bell, BellOff, Volume2, VolumeX, PackageCheck, Undo2, ExternalLink, ClipboardList } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import CajaBusqueda from '@/components/ui/CajaBusqueda';
import { useToast } from '@/hooks/useToast';
import { useColaAlmacen, useCuentaAvisos, EVENTO_VISTOS } from '@/hooks/useColaAlmacen';
import { getCompanySettings } from '@/lib/storage';
import { usePerfiles } from '@/lib/perfilesCliente';
import { casaTexto } from '@/lib/casaTexto';
import { formatDate } from '@/lib/utils';
import { haceCuanto } from '@/lib/perfiles';
import { posAudio } from '@/lib/posAudio';
import {
  ordenarCola, totalesDePedido, nombreDe, numeroDeLineas,
  type OrdenCola, type PedidoEnCola,
} from '@/lib/prepararPedidos';
import { marcarPreparado, marcarEntregado } from '@/lib/prepararPedidosAcciones';
import {
  leerMemoria, guardarMemoria, marcarVistos, leerPreferencias, guardarPreferencias, type PreferenciasAviso,
} from '@/lib/avisoPedidos';
import { HojaPreparacion, HojaCarga } from './_componentes/Hojas';

type Filtro = 'pendientes' | 'preparados' | 'todo';
type Papel = { tipo: 'preparacion'; pedidos: PedidoEnCola[] } | { tipo: 'carga'; pedidos: PedidoEnCola[]; titulo: string };

const CLAVE_VISTA = 'klima-almacen-vista';

/** El orden elegido se recuerda en este equipo. */
function leerVista(): { orden: OrdenCola } {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_VISTA) ?? 'null');
    return { orden: v?.orden === 'llegada' ? 'llegada' : 'fecha' };
  } catch {
    return { orden: 'fecha' };
  }
}

export default function PrepararPedidosPage() {
  const { cola, documentos, albaranes, cargando } = useColaAlmacen();
  const cuenta = useCuentaAvisos();
  const { activo: perfil } = usePerfiles();
  const { success, error: toastError, addToast } = useToast();

  const [empresa, setEmpresa] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [vista, setVista] = useState<{ orden: OrdenCola }>({ orden: 'fecha' });
  // Los pedidos marcados para las hojas (de carga y de preparación).
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pref, setPref] = useState<PreferenciasAviso>({ avisos: true, sonido: true });
  const [ocupado, setOcupado] = useState<string | null>(null);
  // «Entregado» mueve el stock y no se deshace con otro toque: el primero
  // lo arma y el segundo, en unos segundos, lo hace.
  const [armado, setArmado] = useState<string | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const [papel, setPapel] = useState<Papel | null>(null);
  const desarmar = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Preferencias de este equipo: sólo existen en el navegador.
    /* eslint-disable react-hooks/set-state-in-effect */
    setVista(leerVista());
    setPref(leerPreferencias());
    /* eslint-enable react-hooks/set-state-in-effect */
    getCompanySettings().then(s => setEmpresa(s?.tradeName || s?.businessName || '')).catch(() => {});
  }, []);

  // Lo que está en pantalla queda visto: el número del menú vuelve a cero.
  // Lo que no se había visto lleva la etiqueta «Nuevo» mientras se está aquí;
  // la primera vez que este equipo abre la cola no, o todo sería «nuevo».
  useEffect(() => {
    if (!cuenta || cargando) return;
    const memoria = leerMemoria(cuenta);
    const recien = cola.filter(p => !memoria.vistos.includes(p.id)).map(p => p.id);
    if (!recien.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo «nuevo» sale de lo guardado en este equipo
    if (memoria.vistos.length > 0) setNuevos(prev => new Set([...prev, ...recien]));
    guardarMemoria(cuenta, marcarVistos(memoria, recien));
    window.dispatchEvent(new CustomEvent(EVENTO_VISTOS));
  }, [cola, cuenta, cargando]);

  // Al montar la hoja que se ha pedido, se abre el diálogo de imprimir;
  // al cerrarlo, la hoja se desmonta.
  useEffect(() => {
    if (!papel) return;
    const quitar = () => setPapel(null);
    window.addEventListener('afterprint', quitar);
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', quitar); };
  }, [papel]);

  useEffect(() => () => window.clearTimeout(desarmar.current), []);

  const cambiarVista = (v: Partial<typeof vista>) => {
    const sigue = { ...vista, ...v };
    setVista(sigue);
    try { localStorage.setItem(CLAVE_VISTA, JSON.stringify(sigue)); } catch { /* sólo esta vez */ }
  };

  const cambiarPref = (p: Partial<PreferenciasAviso>) => {
    const sigue = { ...pref, ...p };
    setPref(sigue);
    guardarPreferencias(sigue);
    // Al encender el sonido se oye una vez: así se sabe cómo suena, y el
    // toque desbloquea el audio del navegador para los avisos de después.
    if (p.sonido) posAudio.playHold();
  };

  const cuentas = useMemo(() => ({
    pendientes: cola.filter(p => !p.preparado).length,
    preparados: cola.filter(p => p.preparado).length,
  }), [cola]);

  const visibles = useMemo(() => ordenarCola(cola, vista.orden).filter(p => {
    if (filtro === 'pendientes' && p.preparado) return false;
    if (filtro === 'preparados' && !p.preparado) return false;
    return casaTexto(busca, p.cliente, p.numero, p.direccion, ...p.lineas.map(l => `${l.nombre} ${l.ref}`));
  }), [cola, vista.orden, filtro, busca]);

  // Lo marcado que sigue en la cola (lo entregado sale solo de ella). Las
  // hojas salen de los marcados o, sin marcar ninguno, de lo que se ve.
  const elegidos = useMemo(() => ordenarCola(cola, vista.orden).filter(p => marcados.has(p.id)), [cola, vista.orden, marcados]);
  const paraHojas = elegidos.length > 0 ? elegidos : visibles;
  const tituloHojas = elegidos.length > 0
    ? (elegidos.length === 1 ? '1 pedido marcado' : `${elegidos.length} pedidos marcados`)
    : tituloDeCarga(filtro, busca);
  const marcar = (id: string) => setMarcados(prev => {
    const sigue = new Set(prev);
    if (!sigue.delete(id)) sigue.add(id);
    return sigue;
  });

  const alPreparar = async (p: PedidoEnCola) => {
    setOcupado(p.id);
    const quitar = Boolean(p.preparado);
    try {
      await marcarPreparado(p, { documentos, albaranes }, quitar ? null : { en: new Date().toISOString(), ...(perfil ? { por: perfil.nombre } : {}) });
      if (quitar) {
        success('Vuelve a la cola', `${p.cliente} · ${nombreDe(p)}`);
      } else {
        addToast({
          type: 'success', title: `Preparado: ${p.cliente}`, message: nombreDe(p),
          accion: { etiqueta: 'Deshacer', alPulsar: () => { void marcarPreparado(p, { documentos, albaranes }, null).catch(() => {}); } },
        });
      }
    } catch (e) {
      toastError('No se pudo guardar', e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(null);
    }
  };

  const alEntregar = async (p: PedidoEnCola) => {
    if (armado !== p.id) {
      setArmado(p.id);
      window.clearTimeout(desarmar.current);
      desarmar.current = window.setTimeout(() => setArmado(null), 4000);
      return;
    }
    window.clearTimeout(desarmar.current);
    setArmado(null);
    setOcupado(p.id);
    try {
      const numero = await marcarEntregado(p, { documentos, albaranes });
      success(`Entregado: ${p.cliente}`, p.tipo === 'pedido' ? `Sale con el albarán ${numero}. Stock descontado.` : `Albarán ${numero} expedido. Stock descontado.`);
    } catch (e) {
      toastError('No se pudo entregar', e instanceof Error ? e.message : undefined);
    } finally {
      setOcupado(null);
    }
  };

  if (cargando) return <PageSkeleton />;

  return (
    <div className="page-container almacen">
      <div className="almacen-pantalla">
        <div className="page-header almacen-cabecera">
          <div>
            <h1 className="page-title"><PackageCheck size={26} aria-hidden /> Preparar pedidos</h1>
            <p className="page-subtitle">Lo que han pedido y hay que sacar del almacén. Lo nuevo aparece solo.</p>
          </div>
          <div className="almacen-cabecera-acciones">
            <button
              type="button" className="btn btn-outline almacen-interruptor" aria-pressed={pref.avisos}
              onClick={() => cambiarPref({ avisos: !pref.avisos })}
              title={pref.avisos ? 'Apagar los avisos de pedidos nuevos en este equipo' : 'Encender los avisos de pedidos nuevos en este equipo'}
            >
              {pref.avisos ? <Bell size={18} /> : <BellOff size={18} />} Avisos {pref.avisos ? 'sí' : 'no'}
            </button>
            <button
              type="button" className="btn btn-outline almacen-interruptor" aria-pressed={pref.sonido}
              onClick={() => cambiarPref({ sonido: !pref.sonido })} disabled={!pref.avisos}
              title={pref.sonido ? 'Quitar el pitido de los avisos' : 'Poner un pitido corto con cada aviso'}
            >
              {pref.sonido ? <Volume2 size={18} /> : <VolumeX size={18} />} Sonido {pref.sonido ? 'sí' : 'no'}
            </button>
            <button
              type="button" className="btn btn-outline almacen-boton" disabled={paraHojas.length === 0}
              onClick={() => setPapel({ tipo: 'preparacion', pedidos: paraHojas })}
              title={elegidos.length ? 'Una hoja por cada pedido marcado' : 'Una hoja por cada pedido que se ve'}
            >
              <Printer size={20} /> Hojas de preparación
            </button>
            <button
              type="button" className="btn btn-primary almacen-boton" disabled={paraHojas.length === 0}
              onClick={() => setPapel({ tipo: 'carga', pedidos: paraHojas, titulo: tituloHojas })}
              title={elegidos.length ? 'Lo de los pedidos marcados, sumado por artículo' : 'Lo de los pedidos que se ven, sumado por artículo'}
            >
              <Truck size={20} /> Hoja de carga{elegidos.length > 0 && <span className="almacen-cuenta-marcados"> · {elegidos.length}</span>}
            </button>
          </div>
        </div>

        <div className="almacen-barra">
          <div className="segmentos" role="group" aria-label="Qué enseñar">
            {([['pendientes', `Por preparar · ${cuentas.pendientes}`], ['preparados', `Preparados · ${cuentas.preparados}`], ['todo', 'Todo']] as const).map(([id, texto]) => (
              <button key={id} type="button" className="btn btn-sm" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{texto}</button>
            ))}
          </div>
          <div className="segmentos" role="group" aria-label="Orden">
            <button type="button" className="btn btn-sm" aria-pressed={vista.orden === 'fecha'} onClick={() => cambiarVista({ orden: 'fecha' })}>Por fecha</button>
            <button type="button" className="btn btn-sm" aria-pressed={vista.orden === 'llegada'} onClick={() => cambiarVista({ orden: 'llegada' })}>Por llegada</button>
          </div>
          {elegidos.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMarcados(new Set())}>
              Quitar las marcas ({elegidos.length})
            </button>
          )}
        </div>

        <CajaBusqueda value={busca} onChange={setBusca} placeholder="Buscar cliente, dirección, número o artículo" total={cola.length} visibles={visibles.length} />

        {visibles.length === 0 ? (
          <div className="almacen-vacio">
            <ClipboardList size={40} aria-hidden />
            <h2>{cola.length === 0 ? 'No hay nada por preparar' : 'Nada con este filtro'}</h2>
            <p>{cola.length === 0
              ? 'Cuando entre un pedido o un albarán nuevo, aparece aquí y suena un aviso.'
              : 'Prueba con «Todo» o borra la búsqueda.'}</p>
          </div>
        ) : (
          <ul className="almacen-lista">
            {visibles.map(p => (
              <Tarjeta
                key={p.id} p={p} nuevo={nuevos.has(p.id)} marcado={marcados.has(p.id)}
                ocupado={ocupado === p.id} armado={armado === p.id}
                alMarcar={() => marcar(p.id)}
                alPreparar={() => alPreparar(p)} alEntregar={() => alEntregar(p)}
                alImprimir={() => setPapel({ tipo: 'preparacion', pedidos: [p] })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Sólo existe mientras se imprime: almacen.css la enseña en el papel
          y esconde todo lo demás. */}
      {papel && (
        <div className="almacen-papel">
          {papel.tipo === 'carga'
            ? <HojaCarga pedidos={papel.pedidos} titulo={papel.titulo} empresa={empresa} />
            : papel.pedidos.map(p => <HojaPreparacion key={p.id} pedido={p} empresa={empresa} />)}
        </div>
      )}
    </div>
  );
}

function tituloDeCarga(filtro: Filtro, busca: string): string {
  const base = filtro === 'pendientes' ? 'Por preparar' : filtro === 'preparados' ? 'Preparados' : 'Todo lo pendiente';
  return busca.trim() ? `${base} · «${busca.trim()}»` : base;
}

function Tarjeta({ p, nuevo, marcado, ocupado, armado, alMarcar, alPreparar, alEntregar, alImprimir }: {
  p: PedidoEnCola; nuevo: boolean; marcado: boolean; ocupado: boolean; armado: boolean;
  alMarcar: () => void; alPreparar: () => void; alEntregar: () => void; alImprimir: () => void;
}) {
  const t = totalesDePedido(p);
  const enlace = p.origen === 'documento' ? `/documentos/${p.id}` : `/albaranes/${p.id}`;
  return (
    <li className={`almacen-tarjeta${p.preparado ? ' almacen-tarjeta--lista' : ''}${nuevo ? ' almacen-tarjeta--nueva' : ''}${marcado ? ' almacen-tarjeta--marcada' : ''}`}>
      <div className="almacen-tarjeta-cabeza">
        <label className="almacen-marca" title="Marcar para la hoja de carga">
          <input type="checkbox" checked={marcado} onChange={alMarcar} aria-label={`Marcar ${nombreDe(p)} de ${p.cliente} para las hojas`} />
        </label>
        <h3>{p.cliente}</h3>
        {nuevo && <span className="almacen-etiqueta almacen-etiqueta--nuevo">Nuevo</span>}
        {p.preparado && <span className="almacen-etiqueta almacen-etiqueta--lista"><CheckCircle2 size={14} aria-hidden /> Preparado</span>}
      </div>
      <p className="almacen-tarjeta-datos">
        <Link href={enlace} className="mono">{nombreDe(p)} <ExternalLink size={12} aria-hidden /></Link>
        <span>{formatDate(p.fecha)}</span>
        {p.direccion && <span>{p.direccion}</span>}
      </p>
      <p className="almacen-tarjeta-cuenta">
        <strong>{numeroDeLineas(p.lineas.length)}</strong>
        {t.cajas > 0 && <span>{t.cajas === 1 ? '1 caja' : `${t.cajas.toLocaleString('es-ES')} cajas`}</span>}
        <span>{t.unidades.toLocaleString('es-ES')} uds.</span>
      </p>
      {p.notas && <p className="almacen-tarjeta-nota">{p.notas}</p>}
      {p.preparado && (
        <p className="almacen-tarjeta-quien">
          Listo {haceCuanto(p.preparado.en)}{p.preparado.por ? ` · ${p.preparado.por}` : ''}
        </p>
      )}

      <details className="almacen-lineas">
        <summary>Ver las líneas</summary>
        <ul>
          {p.lineas.map(l => (
            <li key={l.id}>
              <span className="almacen-lineas-nombre">{l.nombre}</span>
              <span className="almacen-lineas-cantidad">
                {l.cajas > 0 && <>{l.cajas} × {l.udsCaja}</>}
                {l.cajas > 0 && l.sueltas > 0 && ' + '}
                {(l.sueltas > 0 || l.cajas === 0) && <>{l.sueltas.toLocaleString('es-ES')} {l.cajas > 0 ? 'sueltas' : l.unidad}</>}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <div className="almacen-tarjeta-acciones">
        <button
          type="button" className={`btn almacen-boton ${p.preparado ? 'btn-outline' : 'btn-secondary'}`}
          onClick={alPreparar} disabled={ocupado} aria-pressed={Boolean(p.preparado)}
        >
          {p.preparado ? <><Undo2 size={20} /> Quitar preparado</> : <><CheckCircle2 size={20} /> Preparado</>}
        </button>
        <button
          type="button" className={`btn almacen-boton ${armado ? 'btn-danger' : 'btn-primary'}`}
          onClick={alEntregar} disabled={ocupado}
          aria-live="polite"
        >
          <Truck size={20} /> {armado ? 'Toca otra vez para entregar' : 'Entregado'}
        </button>
        <button type="button" className="btn btn-outline almacen-boton almacen-boton--icono" onClick={alImprimir} aria-label={`Imprimir la hoja de preparación de ${nombreDe(p)}`} title="Hoja de preparación">
          <Printer size={22} />
        </button>
      </div>
    </li>
  );
}
