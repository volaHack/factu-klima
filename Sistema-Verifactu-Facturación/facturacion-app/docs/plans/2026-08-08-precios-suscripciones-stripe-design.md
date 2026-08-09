# Diseño: página de precios + suscripciones mensuales/anuales por Stripe

## Origen

Elena quiere monetizar la propia app como SaaS: venderla a otros autónomos/pymes
con planes de suscripción mensual o anual, en vez de (o además de) usarla ella
misma. Hasta ahora la app ya soporta múltiples cuentas independientes de forma
nativa (RLS por `user_id` en todas las tablas, signup público en `/login`), así
que esto es una capa de monetización sobre una base ya multi-tenant, no una
reestructuración.

Decisiones tomadas por Elena durante el diseño (ver conversación 2026-08-08):
- 3 planes de pago, sin nivel gratis ni prueba gratuita.
- El diferenciador entre planes es el número de facturas emitidas al mes.
- Al alcanzar el límite mensual, se bloquea crear factura nueva (no solo un aviso).
- Facturación mensual y anual, con el anual a 10x el precio mensual (2 meses
  "gratis" respecto a pagar mes a mes), patrón estándar en SaaS.
- Página standalone en `/precios`, sin landing page alrededor.
- El rediseño visual completo de la app ("que no parezca IA", quitar
  gradientes) queda **fuera de alcance de este documento** — es un esfuerzo de
  diseño transversal distinto, a abordar por separado.

## Planes y precios

| Plan | Mensual | Anual | Facturas/mes |
|---|---|---|---|
| Básico | 49 € | 490 € | 15 |
| Pro (destacado en la UI) | 79 € | 790 € | 100 |
| Sin límite | 119 € | 1.190 € * | ∞ |

\* Anual de "Sin límite" asumido siguiendo el patrón 10x de los otros dos
planes — Elena no dio esta cifra explícitamente. Confirmar antes de crear el
Price correspondiente en Stripe, o ajustar si no es 1.190 €.

Estos precios quedan por encima del rango observado en competidores españoles
(Holded, Billin, FacturaDirecta: ~7,50–29,90 €/mes) — posicionamiento premium
deliberado de Elena, señalado y confirmado durante el diseño, no un descuido.

## Arquitectura

**Stripe Billing con páginas alojadas, no Stripe Elements a medida:**
- Checkout de Stripe en modo `subscription` (no `payment`, que es el que ya
  usa `/api/stripe/checkout` para cobrar facturas puntuales — son dos flujos
  Stripe distintos y no deben mezclarse).
- 6 Price IDs en Stripe (3 planes × mensual/anual), agrupados en 3 Products.
- Customer Portal de Stripe para que el usuario cambie de plan o cancele —
  página alojada por Stripe, no se construye una pantalla de gestión propia.

## Modelo de datos

4 columnas nuevas en `company_settings` (ya es la tabla de 1 fila por
usuario; no se crea una tabla `subscriptions` separada porque no hay
soporte de equipos/multi-suscripción por diseño):

- `subscription_plan` (`'basico' | 'pro' | 'sin_limite' | null`)
- `subscription_status` (`'active' | 'past_due' | 'canceled' | null`)
- `stripe_customer_id`
- `stripe_subscription_id`

Estas columnas **no** pasan por `saveCompanySettings` (el usuario no las edita
desde Ajustes): las escribe únicamente el webhook de Stripe con la service
role key, igual que ya hace hoy con `invoices.status = 'pagada'`.

## Aplicación del límite — dos capas

1. **UI**: antes de navegar a "Nueva factura", se comprueba
   `subscription_status === 'active'` y el recuento de facturas del mes
   contra el límite del plan. Si no cumple, se muestra un aviso con enlace a
   `/precios` en vez de abrir el formulario.
2. **Base de datos**: un trigger `BEFORE INSERT ON invoices` (mismo patrón que
   los triggers cross-tenant de la migración 004) rechaza el INSERT si el
   usuario no tiene una suscripción activa o ya superó su límite mensual.
   Necesario porque la capa de UI por sí sola es evitable llamando a la API
   REST de Supabase directamente — igual que ya se decidió para el
   antifraude e integridad cross-tenant.

Una cuenta nueva sin suscripción activa tiene el límite implícito de 0
facturas: el único camino para facturar por primera vez es pasar por
`/precios`.

## Página `/precios`

- Ruta pública (sin sesión), 3 tarjetas de plan, toggle mensual/anual.
- Plan "Pro" visualmente destacado (borde/badge), tal como pidió Elena.
- Enlazada desde `/login` (para quien aún no tiene cuenta ni plan) y desde el
  aviso de límite alcanzado (para quien ya es cliente y quiere subir de plan).
- Sin landing page alrededor — es una página aislada, no un sitio de marketing.

## Fuera de alcance (explícitamente)

- Rediseño visual completo de la app / quitar gradientes tipo IA — conversación
  de diseño aparte, pendiente de abrir.
- Landing page de marketing con hero/features/testimonios.
- Prueba gratuita o nivel gratis.
- Facturación por asientos/equipos (la app sigue siendo 1 usuario = 1 empresa).
