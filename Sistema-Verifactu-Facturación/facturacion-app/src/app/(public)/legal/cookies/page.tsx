import type { Metadata } from 'next';

import PaginaLegal from '@/components/public/PaginaLegal';
import { TITULAR, dato } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Política de cookies',
  description:
    'Qué se guarda en tu navegador al usar Klima Solutions: cookies técnicas de sesión y almacenamiento local. Sin analítica ni publicidad.',
  alternates: { canonical: '/legal/cookies' },
};

export default function Cookies() {
  return (
    <PaginaLegal
      titulo="Política de cookies"
      entradilla="Lo que se guarda en tu navegador, que es poco y todo necesario."
    >
      <section className="legal-seccion">
        <h2>No hay banner porque no hace falta</h2>
        <p>
          Este sitio no usa cookies de analítica, de publicidad ni de
          seguimiento. Sólo guarda lo estrictamente necesario para que puedas
          iniciar sesión y para que el programa funcione, y para eso la
          normativa no exige pedir consentimiento.
        </p>
        <p>
          Si algún día se añade analítica, aparecerá el aviso correspondiente y
          se pedirá permiso antes de activarla.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Qué se guarda</h2>
        <ul className="legal-lista">
          <li>
            <strong>Cookies de sesión (Supabase).</strong> Mantienen tu sesión
            abierta y permiten renovarla. Sin ellas habría que iniciar sesión en
            cada página. Caducan al cerrar sesión o al expirar.
          </li>
          <li>
            <strong>Preferencias locales.</strong> El tema claro u oscuro y
            algunos ajustes de pantalla se guardan en el propio navegador
            (localStorage). No viajan a ningún servidor.
          </li>
          <li>
            <strong>Base de datos local (IndexedDB).</strong> Es lo que permite
            seguir facturando sin conexión: tus documentos se guardan en el
            dispositivo y suben cuando vuelve la línea. Se vacía al cerrar
            sesión.
          </li>
          <li>
            <strong>Service worker.</strong> Guarda la aplicación para que abra
            sin línea. No guarda datos personales.
          </li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Cómo quitarlo</h2>
        <p>
          Cerrando sesión se borra la base local. Y desde los ajustes de tu
          navegador puedes eliminar cookies y datos de este sitio cuando
          quieras; ten en cuenta que entonces tendrás que volver a iniciar
          sesión y que lo que no se hubiera sincronizado aún se perdería.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Dudas</h2>
        <p>Escribe a {dato(TITULAR.email, 'email de contacto')}.</p>
      </section>
    </PaginaLegal>
  );
}
