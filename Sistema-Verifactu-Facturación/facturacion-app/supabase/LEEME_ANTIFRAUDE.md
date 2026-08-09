# Capa antifraude — puesta en marcha

## Por qué esto va en la base de datos

La aplicación escribe **directamente** contra Supabase usando la clave
pública. Cualquiera que abra las herramientas de desarrollo del navegador
puede llamar a la API REST y hacer peticiones que la interfaz nunca haría:
cambiar el total de una factura emitida, retroceder una fecha, reutilizar
un número o reescribir la huella.

Las validaciones en React no lo impiden: son sugerencias para el usuario
que se porta bien. Por eso todas las reglas de integridad viven en
Postgres, donde el cliente no puede saltárselas.

---

## Instalación (5 minutos)

### 1. Ejecutar la migración

Supabase → **SQL Editor** → **New query** → pega el contenido de
`migration_002_antifraude.sql` → **Run**.

Al terminar verás en la salida algo como:

```
== ANTIFRAUDE INSTALADO ==
Facturas del histórico selladas y encadenadas: 20
```

Si aparece algún `WARNING`, esas facturas no se han podido sellar (lo
habitual es que les falten líneas de detalle). Anótalas y revísalas.

### 2. Comprobar que la cadena queda íntegra

En el mismo editor:

```sql
SELECT * FROM public.verify_invoice_chain();
```

**Debe devolver 0 filas.** Si devuelve algo, la cadena ya venía rota antes
de instalar la protección: apunta el resultado, es la prueba de qué se
alteró.

### 3. Variables de entorno del servidor

Las claves secretas ya **no** se guardan en la base de datos: estaban en
una tabla que el navegador puede leer. Añádelas en tu hosting (o en
`.env.local` para desarrollo):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

- `SUPABASE_SERVICE_ROLE_KEY` la encuentras en Supabase →
  Settings → API. **Nunca** la pongas en una variable `NEXT_PUBLIC_*`:
  eso la publicaría en el navegador.
- Sin `STRIPE_WEBHOOK_SECRET` el webhook devuelve 500 y no marca nada como
  pagado. Es deliberado: antes, si faltaba el secreto, aceptaba cualquier
  POST sin firma, así que cualquiera podía marcar facturas como cobradas.

---

## Qué impide el sistema

| Intento | Qué pasa |
|---|---|
| Cambiar el importe de una factura emitida | Rechazado y registrado como `TAMPER_BLOCKED` |
| Borrar una factura emitida | Rechazado y registrado como `DELETE_BLOCKED` |
| Emitir con fecha anterior a la última factura | Rechazado (`BACKDATE_BLOCKED`) |
| Repetir un número de factura en la misma serie | Rechazado por índice único |
| Devolver una factura emitida a borrador | Rechazado (`STATUS_REVERT_BLOCKED`) |
| Alterar las líneas o el IVA de una emitida | Rechazado (`LINE_TAMPER_BLOCKED`) |
| Enviar un total que no cuadra con las líneas | Se sella el importe correcto y se registra |
| Retroceder el contador de numeración | Rechazado (`COUNTER_ROLLBACK_BLOCKED`) |
| Cambiar el NIF emisor con facturas ya emitidas | Rechazado (`NIF_CHANGE_BLOCKED`) |
| Editar o borrar el registro de eventos | Rechazado: es append-only para todos |

Todo intento bloqueado queda en `invoice_events`, que **nadie** puede
modificar ni borrar, ni siquiera el propietario de los datos.

---

## Cómo funciona la huella

Cada factura, al emitirse, recibe:

```
huella = SHA-256( NIF | número | fecha | total | huella_anterior | instante )
```

Como cada huella incluye la de la factura previa, alterar una factura
antigua invalida esa huella **y todas las posteriores**. No se puede
"recalcular por lo bajo" sin dejar rastro, porque el recálculo lo hace el
servidor y la comprobación compara lo almacenado con lo que debería ser.

La verificación completa está en la pantalla **Integridad** de la
aplicación, y también disponible como consulta SQL:

```sql
SELECT public.invoice_chain_status();   -- resumen
SELECT * FROM public.verify_invoice_chain();  -- detalle de eslabones rotos
```

---

## Cambios en el flujo de trabajo

Antes una factura se editaba siempre. Ahora hay dos estados bien
separados:

- **Borrador** — se edita libremente, no tiene valor fiscal ni huella.
- **Emitida** — sellada. No se edita ni se borra. Para corregirla:
  anularla indicando el motivo, o emitir una rectificativa.

El botón "Emitir y sellar" avisa de que es un punto de no retorno.

---

## Limitación importante

Esto implementa la **integridad de los registros**: encadenamiento,
inmutabilidad, registro de eventos y trazabilidad. Es la base que exige
el Reglamento Veri*Factu, y cubre el escenario que te preocupa (que
alguien manipule los datos y la responsabilidad recaiga sobre ti).

**No incluye** el envío telemático a la AEAT ni la firma con certificado
digital cualificado, que son piezas aparte y requieren darse de alta en
la Agencia Tributaria. La aplicación ya no afirma en ningún sitio estar
homologada: antes mostraba un hash inventado en el navegador como si
fuera una firma fiscal, y eso se ha eliminado.

Si vas a operar bajo Veri*Factu de forma oficial, confirma el alcance con
tu asesor fiscal.
