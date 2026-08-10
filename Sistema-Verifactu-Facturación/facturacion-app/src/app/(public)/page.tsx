'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';

import SiteNav from '@/components/public/SiteNav';
import SiteFooter from '@/components/public/SiteFooter';
import ChainDemo from '@/components/public/ChainDemo';
import Cinta from '@/components/public/Cinta';
import Reveal from '@/components/public/Reveal';
import { PLANS } from '@/lib/plans';

/* ------------------------------------------------------------------ *
 * Home.
 *
 * La versión anterior era la landing modal de SaaS: héroe centrado,
 * barra de cuatro cifras, tres tarjetas iguales, rejilla de seis iconos
 * redondeados, tres testimonios y FAQ. Además arrastraba la paleta del
 * diseño viejo en estilos en línea — esmeralda #10b981, morado #a855f7,
 * rosa #ec4899, ámbar, y una sombra negra al 50 % — sobre el sistema
 * blush/vino actual, y las rejillas iban fijas a `repeat(3, 1fr)`, así
 * que por debajo de 700px la página se salía de la pantalla.
 *
 * Esta parte del objeto físico de la marca, que es el que ya había
 * encontrado /instalar: el papel. El mostrador, el rollo de tickets, la
 * factura sellada. Una sola familia de color (blush · vino · rosa), una
 * fotografía que manda en el héroe y, en el centro de la página, la
 * cadena de huellas funcionando de verdad en vez de contada.
 *
 * El héroe va clavado (`.hero-scene` alta, `.home-hero` en `sticky`)
 * mientras el rollo se paga hacia abajo y va imprimiendo registros. El
 * gesto lo hace entero la CSS con `animation-timeline`; ver `Cinta`.
 * ------------------------------------------------------------------ */

const PRECIO_ENTRADA = Math.min(...PLANS.map((p) => p.priceMonthly));

const NORMAS = [
  {
    ref: 'Ley 11/2021',
    titulo: 'Se acabó el software de doble uso',
    texto: 'Un programa de facturación ya no puede permitir llevar dos cuentas ni borrar una venta sin dejar rastro. Ni el que lo vende ni el que lo usa.',
  },
  {
    ref: 'RD 1007/2023',
    titulo: 'Cada registro, íntegro y trazable',
    texto: 'Fija los requisitos que debe cumplir el sistema: integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de cada registro de facturación.',
  },
  {
    ref: 'Orden HAC/1177/2024',
    titulo: 'Huella, encadenamiento y QR',
    texto: 'Concreta el formato técnico: cómo se calcula la huella de cada registro, cómo se encadena con el anterior y qué lleva el código QR impreso en la factura.',
  },
];

const OFICIOS = [
  {
    n: '01',
    titulo: 'El mostrador',
    texto: 'Cobras en caja con el lector de códigos y los atajos F1–F5, entregas el ticket simplificado y cierras el arqueo al bajar la persiana. Si escaneas un código que no existe, das de alta el producto ahí mismo.',
  },
  {
    n: '02',
    titulo: 'La factura',
    texto: 'Emites, envías el PDF y ves de un vistazo quién te debe qué y desde cuándo. Cada emisión entra en la cadena en el mismo momento en que se guarda.',
  },
  {
    n: '03',
    titulo: 'El cobro',
    texto: 'La factura sale con su enlace de pago. El cliente revisa los conceptos, aprueba y paga con tarjeta o Bizum, y la factura se marca como pagada sin que tengas que tocarla.',
  },
];

const CAPACIDADES = [
  ['Informes fiscales', 'IVA e IRPF por trimestre, cuadrados al céntimo y exportables a Excel, CSV o PDF.'],
  ['Registro de eventos', 'Un histórico que no se puede editar, con informe de integridad descargable para el gestor.'],
  ['Certificado FNMT', 'Se guarda cifrado en tu propia cuenta; ni se comparte ni viaja en claro.'],
  ['Aislamiento por usuario', 'Row Level Security en la base de datos: cada cuenta sólo alcanza sus propias filas.'],
  ['Clientes y productos', 'Ficha con historial de facturas, estado de pago y alta rápida al escanear un código nuevo.'],
  ['Portal de aprobación', 'Un enlace público por pedido para que el cliente revise y confirme antes de que emitas.'],
];

const FAQS = [
  {
    q: '¿Qué es la huella SHA-256 y por qué la exige la ley?',
    a: 'SHA-256 convierte el contenido de una factura en 64 caracteres. Cambia un céntimo y salen 64 caracteres completamente distintos. Klima calcula la huella de cada factura incluyendo dentro la huella de la anterior, así que los registros quedan encadenados: alterar uno obliga a recalcular todos los que vinieron después, y eso es justo lo que una comprobación detecta.',
  },
  {
    q: '¿Klima envía mis facturas a la AEAT?',
    a: 'El envío directo a la AEAT por Verifactu forma parte del plan Sin límite y necesita tu certificado FNMT cargado en la cuenta. El sellado, el encadenamiento y el QR se generan desde la primera factura en cualquier plan, se envíe o no el registro.',
  },
  {
    q: '¿El TPV sirve para una tienda o un supermercado?',
    a: 'Está pensado para venta en mostrador con pantalla táctil: lector de código de barras, atajos de teclado F1–F5, venta libre para lo que no está en catálogo, ticket simplificado y apertura y cierre de caja con su informe de arqueo.',
  },
  {
    q: '¿Y si me quedo sin conexión?',
    a: 'Klima es una PWA con base de datos en el propio dispositivo. Sigues emitiendo y cobrando sin línea; las operaciones se encolan y suben solas, en orden y sin duplicar, en cuanto vuelve la conexión.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'No. Se cancela cuando quieras. Si eliges facturación anual pagas el año por adelantado, y al cancelar se devuelve la parte no consumida prorrateada por meses completos.',
  },
  {
    q: '¿Tengo que instalar algo?',
    a: 'No hace falta pasar por Google Play ni por la App Store: se instala desde el navegador en Android, iPhone y Windows, y para Windows además hay instalador .exe. En /instalar tienes el código QR y los pasos de tu dispositivo.',
  },
];

export default function HomePage() {
  const [abierta, setAbierta] = useState<number | null>(0);

  return (
    <div className="site-page home">
      <SiteNav />

      {/* ───────────────────────── Héroe ─────────────────────────
          `.hero-scene` sólo existe para dar recorrido: es el alto que
          consume el héroe clavado mientras se imprime la cinta. Sin
          soporte de scroll-driven animations la CSS la deja en `auto` y
          esto vuelve a ser un héroe normal de una pantalla. */}
      <div className="hero-scene" data-nav-oscura>
        <header className="home-hero">
          <div className="home-hero-foto">
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet="/img/mostrador-760.webp 760w, /img/mostrador-1200.webp 1200w"
                sizes="100vw"
              />
              <img
                className="home-hero-img"
                src="/img/mostrador-1920.webp"
                srcSet="/img/mostrador-1200.webp 1200w, /img/mostrador-1920.webp 1920w"
                sizes="100vw"
                alt="Un rollo de tickets recién impreso cae por el borde de un mostrador de madera mientras unas manos lo separan, en la luz de media tarde de una tienda de barrio."
                width={1920}
                height={1080}
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <div className="home-hero-scrim" />
          </div>

          <div className="home-hero-inner">
            <div className="home-hero-copy">
              <p className="home-hero-kicker">Ley Antifraude · Reglamento Verifactu</p>
              <h1 className="home-hero-title">
                Una factura que ya no<br />se puede <em className="accent-serif">tocar</em>.
              </h1>
              <p className="home-hero-lead">
                Cada factura sale sellada con su huella SHA-256 y encadenada a la
                anterior. Si alguien toca un importe, la rotura queda a la vista.
              </p>
              <div className="home-hero-actions">
                <Link href="/login" className="btn-primary btn-lg">
                  Crear cuenta <ArrowRight size={17} />
                </Link>
                <a href="#cadena" className="btn-ghost-light btn-lg">
                  Romper una cadena
                </a>
              </div>
              <p className="home-hero-meta">
                Desde {PRECIO_ENTRADA} €/mes · Sin permanencia
              </p>
            </div>

            <Cinta />
            <p className="oculto-visualmente">
              Al lado del texto se imprime un rollo con cinco registros de ejemplo. Cada
              uno lleva la huella SHA-256 del anterior, y la cadena entera se puede
              comprobar más abajo, en «Rompe la cadena».
            </p>
          </div>
        </header>
      </div>

      {/* ─────────────────── Lo que pide la norma ─────────────────── */}
      <Reveal className="home-norma">
        <h2 className="home-norma-title">Lo que pide la norma, en tres líneas</h2>
        <ul className="home-norma-list">
          {NORMAS.map((n) => (
            <li key={n.ref}>
              <span className="home-norma-ref">{n.ref}</span>
              <h3>{n.titulo}</h3>
              <p>{n.texto}</p>
            </li>
          ))}
        </ul>
      </Reveal>

      {/* ────────────────────── La cadena ────────────────────── */}
      <Reveal id="cadena" className="home-cadena">
        <div className="home-cadena-head">
          <h2 className="home-h2 home-h2--light">
            Rompe la cadena y verás lo mismo<br />que ve una <em className="accent-serif">inspección</em>
          </h2>
          <p>
            Abajo hay cinco facturas del libro de un mayorista, encadenadas entre sí.
            Baja el importe de una que ya estaba registrada —el clásico «me quito un cero»—
            y mira qué pasa con las que vinieron después.
          </p>
        </div>
        <ChainDemo />
      </Reveal>

      {/* ────────────────────── Tres oficios ────────────────────── */}
      <Reveal className="home-oficios">
        <div className="home-oficios-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/bodegon-1200.webp"
            srcSet="/img/bodegon-720.webp 720w, /img/bodegon-1200.webp 1200w"
            sizes="(max-width: 900px) 100vw, 44vw"
            alt="Sobre un mostrador de madera clara: un rollo de papel térmico, un datáfono inalámbrico moderno y un taco de albaranes sujeto con una pinza."
            width={1200}
            height={900}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="home-oficios-copy">
          <h2 className="home-h2">Tres oficios en el mismo mostrador</h2>
          <p className="home-lead">
            El cobro en caja, el albarán del almacén y el cliente que paga tarde no son
            tres programas distintos. Son tres momentos del mismo día.
          </p>
          <ol className="home-oficios-list">
            {OFICIOS.map((o) => (
              <li key={o.n}>
                <span className="home-oficios-n">{o.n}</span>
                <div>
                  <h3>{o.titulo}</h3>
                  <p>{o.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      {/* ────────────────────── Capacidades ────────────────────── */}
      <Reveal className="home-capacidades">
        <h2 className="home-h2">Y lo que no se ve desde fuera</h2>
        <dl className="home-capacidades-list">
          {CAPACIDADES.map(([titulo, texto]) => (
            <div key={titulo}>
              <dt>{titulo}</dt>
              <dd>{texto}</dd>
            </div>
          ))}
        </dl>
        <Link href="/precios" className="home-inline-link">
          Ver los planes <ArrowUpRight size={15} />
        </Link>
      </Reveal>

      {/* ────────────────────── Sin cobertura ────────────────────── */}
      <Reveal className="home-offline">
        <div className="home-offline-copy">
          <h2 className="home-h2 home-h2--light">
            El día que se cae la línea,<br />sigues <em className="accent-serif">cobrando</em>
          </h2>
          <p>
            Klima guarda las operaciones en el propio dispositivo. En un puesto de mercado,
            en una furgoneta de reparto o en un sótano sin cobertura, la caja sigue abriendo,
            el ticket sigue saliendo y la cadena se sigue formando. Cuando vuelve la línea,
            todo sube solo y en orden.
          </p>
          <ul className="home-offline-chips">
            <li>Base de datos local</li>
            <li>Cola de sincronización</li>
            <li>Sin duplicados al reconectar</li>
          </ul>
        </div>
        <div className="home-offline-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/mercado-1200.webp"
            srcSet="/img/mercado-720.webp 720w, /img/mercado-1200.webp 1200w"
            sizes="(max-width: 900px) 100vw, 46vw"
            alt="Un puesto de mercado moderno bajo un toldo rosa: cajas de madera clara con tomates y cebollas, y una tablet con el TPV encendida junto a ellas."
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
          />
        </div>
      </Reveal>

      {/* ────────────────────── Preguntas ────────────────────── */}
      <Reveal className="home-faq">
        <h2 className="home-h2">Preguntas que nos hacen</h2>
        <ul className="home-faq-list">
          {FAQS.map((faq, i) => {
            const open = abierta === i;
            return (
              <li key={faq.q} className={`home-faq-item ${open ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="home-faq-q"
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setAbierta(open ? null : i)}
                >
                  <span>{faq.q}</span>
                  <Plus size={17} className="home-faq-icon" />
                </button>
                <div id={`faq-panel-${i}`} className="home-faq-a" role="region" aria-hidden={!open}>
                  <div>
                    <p>{faq.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Reveal>

      {/* ────────────────────── Cierre ────────────────────── */}
      <section className="home-cierre">
        <div className="home-cierre-inner">
          <h2>
            La primera factura sellada<br />te lleva <em className="accent-serif">dos minutos</em>
          </h2>
          <p>Sin permanencia. Sin pasar por ninguna tienda de aplicaciones.</p>
          <div className="home-cierre-actions">
            <Link href="/login" className="btn-primary btn-lg">
              Crear cuenta <ArrowRight size={17} />
            </Link>
            <Link href="/precios" className="btn-ghost-light btn-lg">Ver los planes</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
