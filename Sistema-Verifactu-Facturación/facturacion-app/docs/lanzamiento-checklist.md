# Qué falta para salir al mercado

Última revisión: 2026-09-22. Lo que bloquea el cobro va primero.

## Bloqueantes — sólo quedan cosas que tienes que decidir tú

- [ ] **Rellenar los datos del titular** en `src/lib/legal/datos.ts`:
      nombre o razón social, NIF, domicilio fiscal y email de contacto.
      Las cuatro páginas legales ya existen y están enlazadas en el pie,
      pero mientras esos campos estén vacíos cada una avisa arriba de que
      el documento está sin completar. Son cuatro líneas.
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
- [ ] **No se envía ningún correo.** Ni la factura al cliente, ni aviso
      de cobro fallido, ni recordatorio de vencimiento.
- [ ] **Certificado Veri\*Factu real** y datos del productor en
      `verifactu_config`. Sin eso los registros se quedan en cola.
- [ ] **Acceso para gestorías.** El plan está anunciado a 15 €/empresa
      pero no se puede contratar: falta construir la invitación desde la
      cuenta del cliente, el permiso de sólo lectura y el panel de
      empresas. Es la pieza grande que queda.
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
