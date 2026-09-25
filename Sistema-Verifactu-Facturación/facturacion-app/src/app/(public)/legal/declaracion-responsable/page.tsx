import type { Metadata } from 'next';

import PaginaLegal from '@/components/public/PaginaLegal';
import { productorDePlataforma } from '@/lib/plataforma/productor';

export const metadata: Metadata = {
  title: 'Declaración responsable del sistema informático de facturación',
  description: 'Declaración responsable del productor del software conforme al Real Decreto 1007/2023 y la Orden HAC/1177/2024.',
  alternates: { canonical: '/legal/declaracion-responsable' },
};

// Los datos se editan en Administración: se leen en cada visita.
export const dynamic = 'force-dynamic';

const falta = (v: string | null | undefined, nombre: string) => v || `[pendiente: ${nombre}]`;
const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * LA DECLARACIÓN RESPONSABLE
 *
 * Quien produce un sistema informático de facturación declara que cumple
 * el reglamento (art. 29.2.j de la Ley General Tributaria, RD 1007/2023 y
 * Orden HAC/1177/2024), y la declaración tiene que poder consultarse en el
 * propio sistema. Los datos salen de Administración → Configuración.
 * Mientras no tenga fecha de firma, la página dice que es un borrador.
 *
 * El texto es un modelo: revísalo con tu asesor antes de firmarlo.
 */
export default async function DeclaracionResponsable() {
  const p = await productorDePlataforma();
  const firmada = Boolean(p?.nombre && p?.nif && p?.domicilio && p?.fecha);

  return (
    <PaginaLegal
      completo // el aviso propio de abajo es más preciso (dice también lo de la fecha)
      titulo="Declaración responsable"
      entradilla="Del sistema informático de facturación, como exigen el Real Decreto 1007/2023 y la Orden HAC/1177/2024."
    >
      {!firmada && (
        <div className="legal-aviso" role="status">
          <strong>Borrador pendiente de firma.</strong> Faltan datos del productor o la fecha de suscripción.
          Se completan en Administración → Configuración.
        </div>
      )}

      <section className="legal-seccion">
        <h2>1. Sistema informático de facturación</h2>
        <ul className="legal-lista">
          <li><strong>Nombre:</strong> {p?.sistemaNombre ?? 'FactuKlima'}</li>
          <li><strong>Código identificador:</strong> {p?.sistemaId ?? 'FK'}</li>
          <li><strong>Versión:</strong> {p?.sistemaVersion ?? '1.0'}</li>
          <li>
            <strong>Componentes y funcionalidades:</strong> aplicación web y de escritorio que se usa desde el navegador,
            con servidor y base de datos alojados en la nube. Permite emitir facturas completas, simplificadas
            (tickets de TPV) y rectificativas; genera por cada una un registro de facturación encadenado con su huella,
            y los remite a la Agencia Tributaria. Incluye, además, gestión de clientes, productos, cobros, gastos,
            contabilidad y listados fiscales.
          </li>
          <li>
            <strong>Modalidad:</strong> funciona exclusivamente como sistema de emisión de facturas verificables
            («VERI*FACTU»): todos los registros se remiten a la Agencia Tributaria. No usa la modalidad de
            conservación con firma electrónica.
          </li>
          <li>
            <strong>Uso por varios obligados tributarios:</strong> sí. Una misma instalación da servicio a varias
            empresas y profesionales, cada una con sus registros separados y su propia cadena.
          </li>
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>2. Productor</h2>
        <ul className="legal-lista">
          <li><strong>Nombre o razón social:</strong> {falta(p?.nombre, 'nombre o razón social')}</li>
          <li><strong>NIF:</strong> {falta(p?.nif, 'NIF')}</li>
          <li><strong>Dirección postal de contacto:</strong> {falta(p?.domicilio, 'domicilio completo')}</li>
          {p?.email && <li><strong>Correo electrónico:</strong> {p.email}</li>}
        </ul>
      </section>

      <section className="legal-seccion">
        <h2>3. Declaración</h2>
        <p>
          El productor arriba identificado declara, bajo su responsabilidad, que el sistema informático de facturación
          descrito, en la versión indicada, cumple lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de
          diciembre, General Tributaria; en el Reglamento que establece los requisitos que deben adoptar los sistemas y
          programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales,
          aprobado por el Real Decreto 1007/2023, de 5 de diciembre; y en la Orden HAC/1177/2024, de 17 de octubre, que
          desarrolla sus especificaciones técnicas, funcionales y de contenido.
        </p>
        <p>
          En particular, garantiza la integridad, conservación, accesibilidad, legibilidad, trazabilidad e
          inalterabilidad de los registros de facturación, y su remisión a la Agencia Estatal de Administración
          Tributaria.
        </p>
      </section>

      <section className="legal-seccion">
        <h2>4. Suscripción</h2>
        <p>
          {firmada
            ? <>En {falta(p?.lugar, 'lugar')}, a {fechaLarga(p!.fecha!)}.</>
            : 'Pendiente de fecha y lugar de suscripción.'}
        </p>
      </section>
    </PaginaLegal>
  );
}
