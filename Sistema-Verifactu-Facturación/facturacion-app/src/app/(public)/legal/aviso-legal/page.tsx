import type { Metadata } from 'next';

import PaginaLegal from '@/components/public/PaginaLegal';
import { TITULAR, dato } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Aviso legal',
  description: 'Datos identificativos del titular de Klima Solutions y condiciones de uso del sitio.',
  alternates: { canonical: '/legal/aviso-legal' },
};

export default function AvisoLegal() {
  return (
    <PaginaLegal
      titulo="Aviso legal"
      entradilla="Quién hay detrás de este sitio, como exige la Ley 34/2002."
    >
      <section className="legal-seccion">
        <h2>Titular</h2>
        <ul className="legal-lista">
          <li><strong>Denominación:</strong> {dato(TITULAR.titular, 'nombre o razón social')}</li>
          <li><strong>NIF:</strong> {dato(TITULAR.nif, 'NIF')}</li>
          <li><strong>Domicilio:</strong> {dato(TITULAR.domicilio, 'domicilio fiscal')}</li>
          <li><strong>Contacto:</strong> {dato(TITULAR.email, 'email de contacto')}</li>
          {TITULAR.registro && <li><strong>Registro mercantil:</strong> {TITULAR.registro}</li>}
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Actividad</h2>
        <p>
          Desarrollo y explotación de un programa de facturación por
          suscripción para empresas y profesionales, con registro de
          facturación encadenado conforme al Real Decreto 1007/2023.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Propiedad intelectual</h2>
        <p>
          El programa, su código, su diseño y sus textos son del titular. Tener
          una suscripción te da derecho a usarlo, no a copiarlo, revenderlo ni
          hacer obras derivadas.
        </p>
        <p>
          Lo que tú creas con él —tus facturas, tus datos, tus plantillas— es
          tuyo, y puedes llevártelo cuando quieras desde la exportación de
          Ajustes.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Enlaces a otros sitios</h2>
        <p>
          Este sitio enlaza a la Sede Electrónica de la Agencia Tributaria y a
          los textos legales que cita. No respondemos de su contenido, que no
          controlamos.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Condiciones de uso del sitio</h2>
        <p>
          Puedes navegar libremente por las páginas públicas. El acceso a la
          aplicación requiere cuenta y suscripción activa, y se rige por los{' '}
          <a href="/legal/terminos">términos y condiciones</a>.
        </p>
      </section>
    </PaginaLegal>
  );
}
