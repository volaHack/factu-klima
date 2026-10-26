import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ChartColumn, ChevronRight, FileText, FolderOpen, HandCoins, Package, PackagePlus, Settings2, ShoppingCart, Truck,
  UserPlus, Users, type LucideIcon,
} from 'lucide-react';
import { tieneModulo, type ModuloId } from '@/lib/modulos';

interface Atajo {
  etiqueta: string;
  href: string;
  icono: LucideIcon;
  /** Sin este módulo, el atajo llevaría a algo que la empresa no usa. */
  requiere?: ModuloId;
}

/**
 * Lo que más se crea después de una factura (que ya tiene su botón arriba).
 * Cada uno abre directamente el formulario, no la lista.
 */
const CREAR: Atajo[] = [
  { etiqueta: 'Presupuesto', href: '/documentos/nuevo?tipo=presupuesto&sentido=venta', icono: FileText, requiere: 'presupuestos' },
  { etiqueta: 'Albarán', href: '/documentos/nuevo?tipo=albaran&sentido=venta', icono: Truck, requiere: 'albaranes' },
  { etiqueta: 'Cobro', href: '/tesoreria?nuevo=cobro', icono: HandCoins },
  { etiqueta: 'Compra', href: '/documentos/nuevo?tipo=albaran&sentido=compra', icono: ShoppingCart, requiere: 'compras' },
  { etiqueta: 'Cliente', href: '/clientes?nuevo=1', icono: UserPlus },
  { etiqueta: 'Artículo', href: '/productos?nuevo=1', icono: PackagePlus },
];

export interface AccesosPanelProps {
  readonly modulos: ModuloId[];
  readonly clientesActivos: number;
  readonly productos: number;
  readonly productosActivos: number;
  /** El estado con la AEAT, si la empresa lo tiene puesto en su panel. */
  readonly estadoAeat?: ReactNode;
}

/**
 * LA COLUMNA DE LA DERECHA: QUÉ PUEDO HACER AHORA
 *
 * Junto a «Para hoy» (lo que pide atención) va lo que se puede hacer sin
 * buscarlo en el menú: crear lo de cada día, ir a la cartera y, si la
 * empresa lo quiere ver, cómo está la conexión con la AEAT.
 */
export default function AccesosPanel({ modulos, clientesActivos, productos, productosActivos, estadoAeat }: AccesosPanelProps) {
  const crear = CREAR.filter(a => !a.requiere || tieneModulo(modulos, a.requiere));
  const cartera: { etiqueta: string; dato?: string; href: string; icono: LucideIcon }[] = [
    { etiqueta: 'Clientes', dato: `${clientesActivos} ${clientesActivos === 1 ? 'activo' : 'activos'}`, href: '/clientes?tipo=clientes', icono: Users },
    { etiqueta: 'Artículos', dato: productos === productosActivos ? String(productos) : `${productosActivos} de ${productos}`, href: '/productos', icono: Package },
    { etiqueta: 'Documentos', href: '/documentos', icono: FolderOpen },
    { etiqueta: 'Informes', href: '/informes', icono: ChartColumn },
  ];

  return (
    <aside className="accesos" aria-label="Atajos">
      {estadoAeat}

      <section className="accesos-hoja" aria-labelledby="accesos-crear">
        <h2 id="accesos-crear" className="accesos-titulo">Crear</h2>
        <ul className="accesos-crear">
          {crear.map(a => (
            <li key={a.href}>
              <Link href={a.href} className="accesos-crear-boton">
                <a.icono size={16} aria-hidden="true" />
                <span>{a.etiqueta}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav className="accesos-hoja" aria-labelledby="accesos-ir">
        <h2 id="accesos-ir" className="accesos-titulo">Accesos</h2>
        <ul className="accesos-lista">
          {cartera.map(c => (
            <li key={c.href}>
              <Link href={c.href} className="accesos-fila">
                <c.icono size={15} aria-hidden="true" />
                <span className="accesos-fila-nombre">{c.etiqueta}</span>
                {c.dato && <span className="accesos-fila-dato">{c.dato}</span>}
                <ChevronRight size={14} aria-hidden="true" className="accesos-fila-flecha" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/ajustes#panel-inicio" className="accesos-personalizar">
          <Settings2 size={14} aria-hidden="true" /> Elegir qué se ve en este panel
        </Link>
      </nav>
    </aside>
  );
}
