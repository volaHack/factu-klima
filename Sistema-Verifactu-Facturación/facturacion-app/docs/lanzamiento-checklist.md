# Qué falta para salir al mercado

Última revisión: 2026-09-22. Lo que bloquea el cobro va primero.

## Bloqueantes — sólo quedan cosas que tienes que decidir tú

- [ ] **Falta el domicilio fiscal completo** en `src/lib/legal/datos.ts`.
      El nombre (Alexander Carmelo del Pino Pérez), el NIF (78837942Z,
      comprobada su letra de control) y el correo de contacto ya están.
      Del domicilio sólo hay «calle La Cuesta, 10»: falta el **código
      postal y el municipio**, sin los cuales no identifica nada —esa
      calle la hay en media Canarias— y no se sabe en qué territorio se
      tributa. Hasta que estén, las páginas lo enseñan como
      «[pendiente: domicilio fiscal]» y siguen avisando de que el
      documento está sin completar, que es preferible a publicar media
      dirección.

      `src/lib/legal/datos.test.ts` vigila estos campos: rechaza los
      datos de la cuenta de demostración («Distribuciones Alimentarias
      del Sur S.L.», CIF B41567890, Sevilla), comprueba la letra del NIF
      y exige código postal en el domicilio. Si se teclean mal, la CI lo
      para antes de que salga a la web.
- [ ] **El nombre de las facturas y el de las páginas legales no
      coinciden todavía.** Ajustes → Datos de empresa sigue con la
      empresa de demostración, así que las facturas que emite el programa
      salen a nombre de «Distribuciones Alimentarias del Sur S.L.»
      mientras el pie de la web ya dice Alexander Carmelo del Pino Pérez.
      Tienen que ser el mismo nombre, y el mismo que en Stripe.
- [ ] **Decidir la identidad fiscal.** El pie ya no dice «S.L.» (decía
      una forma jurídica que no existe); ahora sale el nombre que pongas
      en esos datos. Tiene que coincidir con el de tu cuenta de Stripe y
      con el de las facturas que emitas.
- [ ] **Stripe en real.** Clave de producción, webhook dado de alta con
      sus eventos, y los precios del plan TPV (29 € y 290 €) en
      `STRIPE_PRICE_TPV_MENSUAL` y `STRIPE_PRICE_TPV_ANUAL`. Hasta que
      existan, la tarjeta del TPV se ve sin botón de compra, a propósito.
      También sigue pendiente alinear «Sin límite»: 119 € en la web,
      110 € en Stripe.
- [ ] **Régimen del IGIC confirmado por tu gestoría.** Decide si se
      repercute impuesto en el cobro y qué modelo presentas.

## Importantes — el servicio funciona sin ello, pero se nota pronto

- [ ] **Nadie se entera si algo falla.** Sigue sin haber monitorización
      de errores en producción.
- [ ] **La ayuda con IA no funciona en producción.** En local sí: hay una
      clave de Gemini en `.env.local` y está viva (comprobada). Lo que
      falta es ponerla en Vercel (Settings → Environment Variables), o
      apuntar `IA_BASE_URL` a un servidor de modelos accesible desde
      internet. El modelo local que hay montado (Qwen 3 4B, ver
      `docs/ia-local.md`) sirve para trabajar y para probar, pero Vercel
      no puede llegar a un modelo que corre en una casa.
- [ ] **No se envía ningún correo.** Ni la factura al cliente, ni aviso
      de cobro fallido, ni recordatorio de vencimiento.
- [ ] **Certificado Veri\*Factu real** y datos del productor en
      `verifactu_config`. Sin eso los registros se quedan en cola.
- [ ] **Cobro del plan de gestorías.** El acceso YA funciona (invitación,
      solo lectura y panel de empresas). Lo que falta es cobrarlo: un
      precio por empresa en Stripe con cantidad variable, y el botón en
      la página de precios.
- [ ] **60 errores de linter heredados** en `src`. La CI los enseña pero
      no bloquea por ellos; cuando se limpien, quitar el
      `continue-on-error` del paso «Linter» en `.github/workflows/ci.yml`.

## Recomendable

- [ ] **Copias de seguridad:** confirmar la política del plan de Supabase
      y probar una restauración. Son facturas selladas: no se regeneran.
- [ ] **Revisar el panel de administración en móvil**, que es lo único
      sin comprobar a 375 px (pide sesión y segundo factor).

## Hecho

### En este repaso
- **Los atajos de teclado, los cinco.** La barra de gestión rápida
  anunciaba D y F y no los escuchaba nadie. Ahora la lista y la decisión
  están en un solo sitio (`lib/atajos.ts`), de donde la barra saca sus
  rótulos, y además dejan de dispararse donde no tocaba: en las páginas
  públicas, con una modal abierta, escribiendo en texto enriquecido y con
  acentos a medio componer.
- **La IA deja de estar casada con Gemini.** Las dos rutas que usan un
  modelo pasan por `lib/ia/cliente.ts`, que habla el dialecto de OpenAI:
  vale un modelo local, uno de pago o Gemini, y se cambia con dos
  variables de entorno. Detalles en `docs/ia-local.md`.
- **Descuento a pie de factura.** Antes sólo se podía descontar línea a
  línea; ahora hay hasta tres descuentos sobre el total (comercial,
  pronto pago, especial), encadenados, en crear y editar facturas. Sale
  en su propio renglón, separado de lo descontado en las líneas, para
  que quien reciba la factura pueda cuadrar las líneas con el total.
- **El sellado contaba mal los descuentos** (migración 046). El
  disparador que recalcula los importes al sellar aplicaba sólo el
  primero de los tres descuentos de línea e ignoraba los de pie: una
  factura con descuento se sellaba por un importe distinto del que se
  veía en pantalla y del que salía impreso. Ahora replica exactamente el
  cálculo de la aplicación. Comprobado contra la base de datos real:
  base 19,89 · descuentos 5,11 · impuestos 3,68 · total 23,57, los
  mismos números que la pantalla, y fijados en un test.
- **Acceso para gestorías, funcionando.** La empresa invita por correo
  desde Ajustes → Tu gestoría; la gestoría entra con SU cuenta, acepta y
  ve los libros de esa empresa en solo lectura, con el reparto por
  trimestres. Los permisos los aplica la base de datos (migración 045),
  no la pantalla, y están probados con dos cuentas reales: tras aceptar
  ve 43 facturas y 48 líneas de esa empresa; no ve sus certificados ni
  sus suscripciones, y un intento de escritura afecta a 0 filas. El
  acceso se retira con un botón, con su fecha.
- **Las cuatro páginas legales**: `/legal/privacidad`, `/legal/terminos`,
  `/legal/aviso-legal` y `/legal/cookies`, enlazadas en el pie, con el
  contenido real (responsable, encargados —Supabase, Vercel, Stripe,
  Google—, bases jurídicas, plazos de conservación, derechos, condiciones
  de contratación, cancelación prorrateada y cookies técnicas).
- **`robots.txt` y `sitemap.xml`**, con las rutas de sesión excluidas y
  `/aprobar/` fuera del índice (son enlaces con token).
- **Integración continua** (`.github/workflows/ci.yml`): tipos, linter y
  tests en cada push y cada pull request.
- **El pop-up «¿Cómo se usa?» ya sale centrado.** Colgaba de la cabecera,
  que lleva `backdrop-filter`, y eso reencuadra cualquier `position:
  fixed` de dentro: el modal se medía contra una franja de 64 px. Ahora
  se pinta con un portal en el `<body>`. Medido: antes 346 px descentrado,
  ahora 0.
- **Índices únicos que faltaban** en órdenes de trabajo y traspasos
  (migración 044): ningún documento puede repetir número. Facturas,
  albaranes, devoluciones y abonos ya lo tenían.
- **Tres tests temporales retirados** (`__visual`, `__detect2`, `__diag`):
  se declaraban temporales, dependían de un paquete no declarado y uno
  llevaba escrita a fuego una ruta local. La batería queda en 1.316
  pruebas, todas en verde.
- **Un error de linter con riesgo real** en clientes (`reload` usado
  antes de declararse: el escuchador se quedaba con la versión del primer
  render).

### En el repaso anterior
- Plan **TPV** a 29 €/mes con tickets ilimitados y 10 facturas completas,
  aplicado por la base de datos (migración 043).
- Se arregló que **el límite de plan no se aplicaba** por el camino
  normal de emisión.
- `/instalar` dejó de ofrecer dos instaladores `.exe` que daban 404.
