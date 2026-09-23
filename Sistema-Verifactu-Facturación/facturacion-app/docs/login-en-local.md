# Entrar en localhost y acabar en el dominio público

**Síntoma.** Abres `http://localhost:3000`, inicias sesión con Google y el
navegador te deja en `https://facturacion-app-mocha.vercel.app/dashboard`.
La sesión queda en producción y en local sigues fuera.

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

## Mientras tanto

Entrar con **email y contraseña** en local funciona sin tocar nada: ese
camino no pasa por Supabase Auth para redirigir, se queda donde estabas.

## Lo mismo pasa con el correo de confirmación

Si te das de alta desde localhost, el enlace del correo de confirmación
también lo construye Supabase con el **Site URL**, así que llevará a
producción. Es el comportamiento correcto para un correo de verdad —el
cliente no tiene un localhost— y no se arregla con la lista blanca.
