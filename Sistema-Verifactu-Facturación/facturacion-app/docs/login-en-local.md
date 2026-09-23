# Entrar en localhost y acabar en el dominio público

**Síntoma.** Abres `http://localhost:3000`, inicias sesión con Google y el
navegador te deja en el dominio público, casi siempre con esto en la barra:

```
/?error=invalid_request&error_code=flow_state_already_used
 &error_description=State+has+already+been+used
```

La sesión no se completa en ninguna de las dos partes.

## Por qué sale precisamente ese error

Entrar con Google usa PKCE: al pulsar el botón, el navegador se guarda una
**clave de un solo uso** y le manda a Supabase sólo su huella. Al volver,
hay que presentar la clave original para completar el acceso.

Esa clave vive en el navegador **para el origen que empezó el acceso** —
aquí, `localhost:3000`. Si la vuelta cae en el dominio público, la clave no
está allí: no es que se haya perdido, es que nunca estuvo. Supabase
encuentra el flujo ya consumido y contesta `flow_state_already_used`.

Por eso el error habla de un estado «ya usado» aunque sea tu primer
intento: describe lo que le pasa a Supabase, no lo que has hecho tú.

## No está en el código

Comprobado, para que nadie lo vuelva a buscar aquí:

| Camino | Qué hace | ¿Puede saltar de dominio? |
|---|---|---|
| Entrar con email y contraseña | `router.push(next)` | No. `next` está acotado a rutas relativas por `isSafeRedirectPath` |
| `proxy.ts` (sin sesión → `/login`) | `Location: /login` | No. Medido: devuelve la ruta relativa |
| `/auth/callback` | Distingue desarrollo y usa `origin` | No |
| `signInWithOAuth` | `redirectTo: ${window.location.origin}/auth/callback` | No, manda el origen real |
| `NEXT_PUBLIC_APP_URL` | Sólo `robots.ts`, `sitemap.ts` e `/instalar` | No la lee nada del login |

## Está en la configuración de Supabase

Supabase sólo respeta el `redirectTo` que le mandas **si esa dirección
está en su lista blanca**. Si no lo está, no falla ni avisa: se lo calla y
usa el **Site URL** del proyecto, que es el dominio público. De ahí el
salto.

**Cómo se arregla** (proyecto `fgonkrkyxowefabbvgsq`):

1. Entra en el panel de Supabase → **Authentication** → **URL
   Configuration**.
2. En **Redirect URLs**, añade estas dos:

   ```
   http://localhost:3000/**
   http://127.0.0.1:3000/**
   ```

3. Deja **Site URL** como está, con el dominio público: es el destino de
   los correos de confirmación y de recuperación de contraseña, y ahí sí
   tiene que apuntar a producción.
4. Guarda. No hace falta desplegar nada: es configuración del servicio de
   autenticación, no del programa.

El `/**` del final importa: permite cualquier ruta debajo, que es lo que
hace falta porque el callback lleva parámetros (`?next=`, `?code=`).

## Lo que el programa hace ahora con ese error

Antes no lo leía nadie: Supabase manda el error a la portada, donde no
había nada que lo interpretara, así que la persona se quedaba mirando la
web pública con una línea en inglés en la barra del navegador.

Ahora el proxy lleva esos parámetros a `/login` —que sí tiene dónde
contarlo— y la pantalla enseña el motivo en castellano con qué hacer. En
desarrollo, además, sale debajo la pista de que esto es la lista blanca de
Supabase, para no perder una hora buscando en el código.

Eso no arregla el acceso: lo arregla la lista blanca de arriba. Lo que
arregla es que el fallo deje de ser mudo.

## Mientras tanto

Entrar con **email y contraseña** en local funciona sin tocar nada: ese
camino no pasa por Supabase Auth para redirigir, se queda donde estabas.

## Lo mismo pasa con el correo de confirmación

Si te das de alta desde localhost, el enlace del correo de confirmación
también lo construye Supabase con el **Site URL**, así que llevará a
producción. Es el comportamiento correcto para un correo de verdad —el
cliente no tiene un localhost— y no se arregla con la lista blanca.
