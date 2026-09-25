import type { ReactNode } from 'react';

import SiteNav from '@/components/public/SiteNav';
import SiteFooter from '@/components/public/SiteFooter';
import { ULTIMA_REVISION, datosCompletos } from '@/lib/legal/datos';

/**
 * El envoltorio de los cuatro documentos legales.
 *
 * Mientras los datos del titular estén sin rellenar, el aviso de arriba
 * lo dice en la propia página. Un documento legal a medias que aparenta
 * estar completo es peor que uno que reconoce que le falta un dato:
 * quien lo lea sabe a qué atenerse, y quien lo tiene que rellenar no se
 * olvida.
 */
export default function PaginaLegal({
  titulo,
  entradilla,
  children,
  completo = datosCompletos,
}: {
  titulo: string;
  entradilla: string;
  children: ReactNode;
  /** Si los datos del titular están completos (ver lib/legal/titular.ts). */
  completo?: boolean;
}) {
  return (
    <div className="site-page legal-page">
      <SiteNav />

      <main className="legal-doc">
        <header className="legal-doc-header">
          <h1 className="legal-doc-title">{titulo}</h1>
          <p className="legal-doc-lead">{entradilla}</p>
          <p className="legal-doc-fecha">Última revisión: {ULTIMA_REVISION}</p>
        </header>

        {!completo && (
          <div className="legal-aviso" role="status">
            <strong>Documento pendiente de completar.</strong> Faltan los datos
            identificativos del titular (nombre o razón social, NIF, domicilio
            fiscal y dirección de contacto). Hasta que se rellenen en
            Administración → Configuración, este texto no es válido para
            cumplir con la normativa.
          </div>
        )}

        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
