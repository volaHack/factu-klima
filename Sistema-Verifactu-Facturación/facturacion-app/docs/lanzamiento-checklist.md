# Qué falta para salir al mercado

Repaso del 2026-09-22. Lo que bloquea el cobro va primero; dentro de cada
bloque, lo más caro de arreglar al final.

## Bloqueantes — sin esto no se puede cobrar

- [ ] **Páginas legales.** No existe ninguna: privacidad, términos y
      condiciones, aviso legal y política de cookies. Stripe las pide para
      activar una cuenta de verdad y el RGPD las exige igual. Van en
      `src/app/(public)/`, enlazadas desde `SiteFooter`.
- [ ] **Identidad fiscal del vendedor.** El pie dice «© 2026 Klima
      Solutions S.L.» y la titular es autónoma con domicilio en Canarias.
      O se constituye la sociedad o el pie miente; los datos del vendedor
      tienen que coincidir con los de las facturas que emite.
- [ ] **Stripe en real.** Hoy la clave es de pruebas, no hay ningún
      webhook dado de alta y «Sin límite» cuesta 110 € en Stripe y 119 €
      en la web. Pasos concretos en
      `2026-09-11-modo-admin-suscripciones-hacienda.md`, sección «Pasos
      manuales de Elena».
- [ ] **Régimen del IGIC confirmado por la gestoría.** Decide si se
      repercute impuesto en el cobro y qué modelo se presenta. Mientras no
      esté, `plataforma_config.cobrar_impuesto` sigue apagado.

## Importantes — se puede vender sin ello, pero duele pronto

- [ ] **Nadie se entera si algo falla.** No hay monitorización de errores
      en producción. Un fallo al emitir una factura hoy sólo lo ve quien
      lo sufre.
- [ ] **No se envía ningún correo.** Ni la factura al cliente, ni aviso de
      cobro fallido, ni recordatorio de vencimiento. En un programa de
      facturación, mandar la factura por email es de las tres cosas que
      más se piden.
- [ ] **Certificado Veri\*Factu real.** Falta el certificado y los datos
      del productor en `verifactu_config`; hasta entonces los registros se
      quedan en cola sin enviarse a la AEAT.
- [ ] **Sin integración continua.** Hay 1.318 tests y no los ejecuta nadie
      al subir cambios. Un workflow de GitHub Actions con `npm test`,
      `tsc --noEmit` y `eslint` evita que se rompa sin avisar.
- [ ] **Soporte.** No hay ninguna dirección de contacto en el sitio. Los
      planes prometen «soporte por email» y no hay email.

## Recomendable antes de anunciarlo

- [ ] **SEO mínimo:** no hay `robots.txt` ni `sitemap`, en la única página
      que tiene que posicionar.
- [ ] **Copias de seguridad:** confirmar la política de backups del plan
      de Supabase y probar una restauración. Son facturas selladas: no se
      pueden volver a generar.
- [ ] **Revisar el panel de administración en móvil.** Es lo único que no
      se ha comprobado a 375 px, porque pide sesión y segundo factor.
- [ ] **Deuda conocida:** un error de linter en `clientes/page.tsx:59`
      (`reload` se usa antes de declararse) y un test visual de plantillas
      que falla por una ruta temporal de otra sesión.

## Hecho en este repaso

- Plan **TPV** a 29 €/mes (290 €/año): tickets ilimitados y 10 facturas
  completas al mes. El reparto lo aplica la base de datos
  (`migration_043_plan_tpv.sql`), no la página.
- De paso se arregló que **el límite de plan no se aplicaba** por el
  camino normal: el trigger sólo miraba el `INSERT` de documentos que ya
  nacían emitidos, y la aplicación siempre guarda un borrador y lo emite
  con un `UPDATE`.
- Plan **Gestoría** anunciado a 15 €/empresa (mínimo 3, 12 € a partir de
  la décima), sin botón de compra hasta que exista el acceso para
  gestorías: invitación del cliente, solo lectura y panel de empresas.
- `/instalar` deja de ofrecer dos instaladores `.exe` de 92 MB que
  **daban 404** —nunca estuvieron en el repositorio— y explica cómo se
  instala desde el navegador, que es lo que la página defiende.

## Lo siguiente, si se quiere vender a gestorías

Diseñar el acceso para gestorías antes de tocar código: invitación desde
la cuenta del cliente, permiso de solo lectura (políticas RLS nuevas, no
tocar las existentes), panel con la lista de empresas y facturación por
número de empresas gestionadas en Stripe. Es la pieza grande que queda.
