'use client';

/**
 * FIJADAS Y RECIENTES, EN EL MENÚ LATERAL
 *
 * Las fichas fijadas con la estrella y las últimas abiertas, a un toque
 * desde cualquier pantalla (lo guardado vive en lib/memoriaFichas; el
 * buscador enseña lo mismo con la caja vacía).
 *
 * También es quien APUNTA lo que se abre: mira la dirección y, si es la
 * ficha de una factura, un documento o un cliente, busca su nombre en la
 * copia local y la recuerda. Así cuenta igual se llegue desde el buscador,
 * desde una lista o desde un enlace del panel, sin tener que tocar cada
 * pantalla. Los artículos los apunta su propia pantalla, que es donde se
 * abren.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Users, Package, Star, LayoutGrid } from 'lucide-react';
import { getInvoiceById, getClientById } from '@/lib/storage';
import { etiquetaTipo } from '@/lib/documentos';
import { usePerfiles } from '@/lib/perfilesCliente';
import {
  leerMemoria, recordarFicha, alternarFijada, fichaDeRuta, EVENTO_MEMORIA, claveMemoria,
  type FichaRecordada, type Memoria, type TipoFicha,
} from '@/lib/memoriaFichas';

const ICONO: Record<TipoFicha, React.ComponentType<{ size?: number }>> = {
  factura: FileText, documento: FileText, cliente: Users, producto: Package, pantalla: LayoutGrid,
};

/** Cuántas recientes caben sin empujar el menú hacia abajo. */
const RECIENTES_EN_MENU = 4;

export default function FichasRecordadas({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const { cuenta, cargado } = usePerfiles();
  const [memoria, setMemoria] = useState<Memoria>({ recientes: [], fijadas: [] });

  useEffect(() => {
    if (!cargado) return;
    const leer = () => setMemoria(leerMemoria(cuenta));
    leer();
    // Otra pestaña del mismo equipo también abre fichas.
    const alAlmacen = (e: StorageEvent) => { if (e.key === claveMemoria(cuenta)) leer(); };
    window.addEventListener(EVENTO_MEMORIA, leer);
    window.addEventListener('storage', alAlmacen);
    return () => {
      window.removeEventListener(EVENTO_MEMORIA, leer);
      window.removeEventListener('storage', alAlmacen);
    };
  }, [cuenta, cargado]);

  // Lo que se abre por su dirección se apunta con su nombre de verdad.
  useEffect(() => {
    if (!cargado) return;
    const ruta = fichaDeRuta(pathname);
    if (!ruta) return;
    let vivo = true;
    (async () => {
      if (ruta.tipo === 'cliente') {
        const c = await getClientById(ruta.id);
        if (!c || !vivo) return;
        recordarFicha(cuenta, {
          clave: `cliente:${c.id}`, tipo: 'cliente', titulo: c.tradeName || c.businessName,
          detalle: [c.esProveedor ? 'Proveedor' : 'Cliente', c.nif].filter(Boolean).join(' · '),
          href: `/clientes/${c.id}`,
        });
        return;
      }
      const d = await getInvoiceById(ruta.id);
      if (!d || !vivo) return;
      const compra = d.sentido === 'compra' ? ' de compra' : '';
      recordarFicha(cuenta, {
        clave: `${ruta.tipo}:${d.id}`, tipo: ruta.tipo,
        titulo: `${etiquetaTipo(d.tipo ?? 'factura')}${compra} ${d.number || '(borrador)'}`,
        detalle: [d.clientName, d.issueDate].filter(Boolean).join(' · '),
        href: ruta.tipo === 'factura' ? `/facturas/${d.id}` : `/documentos/${d.id}`,
      });
    })().catch(() => { /* sin la ficha en la copia local: no se apunta */ });
    return () => { vivo = false; };
  }, [pathname, cuenta, cargado]);

  const fijadas = memoria.fijadas;
  const recientes = memoria.recientes
    .filter(r => r.tipo !== 'pantalla' && !fijadas.some(f => f.clave === r.clave))
    .slice(0, RECIENTES_EN_MENU);
  if (!fijadas.length && !recientes.length) return null;

  const fila = (f: FichaRecordada, fijada: boolean) => {
    const Icono = ICONO[f.tipo];
    const activa = pathname === f.href.split('?')[0] && !f.href.includes('?');
    return (
      <li key={f.clave} className="nav-recordada">
        <Link href={f.href} onClick={onClose} aria-current={activa ? 'page' : undefined} title={f.detalle ? `${f.titulo} · ${f.detalle}` : f.titulo}>
          <Icono size={14} />
          <span>{f.titulo}</span>
        </Link>
        <button
          type="button"
          className={`nav-recordada-estrella${fijada ? ' is-fijada' : ''}`}
          aria-pressed={fijada}
          aria-label={fijada ? `Quitar ${f.titulo} de las fijadas` : `Fijar ${f.titulo}`}
          title={fijada ? 'Quitar de las fijadas' : 'Fijar'}
          onClick={() => setMemoria(alternarFijada(cuenta, f))}
        >
          <Star size={13} />
        </button>
      </li>
    );
  };

  return (
    <section className="nav-recordadas" aria-label="Fichas a mano">
      {fijadas.length > 0 && (
        <>
          <h2 className="nav-recordadas-titulo">Fijadas</h2>
          <ul>{fijadas.map(f => fila(f, true))}</ul>
        </>
      )}
      {recientes.length > 0 && (
        <>
          <h2 className="nav-recordadas-titulo">Abierto hace poco</h2>
          <ul>{recientes.map(f => fila(f, false))}</ul>
        </>
      )}
    </section>
  );
}
