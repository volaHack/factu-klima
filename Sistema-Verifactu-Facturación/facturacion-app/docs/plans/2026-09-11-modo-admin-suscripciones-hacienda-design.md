# Diseño: modo administradora, suscripciones y Hacienda de la propia plataforma

Aprobado por Elena el 2026-09-11, las tres fases.

## Origen

Elena quiere administrar todo el software desde un sitio: ver las cuentas y
las suscripciones activas, activar y cambiar planes, y que los cobros de la
plataforma (suscripciones y propinas) queden facturados y preparados para
Hacienda sin trabajo manual.

## Lo que se encontró antes de diseñar

1. **Los clientes que pagan nunca se activan.** `/api/stripe/webhook` sólo
   escucha `checkout.session.completed` para marcar pagadas las facturas de
   los inquilinos. Nada escucha el alta ni el cobro de una suscripción, así
   que un pago no cambia el plan de nadie. El diseño de agosto
   (`2026-08-08-precios-suscripciones-stripe-design.md`) ya preveía que el
   webhook escribiera el plan; se quedó sin hacer.
2. **Cualquier usuario puede ponerse un plan gratis.** Ajustes tiene tarjetas
   de plan y un interruptor que escriben `plan_id` y `subscription_status`
   (`ajustes/page.tsx`, bloque «Plan de Suscripción y Membresía»). La
   política RLS `settings_user_policy` deja al usuario actualizar su fila y
   `fn_settings_guard` sólo protege el NIF y el contador. El trigger
   `fn_check_subscription_limit` se fía de ese mismo estado: cualquiera emite
   sin límite sin pagar.
3. **La interfaz enseña «Sin suscripción» a todas las cuentas menos a una.**
   `getCompanySettings` fuerza `subscriptionStatus = 'inactive'` a todo el
   que no sea volitancrooss@gmail.com.
4. **«Admin» es un email escrito a mano** en `storage.ts`, en el trigger de
   límite y en la migración 005. No hay roles.
5. **Stripe está en modo pruebas**, con 0 suscripciones, 0 cobros y ningún
   webhook dado de alta. Los 6 precios no llevan impuesto
   (`tax_behavior: unspecified`, sin tasas creadas). «Sin límite» está a
   110/1.100 € en Stripe y a 119/1.190 € en `plans.ts` y en la web.
6. **Las propinas no se registran** en ningún sitio: van a Stripe con
   `metadata.tipo = 'tip_apoyo'` y ahí se quedan.
7. **La cuenta de Elena no ha facturado ningún cobro de la plataforma**
   (0 facturas selladas).
8. **Elena es autónoma con domicilio fiscal en Canarias**: su impuesto
   indirecto es el IGIC y se declara en el modelo 420 ante la Agencia
   Tributaria Canaria. El IRPF (130) y Veri*Factu siguen siendo de la AEAT.
   Su cuenta tiene la dirección de Sevilla, que es un error.
9. Ya existen los generadores de los modelos 420, 415, 425 (ATC) y 303, 130,
   131, 347 (AEAT) en `src/lib/fiscal/`. El del 420 calcula y valida pero no
   genera fichero: la ATC no publica formato.
10. Ninguno de los triggers de `invoices`, `invoice_line_items` e
    `invoice_tax_breakdown` usa `auth.uid()`: el servidor puede emitir y
    sellar con la service role por el mismo camino que la app.

## Decisiones de Elena

| Tema | Decisión |
|---|---|
| Hacienda | Yo preparo, tú presentas. Nada se presenta solo. |
| Qué ve la admin de cada cuenta | Sólo la cuenta. Ni facturas ni clientes de los inquilinos. |
| Propinas | Factura simplificada con el impuesto incluido. |
| Planes desde el panel | Los de pago siempre por Stripe; además, cortesías con fecha de fin y motivo obligatorios. |
| Impuesto sobre el precio | Delegado («haz lo que creas»): el precio es la base y el impuesto se suma según dónde esté el cliente. |
| Dónde vive el panel | Dentro de la app, en `/admin`. |

## Fase 1 — Cerrar los agujeros y crear el rol

### Modelo de datos

**`administradores`** — `user_id` (PK, `auth.users`), `creado_en`, `nota`.
RLS activado y **sin ninguna política**: no se lee ni se escribe desde la
API pública. Sólo se rellena desde el editor SQL de Supabase. La función
`es_admin(uid)` (SECURITY DEFINER) es la única forma de preguntar.

**`suscripciones`** — una fila por cuenta:
`user_id` (PK), `origen` (`stripe` | `cortesia`), `plan_id`, `estado`
(`active` | `past_due` | `canceled` | `inactive`), `stripe_customer_id`,
`stripe_subscription_id` (único), `periodo_fin`, `cancela_al_final`,
`cortesia_hasta`, `motivo`, `actualizado_en`.
RLS: el usuario sólo puede **leer** la suya. Escriben el webhook y la API
de administración, ambos en el servidor con la service role.

**`stripe_eventos`** — `id` del evento (PK), `tipo`, `recibido_en`,
`procesado_en`, `error`. Idempotencia y rastro de lo que ha llegado.

**`admin_registro`** — `admin_id`, `accion`, `cuenta_id`, `detalle` (jsonb),
`motivo`, `creado_en`. Un trigger rechaza UPDATE y DELETE.

### Cambios

- `fn_check_subscription_limit` lee `suscripciones` en vez de
  `company_settings`; una cortesía vale hasta `cortesia_hasta`; una cuenta
  admin no tiene límite (`es_admin`). Fuera el email escrito a mano.
- `getCompanySettings` deja de forzar el estado: lee `suscripciones`.
- Ajustes: fuera las tarjetas de plan y el interruptor. Queda el estado real
  en sólo lectura y un botón «Gestionar suscripción» que abre el Customer
  Portal de Stripe.
- Webhook de Stripe: además de lo que ya hace, escucha
  `checkout.session.completed` (modo suscripción: enlaza el cliente de
  Stripe con la cuenta), `customer.subscription.created/updated/deleted`,
  `invoice.paid` e `invoice.payment_failed`. Cada evento pasa por
  `stripe_eventos` antes de tocar nada.
- `subscribe` exige que la cuenta tenga NIF y dirección antes de abrir el
  pago (el plan anual supera los 400 € de la factura simplificada), y activa
  `tax_id_collection` en Checkout como respaldo.
- Migración de datos: las columnas de plan de `company_settings` se vuelcan
  a `suscripciones`. Las cuentas «activas» sin suscripción en Stripe (hoy 2)
  pasan a cortesía de 30 días con motivo «activada sin cobro antes del
  cambio»; Elena decide después desde el panel. Las columnas viejas se
  quedan sin uso hasta una migración de limpieza posterior.

## Fase 2 — Panel `/admin`

- **Acceso**: sesión + `es_admin` + 2FA (nivel `aal2` de Supabase Auth),
  comprobado en el servidor en cada página y en cada llamada a
  `/api/admin/*`. Un no-admin recibe 404 en las páginas y 403 en la API. El
  enlace «Administración» sólo se pinta para admins.
- **Resumen**: ingresos recurrentes mensuales, cuentas activas por plan,
  altas y bajas del mes, cobros fallidos, cobros sin factura (fase 3).
- **Cuentas**: buscador; email, nombre fiscal, NIF, plan, estado, próximo
  cobro, facturas emitidas este mes, última actividad. Sólo metadatos: el
  panel no lee facturas, clientes ni productos de los inquilinos.
- **Ficha de cuenta**: cambiar plan, cancelar (al final del periodo o ya),
  devolver un cobro — todo contra la API de Stripe, que después avisa por
  webhook — y dar o quitar una cortesía (fecha de fin y motivo
  obligatorios). Cada acción escribe en `admin_registro`.
- **Registro**: lista de lo anterior, filtrable por cuenta.

## Fase 3 — Facturación automática y Hacienda

### Facturas de la plataforma

Se emiten en la cuenta de Elena (`plataforma_config.emisor_user_id`), con
series propias para suscripciones y para propinas, y quedan selladas por el
mismo trigger que el resto. Idempotencia: columna `origen_externo` única en
`invoices` (`stripe:in_…`, `stripe:cs_…`). Un evento repetido no crea una
segunda factura.

| Cobro | Destinatario | Impuesto en la factura |
|---|---|---|
| Suscripción | Cuenta con CP 35xxx/38xxx (Canarias) | Base + IGIC 7 % |
| Suscripción | Resto de España | Sin impuesto, mención de inversión del sujeto pasivo |
| Suscripción | Ceuta, Melilla, extranjero, sin CP | No se factura sola: aparece en el panel para revisión |
| Propina | Sin identificar | Simplificada, IGIC 7 % incluido (5 € = 4,67 + 0,33) |
| Devolución | La de la factura original | Rectificativa automática |

Los datos del destinatario salen de su `company_settings` en el momento del
cobro. Stripe cobra el mismo impuesto: la tasa IGIC 7 % se aplica en
`subscribe` sólo a cuentas canarias. El texto de la página de precios pasa
de «precios sin IVA» a explicar que el impuesto depende de dónde esté el
cliente.

`plataforma_config.regimen_igic` (`general` | `pequeno_empresario`): en
régimen de pequeño empresario no se repercute IGIC ni hay 420 trimestral.
Arranca en `general` y **no se activa el cobro con impuesto hasta que el
gestor lo confirme**.

### Envío a la AEAT

La lógica de `/api/verifactu/enviar` se extrae a una función que recibe el
`user_id`, y una tarea programada (Vercel Cron) la ejecuta para la cuenta
emisora. Sin certificado real ni datos del productor en `verifactu_config`,
el envío se queda esperando y el panel lo dice.

### Pestaña Hacienda

Trimestre en curso: ingresos por suscripciones y propinas, IGIC repercutido,
rendimiento para el 130. Cuenta atrás hasta el plazo (20 de abril, julio y
octubre; 30 de enero) y aviso 10 días antes. El 420 y el 130 salen de los
generadores existentes: el 420 se teclea en la sede de la ATC; el 130 se
importa por fichero en la AEAT. Elena presenta; el programa nunca.

## Errores

- Firma del webhook siempre verificada; sin firma, nada se procesa.
- Un evento que falla queda en `stripe_eventos` con su error y Stripe lo
  reintenta; el panel enseña en rojo los cobros sin factura.
- Las acciones del panel no cambian `suscripciones` directamente cuando van
  por Stripe: esperan al webhook, para que haya una sola fuente de verdad.
  Las cortesías sí se escriben directamente (no hay Stripe detrás).
- Rechazos `ANTIFRAUDE:` de la base de datos se muestran tal cual y no se
  reintentan.

## Pruebas

- RLS: un usuario no puede escribir `suscripciones` ni leer
  `administradores`; un no-admin recibe 403 en `/api/admin/*`.
- Trigger de límite: sin suscripción no emite; cortesía caducada no emite;
  admin emite.
- Webhook: cada tipo de evento con cargas de ejemplo de Stripe, el mismo
  evento dos veces, firma inválida.
- Impuesto por zona: Canarias, península, Baleares, Ceuta/Melilla, sin CP.
- Factura de propina: redondeo de base y cuota.
- Todo en modo pruebas de Stripe antes de pasar a cobros reales.

## Lo que tiene que hacer Elena

1. Darse de alta en `administradores` con la línea SQL del plan y activar
   el 2FA.
2. En Stripe: dar de alta el endpoint del webhook con los eventos de arriba,
   crear la tasa IGIC 7 % y alinear «Sin límite» (se recomienda crear los
   precios de 119/1.190 € que ya anuncia la web).
3. Corregir su dirección en Ajustes (Sevilla → domicilio en Canarias).
4. Confirmar con su gestor: régimen del IGIC (general o pequeño empresario),
   tratamiento de clientes peninsulares, propinas, y las cuotas de Stripe,
   Vercel y Supabase (servicios de fuera de Canarias).

## Fuera de alcance

- Presentar modelos automáticamente.
- Acceso de la admin a facturas, clientes o productos de los inquilinos.
- Clientes de fuera de España.
