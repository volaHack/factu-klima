import type { Metadata } from 'next';

import PaginaLegal from '@/components/public/PaginaLegal';
import { TITULAR, dato } from '@/lib/legal/datos';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description:
    'Condiciones de uso y de contratación de Klima Solutions: planes, cobros, cancelación y responsabilidades.',
  alternates: { canonical: '/legal/terminos' },
};

export default function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      entradilla="Qué contratas, qué se paga, cómo se cancela y de qué responde cada uno."
    >
      <section className="legal-seccion">
        <h2>Quién presta el servicio</h2>
        <p>
          {dato(TITULAR.titular, 'nombre o razón social')}, NIF{' '}
          {dato(TITULAR.nif, 'NIF')}, con domicilio en{' '}
          {dato(TITULAR.domicilio, 'domicilio fiscal')} y contacto en{' '}
          {dato(TITULAR.email, 'email de contacto')}.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Qué es Klima</h2>
        <p>
          Un programa de facturación por suscripción que emite facturas con
          registro encadenado conforme al Real Decreto 1007/2023 (Veri*Factu),
          las sella con su huella y, cuando tienes el certificado puesto, las
          envía a la Agencia Tributaria.
        </p>
        <p>
          El programa es una herramienta: no somos tu asesoría. Los datos que
          introduces, los impuestos que aplicas y lo que declaras son tu
          responsabilidad.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Cuenta</h2>
        <ul className="legal-lista">
          <li>Haces falta ser mayor de edad y actuar como empresa o profesional.</li>
          <li>Los datos fiscales que das tienen que ser ciertos: salen impresos en tus facturas.</li>
          <li>Eres responsable de tu contraseña y de quién entra con tu cuenta.</li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Planes y cobros</h2>
        <ul className="legal-lista">
          <li>
            Los planes, sus precios y sus límites son los publicados en{' '}
            <a href="/precios">la página de precios</a> en el momento de
            contratar.
          </li>
          <li>
            Los precios se indican <strong>sin impuestos indirectos</strong>. El
            impuesto que corresponda (IGIC o IVA) se aplica según la normativa
            vigente y dónde esté establecido el cliente.
          </li>
          <li>
            El cobro es por adelantado, mensual o anual, con renovación
            automática. Lo gestiona Stripe.
          </li>
          <li>
            Si un cobro falla, se reintenta. Si no llega a buen fin, la
            suscripción queda suspendida y no se pueden emitir facturas nuevas.
          </li>
          <li>
            Al llegar al límite de facturas de tu plan, el programa impide
            emitir más hasta que subas de plan o empiece el mes siguiente. Tus
            facturas ya emitidas no se tocan.
          </li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Cancelación y devoluciones</h2>
        <ul className="legal-lista">
          <li>Puedes cancelar cuando quieras, sin permanencia, desde Ajustes.</li>
          <li>
            En el plan mensual, la cancelación surte efecto al final del periodo
            ya pagado.
          </li>
          <li>
            En el plan anual, si cancelas antes de tiempo se devuelve la parte
            no usada, prorrateada por meses completos.
          </li>
          <li>
            Cancelar no borra tus datos: puedes exportarlos desde Ajustes antes
            o después de cancelar.
          </li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>Disponibilidad</h2>
        <p>
          Trabajamos para que el servicio esté siempre disponible, pero no
          garantizamos un porcentaje concreto de disponibilidad ni la ausencia
          de fallos. Puede haber paradas por mantenimiento, y avisaremos cuando
          sean previsibles. La aplicación sigue funcionando sin conexión y
          sincroniza cuando vuelve la línea.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Lo que no se puede hacer</h2>
        <ul className="legal-lista">
          <li>Usar el programa para emitir facturas falsas o alterar registros ya sellados.</li>
          <li>Revender el servicio o dar acceso a terceros ajenos a tu empresa.</li>
          <li>Intentar saltarse los límites del plan o acceder a datos de otras cuentas.</li>
        </ul>
        <p>
          El sistema antifraude rechaza por sí mismo modificar o borrar una
          factura sellada: no es una promesa, es un cerrojo en la base de datos.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Responsabilidad</h2>
        <p>
          Respondemos de los daños directos que nos sean imputables, con el
          límite del importe que hayas pagado en los doce meses anteriores. No
          respondemos del lucro cesante ni de sanciones derivadas de datos mal
          introducidos, de declaraciones presentadas fuera de plazo o de un
          certificado digital caducado.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>Cambios y ley aplicable</h2>
        <p>
          Podemos cambiar estas condiciones avisando con antelación razonable;
          si el cambio te perjudica, puedes cancelar. Se aplica la ley española
          y, salvo que la normativa de consumo diga otra cosa, los juzgados del
          domicilio del prestador.
        </p>
      </section>
    </PaginaLegal>
  );
}
