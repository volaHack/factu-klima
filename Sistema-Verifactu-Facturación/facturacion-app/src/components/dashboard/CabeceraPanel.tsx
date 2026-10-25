'use client';

import Link from 'next/link';
import { Plus, ShieldCheck } from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';

export interface CabeceraPanelProps {
  readonly nombre: string;
  readonly sector: { readonly label: string; readonly icon: string };
  /** Fecha de hoy ya escrita («lunes, 5 de octubre»). */
  readonly fecha: string;
  /** Número que llevará la próxima factura. */
  readonly siguiente: string;
  readonly plan: string;
  readonly sellado: boolean;
}

/**
 * La cabecera del panel: qué día es, de quién es y el botón que más se
 * pulsa. Va sobre el fondo de la página, como el resto de pantallas, y no
 * en una banda oscura: aquella ocupaba media pantalla del móvil para decir
 * el nombre de la empresa, que quien entra ya sabe.
 */
export default function CabeceraPanel({ nombre, sector, fecha, siguiente, plan, sellado }: CabeceraPanelProps) {
  return (
    <header className="panel-cabeza">
      <div className="panel-cabeza-texto">
        <p className="panel-cabeza-fecha">{fecha}</p>
        <h1 className="panel-cabeza-nombre">{nombre}</h1>
        <ul className="panel-cabeza-datos">
          <li>
            <CategoryIcon name={sector.icon} size={13} />
            {sector.label}
          </li>
          <li>
            Próxima factura <span className="panel-cabeza-numero">{siguiente}</span>
          </li>
          {sellado && (
            <li className="panel-cabeza-sello" title="Cada factura lleva su huella SHA-256 encadenada a la anterior">
              <ShieldCheck size={13} aria-hidden="true" />
              Facturas selladas
            </li>
          )}
          <li>
            <Link href="/precios" className="panel-cabeza-enlace">Plan {plan}</Link>
          </li>
        </ul>
      </div>
      <Link href="/facturas/nueva" className="btn btn-primary panel-cabeza-cta">
        <Plus size={16} />
        Nueva factura
      </Link>
    </header>
  );
}
