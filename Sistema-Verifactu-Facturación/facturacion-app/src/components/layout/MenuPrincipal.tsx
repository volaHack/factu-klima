'use client';

/**
 * EL MENÚ LATERAL EN ÁRBOL
 *
 * Como en los programas de gestión de siempre: unas pocas opciones
 * principales que se despliegan en las secundarias, y cada cosa en el sitio
 * donde uno la busca por lo que ES.
 *
 *   · Mantenimientos: las fichas, lo que no lleva fecha (clientes,
 *     proveedores, artículos…).
 *   · Compras: documentos con fecha y proveedor.
 *   · Ventas: documentos con fecha y cliente.
 *   · Almacén: lo que mueve existencias sin cliente ni proveedor.
 *   · Consultas: ver por pantalla.
 *   · Listados: sacar por impresora.
 *   · Utilidades: configurar y mantener el programa.
 *
 * Cada hoja abre su pantalla ya filtrada y su «+» crea uno nuevo de un
 * toque. Las ramas se abren y cierran a mano y lo abierto se recuerda en
 * este dispositivo; la rama de la pantalla en que se está se abre sola.
 * Con el menú plegado solo quedan los iconos de las ramas: pulsar uno lo
 * despliega con esa rama abierta.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronRight, Plus, FolderCog, ShoppingCart, BadgeEuro, Warehouse, ScanSearch, Printer, Wrench,
  LayoutDashboard, Sparkles,
} from 'lucide-react';
import type { ModuloId } from '@/lib/modulos';

export type Requisito = 'tpv' | 'historico' | 'gestoria';

export interface Hoja {
  label: string;
  /** La pantalla, con sus filtros en la dirección. */
  lista: string;
  /** Crear uno nuevo. */
  nuevo?: string;
  /** Solo si la empresa tiene encendido este módulo. */
  modulo?: ModuloId;
  /** Solo si se da esto (TPV encendido, historial cargado, gestoría). */
  requiere?: Requisito;
}

export interface Rama {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hojas: Hoja[];
}

const doc = (tipo: string, sentido: 'venta' | 'compra') => ({
  lista: `/documentos?tipo=${tipo}&sentido=${sentido}`,
  nuevo: `/documentos/nuevo?tipo=${tipo}&sentido=${sentido}`,
});

export const ACCESOS: Hoja[] = [
  { label: 'Panel', lista: '/dashboard' },
  { label: 'Asistente', lista: '/asistencia' },
];
const ICONO_ACCESO: Record<string, React.ComponentType<{ size?: number }>> = {
  '/dashboard': LayoutDashboard,
  '/asistencia': Sparkles,
};

export const MENU: Rama[] = [
  {
    id: 'mantenimientos', label: 'Mantenimientos', icon: FolderCog, hojas: [
      { label: 'Clientes', lista: '/clientes?tipo=clientes', nuevo: '/clientes?tipo=clientes&nuevo=1' },
      { label: 'Proveedores', lista: '/clientes?tipo=proveedores', nuevo: '/clientes?tipo=proveedores&nuevo=1' },
      { label: 'Artículos', lista: '/productos', nuevo: '/productos?nuevo=1' },
      { label: 'Almacenes', lista: '/almacenes?tab=almacenes', nuevo: '/almacenes?tab=almacenes&nuevo=1', modulo: 'almacenes' },
      { label: 'Grupos y cadenas', lista: '/grupos-clientes', modulo: 'grupos_clientes' },
      { label: 'Rutas de reparto', lista: '/rutas-reparto', modulo: 'rutas' },
      { label: 'Ofertas y promociones', lista: '/ofertas', modulo: 'ofertas' },
      { label: 'Rappels por volumen', lista: '/rappels', modulo: 'rappels' },
      { label: 'Lotes', lista: '/lotes', modulo: 'lotes' },
      { label: 'Números de serie', lista: '/numeros-serie', modulo: 'numeros_serie' },
      { label: 'Obras y expedientes', lista: '/obras', modulo: 'obras' },
    ],
  },
  {
    id: 'compras', label: 'Compras', icon: ShoppingCart, hojas: [
      { label: 'Pedidos de compra', ...doc('pedido', 'compra'), modulo: 'compras' },
      { label: 'Albaranes de compra', ...doc('albaran', 'compra'), modulo: 'compras' },
      { label: 'Facturas de compra', ...doc('factura', 'compra'), modulo: 'compras' },
      { label: 'Facturas de compra rectificativas', ...doc('rectificativa', 'compra'), modulo: 'compras' },
      { label: 'Pagos', lista: '/tesoreria?tab=pagos', nuevo: '/tesoreria?tab=pagos&nuevo=pago' },
      { label: 'Gastos', lista: '/gastos', modulo: 'gastos' },
    ],
  },
  {
    id: 'ventas', label: 'Ventas', icon: BadgeEuro, hojas: [
      { label: 'Presupuestos', ...doc('presupuesto', 'venta'), modulo: 'presupuestos' },
      { label: 'Pedidos de venta', ...doc('pedido', 'venta'), modulo: 'pedidos' },
      { label: 'Albaranes de venta', ...doc('albaran', 'venta'), modulo: 'albaranes' },
      // Las facturas de venta tienen su propia pantalla: la que las emite
      // por Veri*Factu.
      { label: 'Facturas de venta', lista: '/facturas', nuevo: '/facturas/nueva' },
      { label: 'Facturas de venta rectificativas', ...doc('rectificativa', 'venta'), modulo: 'rectificativas' },
      { label: 'Abonos y devoluciones', lista: '/devoluciones', modulo: 'rectificativas' },
      { label: 'Cobros', lista: '/tesoreria?tab=cobros', nuevo: '/tesoreria?tab=cobros&nuevo=cobro' },
      { label: 'TPV (caja)', lista: '/tpv', requiere: 'tpv' },
      { label: 'Órdenes de trabajo', lista: '/ordenes-trabajo', modulo: 'ordenes_trabajo' },
      { label: 'Recordatorios de cobro', lista: '/recordatorios' },
    ],
  },
  {
    id: 'almacen', label: 'Almacén', icon: Warehouse, hojas: [
      { label: 'Existencias', lista: '/almacenes?tab=existencias', modulo: 'almacenes' },
      { label: 'Regularizaciones de stock', lista: '/almacenes?tab=regularizaciones', nuevo: '/almacenes?tab=regularizaciones&nuevo=1', modulo: 'almacenes' },
      { label: 'Traspasos entre almacenes', lista: '/almacenes?tab=traspasos', nuevo: '/almacenes?tab=traspasos&nuevo=1', modulo: 'almacenes' },
      { label: 'Fabricación', lista: '/fabricacion', modulo: 'produccion' },
    ],
  },
  {
    id: 'consultas', label: 'Consultas', icon: ScanSearch, hojas: [
      { label: 'Todos los documentos', lista: '/documentos?tipo=todos' },
      { label: 'Vencimientos', lista: '/tesoreria?tab=vencimientos' },
      { label: 'Extractos de cuenta', lista: '/tesoreria?tab=extractos' },
      { label: 'Banco', lista: '/banco' },
      { label: 'Conciliación bancaria', lista: '/conciliacion' },
      { label: 'Informes y estadísticas', lista: '/informes' },
      { label: 'Contabilidad', lista: '/contabilidad' },
      { label: 'Comisiones', lista: '/comisiones', modulo: 'comisiones' },
      { label: 'Retención de IRPF', lista: '/retenciones', modulo: 'retenciones' },
      { label: 'Intracomunitarias', lista: '/intracomunitarias', modulo: 'intracomunitarias' },
      { label: 'Historial anterior', lista: '/historico', requiere: 'historico' },
    ],
  },
  {
    id: 'listados', label: 'Listados', icon: Printer, hojas: [
      { label: 'Listados', lista: '/listados?tab=listados' },
      { label: 'Impresos', lista: '/listados?tab=impresos' },
      { label: 'Relaciones', lista: '/listados?tab=relaciones' },
      { label: 'Listados fiscales', lista: '/listados-fiscales' },
    ],
  },
  {
    id: 'utilidades', label: 'Utilidades', icon: Wrench, hojas: [
      { label: 'Ajustes', lista: '/ajustes' },
      { label: 'Equipo', lista: '/equipo' },
      { label: 'Diseño de documentos', lista: '/plantillas' },
      { label: 'Importar datos', lista: '/importar' },
      { label: 'Verifactu', lista: '/verifactu' },
      { label: 'Factura electrónica', lista: '/factura-electronica' },
      { label: 'SII (envío inmediato)', lista: '/sii', modulo: 'sii' },
      { label: 'Integridad', lista: '/integridad' },
      { label: 'Gestoría', lista: '/gestoria', requiere: 'gestoria' },
    ],
  },
];

/**
 * ¿Es esta la hoja de la pantalla abierta? La ruta tiene que casar (o ser
 * una de dentro, como la ficha de una factura) y los filtros de la hoja
 * tienen que estar en la dirección.
 */
export function esHojaActiva(hoja: Hoja, pathname: string, params: URLSearchParams): boolean {
  const [ruta, consulta = ''] = hoja.lista.split('?');
  const pedidos = new URLSearchParams(consulta);
  if (pedidos.size === 0) return pathname === ruta || (ruta !== '/dashboard' && pathname.startsWith(ruta + '/'));
  if (pathname !== ruta) return false;
  for (const [k, v] of pedidos) if ((params.get(k) ?? (v === 'todos' ? 'todos' : null)) !== v) return false;
  return true;
}

const CLAVE = 'klima-menu-ramas';

function leerAbiertas(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export default function MenuPrincipal({ visible, onClose, collapsed, onExpand, nombreHistorial }: {
  /** Si la hoja sale: módulos encendidos, perfil de trabajo, TPV… */
  visible: (hoja: Hoja) => boolean;
  onClose: () => void;
  collapsed: boolean;
  /** Desplegar el menú plegado. */
  onExpand: () => void;
  /** «Historial ISECAN», con el nombre del programa de antes. */
  nombreHistorial?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Por defecto, Ventas abierta: es lo que más se usa.
  const [abiertas, setAbiertas] = useState<string[]>(['ventas']);

  // Lo recordado se lee al montar: en el servidor no hay localStorage.
  useEffect(() => {
    const guardadas = leerAbiertas();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia de este dispositivo, solo existe en el navegador
    if (guardadas) setAbiertas(guardadas);
  }, []);

  const ramas = useMemo(
    () => MENU
      .map(r => ({
        ...r,
        hojas: r.hojas
          .filter(visible)
          .map(h => (h.requiere === 'historico' && nombreHistorial ? { ...h, label: `Historial ${nombreHistorial}` } : h)),
      }))
      .filter(r => r.hojas.length > 0),
    [visible, nombreHistorial],
  );

  const ramaActiva = ramas.find(r => r.hojas.some(h => esHojaActiva(h, pathname, params)))?.id;

  const guardar = (sigue: string[]) => {
    try { localStorage.setItem(CLAVE, JSON.stringify(sigue)); } catch { /* sin almacenamiento: solo esta vez */ }
  };

  // La rama de la pantalla abierta se abre sola, salvo que se cierre a mano
  // estando en ella (eso vale hasta recargar).
  const [cerradasAMano, setCerradasAMano] = useState<string[]>([]);
  const estaAbierta = (id: string) => abiertas.includes(id) || (id === ramaActiva && !cerradasAMano.includes(id));

  const abrir = (id: string) => {
    const sigue = abiertas.includes(id) ? abiertas : [...abiertas, id];
    setAbiertas(sigue);
    guardar(sigue);
    setCerradasAMano(c => c.filter(x => x !== id));
  };

  const alternar = (id: string) => {
    if (!estaAbierta(id)) return abrir(id);
    const sigue = abiertas.filter(x => x !== id);
    setAbiertas(sigue);
    guardar(sigue);
    if (id === ramaActiva) setCerradasAMano(c => [...c, id]);
  };

  const desplegarCon = (id: string) => {
    abrir(id);
    onExpand();
  };

  return (
    <>
      {ACCESOS.filter(visible).map(h => {
        const Icono = ICONO_ACCESO[h.lista];
        const activa = esHojaActiva(h, pathname, params);
        return (
          <Link
            key={h.lista}
            href={h.lista}
            className={`sidebar-link ${activa ? 'active' : ''}`}
            onClick={onClose}
            aria-current={activa ? 'page' : undefined}
            title={collapsed ? h.label : undefined}
          >
            <Icono size={18} />
            <span>{h.label}</span>
          </Link>
        );
      })}

      <ul className="menu-arbol" role="tree" aria-label="Menú">
        {ramas.map(rama => {
          const abierta = !collapsed && estaAbierta(rama.id);
          const Icono = rama.icon;
          return (
            <li key={rama.id} role="treeitem" aria-expanded={abierta} aria-selected={false}>
              <button
                type="button"
                className={`menu-arbol-rama${rama.id === ramaActiva ? ' contiene-activa' : ''}`}
                onClick={() => (collapsed ? desplegarCon(rama.id) : alternar(rama.id))}
                title={collapsed ? rama.label : undefined}
              >
                <Icono size={18} />
                <span>{rama.label}</span>
                <ChevronRight size={14} className="menu-arbol-flecha" aria-hidden />
              </button>
              {abierta && (
                <ul role="group">
                  {rama.hojas.map(hoja => {
                    const activa = esHojaActiva(hoja, pathname, params);
                    return (
                      <li key={hoja.lista} role="treeitem" aria-selected={activa} className={`menu-arbol-hoja${activa ? ' active' : ''}`}>
                        <Link href={hoja.lista} onClick={onClose} aria-current={activa ? 'page' : undefined}>
                          {hoja.label}
                        </Link>
                        {hoja.nuevo && (
                          <Link
                            href={hoja.nuevo}
                            onClick={onClose}
                            className="menu-arbol-nuevo"
                            aria-label={`Nuevo: ${hoja.label}`}
                            title={`Nuevo: ${hoja.label.toLowerCase()}`}
                          >
                            <Plus size={14} />
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
