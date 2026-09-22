import type { Metadata } from 'next';

import PaginaLegal from '@/components/public/PaginaLegal';
import { ENCARGADOS, TITULAR, dato } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Qué datos trata Klima Solutions, para qué, durante cuánto tiempo y cómo ejercer tus derechos.',
  alternates: { canonical: '/legal/privacidad' },
};

export default function Privacidad() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      entradilla="Qué datos tratamos, para qué, quién los toca y qué puedes exigirnos."
    >
      <section className="legal-seccion">
        <h2>Quién es el responsable</h2>
        <p>
          {dato(TITULAR.titular, 'nombre o razón social')}, con NIF{' '}
          {dato(TITULAR.nif, 'NIF')} y domicilio en{' '}
          {dato(TITULAR.domicilio, 'domicilio fiscal')}. Para cualquier cosa
          relacionada con tus datos: {dato(TITULAR.email, 'email de contacto')}.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Dos papeles distintos, y conviene no mezclarlos</h2>
        <p>
          Somos <strong>responsables</strong> de los datos de tu cuenta: tu
          correo, tu nombre, tus datos fiscales y lo que haga falta para
          cobrarte la suscripción.
        </p>
        <p>
          De los datos que tú metes en el programa —tus clientes, sus NIF, sus
          facturas— eres <strong>tú</strong> el responsable. Nosotros sólo los
          guardamos y los procesamos por tu cuenta, siguiendo tus
          instrucciones, como <strong>encargados del tratamiento</strong>. No
          los usamos para nada más: ni los vendemos, ni los cedemos, ni
          entrenamos nada con ellos.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Qué datos y con qué base legal</h2>
        <ul className="legal-lista">
          <li>
            <strong>Cuenta y acceso</strong> (correo, contraseña cifrada,
            nombre): para poder darte el servicio. Base: la ejecución del
            contrato.
          </li>
          <li>
            <strong>Datos fiscales</strong> (nombre o razón social, NIF,
            domicilio): para emitir tu factura de suscripción. Base: obligación
            legal.
          </li>
          <li>
            <strong>Datos de pago</strong>: los trata Stripe. Nosotros no
            vemos ni guardamos el número de tu tarjeta. Base: ejecución del
            contrato.
          </li>
          <li>
            <strong>Contenido de tu cuenta</strong> (clientes, productos,
            facturas, documentos): lo tratamos por tu cuenta, como encargados.
          </li>
          <li>
            <strong>Registros técnicos</strong> (direcciones IP y errores del
            servidor): para que el servicio funcione y sea seguro. Base:
            interés legítimo.
          </li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Quién más toca los datos</h2>
        <p>
          Sólo estos proveedores, y cada uno para lo suyo:
        </p>
        <ul className="legal-lista">
          {ENCARGADOS.map(e => (
            <li key={e.nombre}>
              <strong>{e.nombre}</strong> — {e.papel}. {e.ubicacion}.
            </li>
          ))}
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Cuánto tiempo se conservan</h2>
        <p>
          Mientras tengas la cuenta abierta. Cuando la cierres, borramos lo que
          podemos borrar. Lo que no podemos es lo que la ley nos obliga a
          conservar: las facturas y sus registros de facturación se guardan{' '}
          <strong>cuatro años</strong> por la normativa tributaria, y los
          registros Veri*Factu ya enviados a la Agencia Tributaria no se pueden
          retirar de allí.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Tus derechos</h2>
        <p>
          Puedes pedirnos acceso a tus datos, que los corrijamos, que los
          borremos, que limitemos su uso, oponerte a un tratamiento y pedir que
          te los entreguemos en un formato que puedas llevarte (el programa
          tiene su propia exportación en Ajustes, que puedes usar cuando
          quieras, sin pedir permiso).
        </p>
        <p>
          Escribe a {dato(TITULAR.email, 'email de contacto')} y te
          contestamos. Si crees que no lo hacemos bien, puedes reclamar ante la
          Agencia Española de Protección de Datos (aepd.es).
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Seguridad</h2>
        <p>
          Los datos viajan cifrados y cada cuenta está aislada de las demás por
          reglas de acceso en la propia base de datos, no sólo en la
          aplicación. Los certificados digitales que subes para Veri*Factu se
          guardan cifrados y su contraseña no baja nunca al navegador.
        </p>
      </section>
    </PaginaLegal>
  );
}
