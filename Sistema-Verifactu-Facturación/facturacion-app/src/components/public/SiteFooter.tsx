'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

const YEAR = 2026;

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/klima-mark.svg" alt="" width={28} height={28} />
          <div>
            <strong>Klima Solutions</strong>
            <p>Facturación con registro encadenado para autónomos y pymes en España.</p>
          </div>
        </div>

        <nav className="site-footer-cols" aria-label="Pie de página">
          <div>
            <h3>Producto</h3>
            <Link href="/">Cómo funciona</Link>
            <Link href="/precios">Planes y precios</Link>
            <Link href="/instalar">Instalar la app</Link>
          </div>
          <div>
            <h3>Cuenta</h3>
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/login">Crear cuenta</Link>
          </div>
          <div>
            <h3>Normativa</h3>
            <a href="https://www.boe.es/eli/es/l/2021/07/09/11" target="_blank" rel="noreferrer noopener">Ley 11/2021</a>
            <a href="https://www.boe.es/eli/es/rd/2023/12/05/1007" target="_blank" rel="noreferrer noopener">RD 1007/2023</a>
            <a href="https://sede.agenciatributaria.gob.es/" target="_blank" rel="noreferrer noopener">Sede de la AEAT</a>
          </div>
        </nav>
      </div>

      {/* Antes aquí iba `.verifactu-badge`, que es dorado: el único color
          fuera de la familia blush/vino/rosa en toda la superficie
          pública. El sello dorado se queda para dentro de la app, donde
          es una insignia de estado; aquí es sólo una nota al pie. */}
      <div className="site-footer-bar">
        <span className="site-footer-seal">
          <ShieldCheck size={13} /> Registros encadenados con huella SHA-256
        </span>
        <p>© {YEAR} Klima Solutions S.L.</p>
      </div>
    </footer>
  );
}
