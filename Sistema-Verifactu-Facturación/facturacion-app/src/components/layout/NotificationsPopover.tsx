'use client';

/**
 * EL PANEL DE LA CAMPANA
 *
 * Se abre sobre un velo que desenfoca la app: lo de detrás se aparta y la
 * atención va a los avisos. Va en un portal al <body> porque la cabecera
 * lleva `backdrop-filter`, y eso convierte a la cabecera en el marco de
 * cualquier `position: fixed` de dentro: el velo se quedaba del tamaño de
 * la cabecera.
 *
 * Qué avisos salen y en qué orden: lib/notificaciones.ts (el mismo cálculo
 * que el número de la campana).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, PackageX, TrendingDown, X } from 'lucide-react';
import { getInvoices, getProducts } from '@/lib/storage';
import { avisosDeLaCampana, type Aviso, type ResumenAvisos, type TipoAviso } from '@/lib/notificaciones';
import { formatCurrency } from '@/lib/utils';

interface NotificationsPopoverProps {
  onClose: () => void;
}

type Pestana = 'todos' | 'cobros' | 'stock';

const ICONO: Record<TipoAviso, typeof AlertCircle> = {
  vencida: AlertCircle,
  vence: Clock,
  agotado: PackageX,
  stock_bajo: TrendingDown,
};

const ETIQUETA_GRUPO = { cobros: 'Por cobrar', stock: 'Stock' } as const;

/** Lo que dura la salida (igual que en el CSS: .notif-velo.saliendo). */
const SALIDA_MS = 140;

function cifraDe(a: Aviso) {
  if (a.grupo === 'cobros') return formatCurrency(a.cifra);
  return a.cifra <= 0 ? 'Agotado' : `${a.cifra.toLocaleString('es-ES')} uds`;
}

/** «1.240 € vencidos · 2 vencen esta semana · 6 de stock», cada trozo sin partirse. */
function partesDelResumen(r: ResumenAvisos): string[] {
  const partes: string[] = [];
  if (r.vencidas) partes.push(`${formatCurrency(r.importeVencido)} vencidos`);
  if (r.vencen) partes.push(`${r.vencen} vence${r.vencen === 1 ? '' : 'n'} esta semana`);
  if (r.stock) partes.push(`${r.stock} de stock`);
  return partes.length ? partes : ['Nada pendiente'];
}

export default function NotificationsPopover({ onClose }: NotificationsPopoverProps) {
  const [resumen, setResumen] = useState<ResumenAvisos | null>(null);
  const [pestana, setPestana] = useState<Pestana>('todos');
  const [saliendo, setSaliendo] = useState(false);
  const ancla = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getInvoices(), getProducts()])
      .then(([facturas, articulos]) => { if (vivo) setResumen(avisosDeLaCampana(facturas, articulos)); })
      .catch(() => { if (vivo) setResumen(avisosDeLaCampana([], [])); });
    return () => { vivo = false; };
  }, []);

  // Debajo de la campana, alineado a su borde derecho. Se escribe en el
  // estilo directamente: es medir y colocar, no estado de React.
  useLayoutEffect(() => {
    const colocar = () => {
      const caja = ancla.current?.parentElement?.getBoundingClientRect();
      const el = panel.current;
      if (!caja || !el) return;
      el.style.top = `${caja.bottom + 10}px`;
      el.style.right = `${Math.max(12, window.innerWidth - caja.right)}px`;
      el.dataset.colocado = 'si';
    };
    colocar();
    window.addEventListener('resize', colocar);
    return () => window.removeEventListener('resize', colocar);
  }, []);

  const cerrar = () => {
    if (saliendo) return;
    setSaliendo(true);
    window.setTimeout(onClose, SALIDA_MS);
  };
  const cerrarRef = useRef(cerrar);
  useEffect(() => { cerrarRef.current = cerrar; });

  // Escape cierra; el foco entra en el panel y, al cerrar, vuelve a la campana.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      antes?.focus?.({ preventScroll: true });
    };
  }, []);

  const visibles = useMemo(() => {
    const lista = resumen?.avisos ?? [];
    return pestana === 'todos' ? lista : lista.filter(a => a.grupo === pestana);
  }, [resumen, pestana]);

  const cuenta = {
    todos: resumen?.avisos.length ?? 0,
    cobros: (resumen?.vencidas ?? 0) + (resumen?.vencen ?? 0),
    stock: resumen?.stock ?? 0,
  };

  const fila = (a: Aviso) => {
    const Icono = ICONO[a.tipo];
    return (
      <Link key={a.id} href={a.href} onClick={onClose} className={`notif-fila is-${a.gravedad}`}>
        <span className="notif-fila-icono" aria-hidden="true"><Icono size={16} /></span>
        <span className="notif-fila-texto">
          <span className="notif-fila-titulo">{a.titulo}</span>
          <span className="notif-fila-detalle">{a.detalle}</span>
        </span>
        <span className="notif-fila-cifra">{cifraDe(a)}</span>
      </Link>
    );
  };

  // Con «Todos», separado en Por cobrar / Stock.
  const grupos = pestana === 'todos'
    ? (['cobros', 'stock'] as const).map(g => ({ g, avisos: visibles.filter(a => a.grupo === g) })).filter(x => x.avisos.length)
    : [{ g: pestana, avisos: visibles }];

  const contenido = (
    <div className={`notif-capa${saliendo ? ' saliendo' : ''}`}>
      <div className="notif-velo" onMouseDown={cerrar} aria-hidden="true" />
      <div
        ref={panel}
        className="notifications-popover notif-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-titulo"
        tabIndex={-1}
      >
        <header className="notif-cabecera">
          <div className="notif-cabecera-texto">
            <h2 id="notif-titulo" className="notif-titulo">Avisos</h2>
            <p className="notif-resumen">
              {resumen ? partesDelResumen(resumen).map(t => <span key={t}>{t}</span>) : 'Comprobando…'}
            </p>
          </div>
          <button type="button" className="notif-cerrar" onClick={cerrar} aria-label="Cerrar avisos">
            <X size={18} />
          </button>
        </header>

        <div className="notif-pestanas" role="tablist" aria-label="Qué avisos ver">
          {(['todos', 'cobros', 'stock'] as const).map(p => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={pestana === p}
              className="notif-pestana"
              onClick={() => setPestana(p)}
            >
              {p === 'todos' ? 'Todos' : ETIQUETA_GRUPO[p]}
              <span className="notif-pestana-num">{cuenta[p]}</span>
            </button>
          ))}
        </div>

        <div className="notif-lista" role="tabpanel">
          {!resumen ? (
            <div className="notif-cargando" aria-busy="true">
              {[0, 1, 2].map(i => <span key={i} className="skeleton notif-cargando-fila" />)}
            </div>
          ) : visibles.length === 0 ? (
            <div className="notif-vacio">
              <span className="notif-vacio-icono"><CheckCircle2 size={22} /></span>
              <strong>Todo al día</strong>
              <span>
                {pestana === 'stock' ? 'Ningún artículo agotado ni por debajo del mínimo.'
                  : pestana === 'cobros' ? 'Ninguna factura vencida ni a punto de vencer.'
                  : 'Sin cobros atrasados ni stock bajo.'}
              </span>
            </div>
          ) : (
            grupos.map(({ g, avisos }) => (
              <section key={g} className="notif-grupo" aria-label={ETIQUETA_GRUPO[g]}>
                {pestana === 'todos' && (
                  <h3 className="notif-grupo-titulo">
                    {ETIQUETA_GRUPO[g]} <span>{avisos.length}</span>
                  </h3>
                )}
                {avisos.map(fila)}
              </section>
            ))
          )}
        </div>

        {resumen && cuenta.cobros > 0 && pestana !== 'stock' && (
          <footer className="notif-pie">
            <Link href="/facturas" onClick={onClose} className="notif-pie-enlace">
              Ver facturas <ArrowRight size={14} />
            </Link>
          </footer>
        )}
      </div>
    </div>
  );

  return (
    <>
      <span ref={ancla} hidden />
      {typeof document !== 'undefined' && createPortal(contenido, document.body)}
    </>
  );
}
